import { randomUUID } from 'crypto';
import db from '../models/database';
import type { AgentRunResult } from './agentRuntime/types';
import { buildExecutionEvidenceSummary } from './executionEvidenceService';
import { createHermesSession } from './hermesSessionService';
import { recordOperationCaseEvent } from './operationCaseService';
import type { OperationCaseStatus } from './operationCaseService';
import { ensureStructuredPatchDescriptor } from './evolutionPatchService';
import { getCorrelationTrace } from './correlationTraceService';

export type EvolutionProposalType =
  | 'skill_update'
  | 'workflow_template_update'
  | 'tool_policy_update'
  | 'knowledge_update'
  | 'mcp_binding_update'
  | 'prompt_update';

export type EvolutionProposalStatus =
  | 'draft'
  | 'generated'
  | 'eval_pending'
  | 'eval_passed'
  | 'eval_failed'
  | 'approval_pending'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

export interface EvolutionProposalRecord {
  id: string;
  title: string;
  type: EvolutionProposalType;
  status: EvolutionProposalStatus;
  priority: string;
  source: string;
  source_ref: string | null;
  target_descriptor: unknown;
  proposal_body: string;
  evidence_refs: unknown;
  risk_notes: string | null;
  eval_summary: unknown;
  review_comment: string | null;
  correlation_id: string | null;
  agent_execution_id: string | null;
  hermes_session_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvolutionProposalEventRecord {
  id: string;
  proposal_id: string;
  event_type: string;
  actor_id: string | null;
  comment: string | null;
  metadata: unknown;
  created_at: string;
}

export interface VerificationFailureCandidateInput {
  task: Record<string, unknown>;
  verificationResult: {
    taskId: string;
    verified: boolean;
    expectedStatus: string;
    actualStatus: string;
    failedNodes: Array<{ nodeId: string; error: string }>;
    completedAt: unknown;
    message: string;
  };
  correlationId?: string | null;
  createdBy?: string | null;
}

export interface FeedbackDrivenProposalInput {
  sourceType: string;
  sourceId: string;
  reason: string;
  priority?: string;
  correlationId?: string | null;
  evidence?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface EvolutionProposalEnrichmentResult {
  proposal: EvolutionProposalRecord;
  mode: 'hermes' | 'deterministic_fallback';
  agentExecutionId: string | null;
  hermesSessionId: string | null;
  error: string | null;
}

const PROPOSAL_TYPES = new Set<EvolutionProposalType>([
  'skill_update',
  'workflow_template_update',
  'tool_policy_update',
  'knowledge_update',
  'mcp_binding_update',
  'prompt_update'
]);

const PROPOSAL_STATUSES = new Set<EvolutionProposalStatus>([
  'draft',
  'generated',
  'eval_pending',
  'eval_passed',
  'eval_failed',
  'approval_pending',
  'approved',
  'published',
  'rejected',
  'archived'
]);

const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const HERMES_EVOLVE_AGENT_NAME = 'Hermes 复盘进化 Agent';

export function listEvolutionProposals(filters: {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
} = {}): { proposals: EvolutionProposalRecord[]; total: number } {
  const params: unknown[] = [];
  let query = 'SELECT * FROM evolution_proposals WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM evolution_proposals WHERE 1=1';

  if (filters.status) {
    query += ' AND status = ?';
    countQuery += ' AND status = ?';
    params.push(filters.status);
  }

  if (filters.type) {
    query += ' AND type = ?';
    countQuery += ' AND type = ?';
    params.push(filters.type);
  }

  const total = (db.prepare(countQuery).get(...params) as { count: number }).count;
  const limit = clampLimit(filters.limit, 20, 100);
  const offset = Math.max(0, Number(filters.offset || 0));

  const rows = db.prepare(`
    ${query}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    proposals: rows.map(parseProposal),
    total
  };
}

export function getEvolutionProposal(id: string): EvolutionProposalRecord | null {
  const row = db.prepare('SELECT * FROM evolution_proposals WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseProposal(row) : null;
}

export function listEvolutionProposalEvents(proposalId: string): EvolutionProposalEventRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM evolution_proposal_events
    WHERE proposal_id = ?
    ORDER BY created_at ASC
  `).all(proposalId) as Array<Record<string, unknown>>;

  return rows.map(parseEvent);
}

export function createEvolutionProposal(input: {
  title: string;
  type: string;
  priority?: string;
  source?: string;
  sourceRef?: string | null;
  targetDescriptor?: unknown;
  proposalBody: string;
  evidenceRefs?: unknown;
  riskNotes?: string | null;
  correlationId?: string | null;
  agentExecutionId?: string | null;
  hermesSessionId?: string | null;
  createdBy?: string | null;
}): EvolutionProposalRecord {
  const type = normalizeType(input.type);
  const priority = normalizePriority(input.priority);
  const title = normalizeRequiredText(input.title, 'title', 160);
  const proposalBody = normalizeRequiredText(input.proposalBody, 'proposalBody', 20000);
  const targetDescriptor = ensureStructuredPatchDescriptor({
    proposalType: type,
    title,
    proposalBody,
    targetDescriptor: input.targetDescriptor,
    evidenceRefs: input.evidenceRefs
  });
  const id = randomUUID();

  db.prepare(`
    INSERT INTO evolution_proposals (
      id, title, type, status, priority, source, source_ref, target_descriptor,
      proposal_body, evidence_refs, risk_notes, correlation_id, agent_execution_id,
      hermes_session_id, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    title,
    type,
    priority,
    input.source || 'manual',
    input.sourceRef || null,
    JSON.stringify(targetDescriptor),
    proposalBody,
    JSON.stringify(input.evidenceRefs ?? null),
    normalizeOptionalText(input.riskNotes, 5000),
    normalizeOptionalText(input.correlationId, 128),
    input.agentExecutionId || null,
    input.hermesSessionId || null,
    input.createdBy || null
  );

  appendProposalEvent(id, 'created', input.createdBy || null, null, {
    source: input.source || 'manual',
    type,
    priority
  });

  const proposal = getEvolutionProposal(id)!;
  recordOperationCaseEvent({
    correlationId: proposal.correlation_id,
    eventType: 'evolution_proposal_created',
    sourceType: 'evolution_proposal',
    sourceId: proposal.id,
    nextStatus: 'evolving',
    createdBy: input.createdBy || null,
    payload: {
      title: proposal.title,
      type: proposal.type,
      priority: proposal.priority,
      source: proposal.source,
      sourceRef: proposal.source_ref
    }
  });

  return proposal;
}

export function createOrGetVerificationFailureProposal(
  input: VerificationFailureCandidateInput
): EvolutionProposalRecord {
  const taskId = input.verificationResult.taskId;
  const sourceRef = `verify_remediation:${taskId}`;
  const existing = db.prepare(`
    SELECT *
    FROM evolution_proposals
    WHERE source = 'verification_failure'
      AND source_ref = ?
      AND status NOT IN ('rejected', 'archived', 'published')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(sourceRef) as Record<string, unknown> | undefined;

  if (existing) {
    return parseProposal(existing);
  }

  const workflowId = nullableString(input.task.workflow_id);
  const evidenceRefs = buildVerificationFailureEvidence(input);
  const failedNodes = input.verificationResult.failedNodes;

  return createEvolutionProposal({
    title: `Verification failed for task ${shortId(taskId)}`,
    type: 'workflow_template_update',
    priority: failedNodes.length > 0 ? 'P1' : 'P2',
    source: 'verification_failure',
    sourceRef,
    targetDescriptor: {
      targetType: 'workflow_template',
      targetId: workflowId,
      applyMode: 'proposal_only',
      selector: {
        taskId,
        workflowId,
        reason: 'verification_failed'
      }
    },
    proposalBody: buildVerificationFailureProposalBody(input),
    evidenceRefs,
    riskNotes: 'Generated from a failed verify_remediation result. This candidate is not applied automatically and must pass review, evaluation, and approval.',
    correlationId: input.correlationId || null,
    createdBy: input.createdBy || null
  });
}

export function createOrGetFeedbackDrivenProposal(
  input: FeedbackDrivenProposalInput
): EvolutionProposalRecord {
  const sourceRef = `${input.sourceType}:${input.sourceId}`;
  const existing = db.prepare(`
    SELECT *
    FROM evolution_proposals
    WHERE source = 'feedback_failure'
      AND source_ref = ?
      AND status NOT IN ('rejected', 'archived', 'published')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(sourceRef) as Record<string, unknown> | undefined;

  if (existing) {
    return parseProposal(existing);
  }

  const proposalType = inferFeedbackProposalType(input.sourceType);
  const priority = normalizePriority(input.priority);
  const evidenceRefs = buildFeedbackEvidence(input);

  return createEvolutionProposal({
    title: buildFeedbackProposalTitle(input),
    type: proposalType,
    priority,
    source: 'feedback_failure',
    sourceRef,
    targetDescriptor: {
      targetType: inferFeedbackTargetType(proposalType),
      targetId: null,
      applyMode: 'proposal_only',
      selector: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reason: 'feedback_failure'
      }
    },
    proposalBody: buildFeedbackProposalBody(input, proposalType),
    evidenceRefs,
    riskNotes: 'Generated from real execution feedback. This candidate is proposal-only and must pass evaluation, review, approval, and release governance before any runtime effect.',
    correlationId: input.correlationId || null,
    createdBy: input.createdBy || null
  });
}

export function updateEvolutionProposalStatus(input: {
  id: string;
  status: string;
  actorId?: string | null;
  comment?: string | null;
  evalSummary?: unknown;
}): EvolutionProposalRecord {
  const status = normalizeStatus(input.status);
  const existing = getEvolutionProposal(input.id);
  if (!existing) {
    throw new Error('Evolution proposal not found');
  }

  db.prepare(`
    UPDATE evolution_proposals
    SET status = ?,
        eval_summary = COALESCE(?, eval_summary),
        review_comment = COALESCE(?, review_comment),
        reviewed_by = CASE WHEN ? IN ('approved', 'rejected', 'archived') THEN ? ELSE reviewed_by END,
        reviewed_at = CASE WHEN ? IN ('approved', 'rejected', 'archived') THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    status,
    input.evalSummary === undefined ? null : JSON.stringify(input.evalSummary),
    normalizeOptionalText(input.comment, 5000),
    status,
    input.actorId || null,
    status,
    input.id
  );

  appendProposalEvent(input.id, `status:${status}`, input.actorId || null, input.comment || null, {
    previousStatus: existing.status,
    evalSummary: input.evalSummary ?? null
  });

  const proposal = getEvolutionProposal(input.id)!;
  recordOperationCaseEvent({
    correlationId: proposal.correlation_id,
    eventType: 'evolution_proposal_status_changed',
    sourceType: 'evolution_proposal',
    sourceId: proposal.id,
    nextStatus: mapProposalStatusToCaseStatus(status),
    createdBy: input.actorId || null,
    payload: {
      title: proposal.title,
      previousStatus: existing.status,
      status,
      comment: input.comment || null
    }
  });

  return proposal;
}

export async function generateEvolutionProposal(input: {
  prompt?: string;
  type?: string;
  priority?: string;
  correlationId?: string;
  evidenceWindowHours?: number;
  createdBy?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
}): Promise<EvolutionProposalRecord> {
  const type = normalizeType(input.type || 'skill_update');
  const priority = normalizePriority(input.priority);
  const evidenceWindowHours = clampNumber(input.evidenceWindowHours, 1, 168, 24);
  const evidence = collectEvolutionEvidence({
    correlationId: input.correlationId,
    windowHours: evidenceWindowHours
  });
  const agent = db.prepare(`
    SELECT id, name
    FROM agents
    WHERE name = ?
      AND enabled = 1
    LIMIT 1
  `).get(HERMES_EVOLVE_AGENT_NAME) as { id: string; name: string } | undefined;

  if (!agent) {
    throw new Error(`${HERMES_EVOLVE_AGENT_NAME} is not enabled or not found`);
  }

  const correlationId = input.correlationId || `evolution-${randomUUID()}`;
  const evolutionPrompt = buildEvolutionPrompt({
    requestedType: type,
    priority,
    operatorPrompt: input.prompt,
    evidence,
    evidenceWindowHours
  });
  const executionId = randomUUID();
  const startTime = Date.now();
  let runResult: AgentRunResult | null = null;
  let status = 'success';
  let output = '';
  let errorMessage: string | null = null;
  const executionContext = {
    source: 'evolution_proposal',
    mode: 'review',
    userId: input.createdBy || undefined,
    userRole: input.userRole || 'operator',
    ipAddress: input.ipAddress,
    correlationId,
    agentExecutionId: executionId,
    evidenceWindowHours,
    proposalType: type
  };

  try {
    const { executeAgentRun } = await import('./agentExecutor');
    runResult = await executeAgentRun(agent.id, evolutionPrompt, executionContext);
    output = runResult.output;
  } catch (error) {
    status = 'error';
    errorMessage = error instanceof Error ? error.message : String(error);
    output = `Hermes Evolve proposal generation failed: ${errorMessage}`;
  }

  db.prepare(`
    INSERT INTO agent_executions (
      id, agent_id, agent_name, input_text, output_text, status, error_message,
      execution_time_ms, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    executionId,
    agent.id,
    agent.name,
    evolutionPrompt,
    output,
    status,
    errorMessage,
    Date.now() - startTime,
    JSON.stringify({
      source: 'evolution_proposal',
      correlationId,
      proposalType: type,
      evidenceWindowHours,
      runtime: runResult?.metadata?.runtime || 'hermes',
      runtimeMetadata: runResult?.metadata || {},
      executionEvidence: buildExecutionEvidenceSummary({
        inputText: evolutionPrompt,
        outputText: output,
        errorMessage,
        status,
        context: executionContext,
        trace: runResult?.trace || [],
        runtimeMetadata: runResult?.metadata || {},
        agentId: agent.id,
        agentName: agent.name
      }),
      trace: runResult?.trace || []
    })
  );

  const hermesSession = createHermesSession({
    agentExecutionId: executionId,
    agentId: agent.id,
    agentName: agent.name,
    mode: 'review',
    input: evolutionPrompt,
    output,
    selectedContext: {
      source: 'evolution_proposal',
      proposalType: type,
      evidenceWindowHours,
      evidenceSummary: evidence
    },
    trace: runResult?.trace || [],
    runtimeMetadata: runResult?.metadata || {},
    correlationId,
    status,
    createdBy: input.createdBy || null
  });

  const proposal = createEvolutionProposal({
    title: inferProposalTitle(output, type),
    type,
    priority,
    source: 'hermes_evolve',
    sourceRef: hermesSession.id,
    proposalBody: output,
    targetDescriptor: inferTargetDescriptor(type),
    evidenceRefs: evidence,
    riskNotes: 'Generated by Hermes Evolve. This proposal is not applied automatically and must pass evaluation and approval before publication.',
    correlationId,
    agentExecutionId: executionId,
    hermesSessionId: hermesSession.id,
    createdBy: input.createdBy || null
  });

  if (status === 'success') {
    return updateEvolutionProposalStatus({
      id: proposal.id,
      status: 'generated',
      actorId: input.createdBy || null,
      comment: 'Generated by Hermes Evolve'
    });
  }

  return proposal;
}

export async function enrichEvolutionProposal(input: {
  proposalId: string;
  actorId?: string | null;
  userRole?: string | null;
  ipAddress?: string | null;
}): Promise<EvolutionProposalEnrichmentResult> {
  const proposal = getEvolutionProposal(input.proposalId);
  if (!proposal) {
    throw new Error('Evolution proposal not found');
  }
  if (['approved', 'published', 'rejected', 'archived'].includes(proposal.status)) {
    throw new Error(`Cannot enrich proposal in ${proposal.status} status`);
  }

  const evidencePackage = collectProposalEnrichmentEvidence(proposal);
  const agent = db.prepare(`
    SELECT id, name
    FROM agents
    WHERE name = ?
      AND enabled = 1
    LIMIT 1
  `).get(HERMES_EVOLVE_AGENT_NAME) as { id: string; name: string } | undefined;

  const correlationId = proposal.correlation_id || `evolution-enrich-${randomUUID()}`;
  const prompt = buildProposalEnrichmentPrompt(proposal, evidencePackage);
  const executionId = randomUUID();
  const startTime = Date.now();
  let runResult: AgentRunResult | null = null;
  let output = '';
  let errorMessage: string | null = null;
  let executionStatus = 'success';
  let mode: EvolutionProposalEnrichmentResult['mode'] = 'hermes';
  const executionContext = {
    source: 'evolution_proposal_enrichment',
    mode: 'review',
    userId: input.actorId || undefined,
    userRole: input.userRole || 'operator',
    ipAddress: input.ipAddress,
    correlationId,
    agentExecutionId: executionId,
    proposalId: proposal.id,
    proposalType: proposal.type
  };

  try {
    if (!agent) {
      throw new Error(`${HERMES_EVOLVE_AGENT_NAME} is not enabled or not found`);
    }
    const { executeAgentRun } = await import('./agentExecutor');
    runResult = await executeAgentRun(agent.id, prompt, executionContext);
    output = runResult.output;
  } catch (error) {
    mode = 'deterministic_fallback';
    executionStatus = 'error';
    errorMessage = error instanceof Error ? error.message : String(error);
    output = buildDeterministicEnrichmentOutput(proposal, evidencePackage, errorMessage);
  }

  const agentExecutionId = agent ? executionId : null;
  if (agent) {
    db.prepare(`
      INSERT INTO agent_executions (
        id, agent_id, agent_name, input_text, output_text, status, error_message,
        execution_time_ms, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      executionId,
      agent.id,
      agent.name,
      prompt,
      output,
      executionStatus,
      errorMessage,
      Date.now() - startTime,
      JSON.stringify({
        source: 'evolution_proposal_enrichment',
        correlationId,
        proposalId: proposal.id,
        proposalType: proposal.type,
        runtime: runResult?.metadata?.runtime || 'hermes',
        runtimeMetadata: runResult?.metadata || {},
        executionEvidence: buildExecutionEvidenceSummary({
          inputText: prompt,
          outputText: output,
          errorMessage,
          status: executionStatus,
          context: executionContext,
          trace: runResult?.trace || [],
          runtimeMetadata: runResult?.metadata || {},
          agentId: agent.id,
          agentName: agent.name
        }),
        trace: runResult?.trace || []
      })
    );
  }

  const hermesSession = agent ? createHermesSession({
    agentExecutionId: executionId,
    agentId: agent.id,
    agentName: agent.name,
    mode: 'review',
    input: prompt,
    output,
    selectedContext: {
      source: 'evolution_proposal_enrichment',
      proposalId: proposal.id,
      evidencePackage
    },
    trace: runResult?.trace || [],
    runtimeMetadata: runResult?.metadata || {},
    correlationId,
    status: executionStatus,
    createdBy: input.actorId || null
  }) : null;

  const enrichedBody = mergeEnrichedProposalBody(proposal.proposal_body, output, mode);
  const enrichedEvidenceRefs = mergeProposalEvidenceRefs(proposal.evidence_refs, {
    schemaVersion: 'evolution.proposalEnrichment.v1',
    mode,
    proposalId: proposal.id,
    agentExecutionId,
    hermesSessionId: hermesSession?.id || null,
    error: errorMessage,
    evidencePackage,
    enrichedAt: new Date().toISOString()
  });
  const targetDescriptor = ensureStructuredPatchDescriptor({
    proposalType: proposal.type,
    title: proposal.title,
    proposalBody: enrichedBody,
    targetDescriptor: proposal.target_descriptor,
    evidenceRefs: enrichedEvidenceRefs
  });
  const riskNotes = buildEnrichedRiskNotes(proposal.risk_notes, mode, errorMessage);
  const nextStatus = proposal.status === 'draft' ? 'generated' : proposal.status;

  db.prepare(`
    UPDATE evolution_proposals
    SET proposal_body = ?,
        evidence_refs = ?,
        risk_notes = ?,
        target_descriptor = ?,
        status = ?,
        agent_execution_id = COALESCE(?, agent_execution_id),
        hermes_session_id = COALESCE(?, hermes_session_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    enrichedBody,
    JSON.stringify(enrichedEvidenceRefs),
    riskNotes,
    JSON.stringify(targetDescriptor),
    nextStatus,
    agentExecutionId,
    hermesSession?.id || null,
    proposal.id
  );

  appendProposalEvent(
    proposal.id,
    'enriched',
    input.actorId || null,
    mode === 'hermes'
      ? 'Proposal enriched by Hermes Evolve from candidate evidence'
      : 'Proposal enriched with deterministic fallback after Hermes Evolve failed',
    {
      mode,
      agentExecutionId,
      hermesSessionId: hermesSession?.id || null,
      error: errorMessage,
      queueItemCount: Array.isArray(evidencePackage.reviewQueue) ? evidencePackage.reviewQueue.length : 0
    }
  );

  return {
    proposal: getEvolutionProposal(proposal.id)!,
    mode,
    agentExecutionId,
    hermesSessionId: hermesSession?.id || null,
    error: errorMessage
  };
}

function inferFeedbackProposalType(sourceType: string): EvolutionProposalType {
  if (sourceType === 'tool_approval') return 'tool_policy_update';
  if (sourceType === 'task' || sourceType === 'workflow_task') return 'workflow_template_update';
  if (sourceType === 'agent_execution') return 'prompt_update';
  if (sourceType === 'worker_run') return 'skill_update';
  return 'skill_update';
}

function inferFeedbackTargetType(type: EvolutionProposalType): string {
  const targetTypeMap: Record<EvolutionProposalType, string> = {
    skill_update: 'skill',
    workflow_template_update: 'workflow_template',
    tool_policy_update: 'tool_policy',
    knowledge_update: 'knowledge',
    mcp_binding_update: 'mcp_binding',
    prompt_update: 'agent_prompt'
  };
  return targetTypeMap[type];
}

function buildFeedbackEvidence(input: FeedbackDrivenProposalInput): Record<string, unknown> {
  return sanitizeValue({
    schemaVersion: 'feedback.failure.evidence.v1',
    source: 'continuous_evolution',
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    reason: input.reason,
    priority: input.priority || 'P2',
    correlationId: input.correlationId || null,
    evidence: input.evidence || {},
    generatedAt: new Date().toISOString()
  }) as Record<string, unknown>;
}

function buildFeedbackProposalTitle(input: FeedbackDrivenProposalInput): string {
  return `Improve ${input.sourceType.replace(/_/g, ' ')} feedback ${shortId(input.sourceId)}`;
}

function buildFeedbackProposalBody(input: FeedbackDrivenProposalInput, type: EvolutionProposalType): string {
  return [
    '# Feedback-driven evolution candidate',
    '',
    '## Source feedback',
    `- Source type: ${input.sourceType}`,
    `- Source id: ${input.sourceId}`,
    `- Correlation id: ${input.correlationId || '-'}`,
    `- Reason: ${input.reason}`,
    '',
    '## Proposed improvement direction',
    buildFeedbackImprovementDirection(type, input.sourceType),
    '',
    '## Evidence to review',
    'Use the linked worker run, agent execution, task, approval, and correlation trace before accepting this proposal.',
    '',
    '## Evaluation plan',
    '- Confirm the source failure is reproducible or materially important.',
    '- Confirm the proposed change is scoped to the smallest affected skill, prompt, workflow, or policy.',
    '- Run proposal evaluation before moving to approval_pending.',
    '',
    '## Risk and rollback',
    '- This candidate is proposal-only and does not change runtime behavior.',
    '- Roll back by archiving this proposal or rolling back a later release overlay if published.'
  ].join('\n');
}

function buildFeedbackImprovementDirection(type: EvolutionProposalType, sourceType: string): string {
  if (type === 'workflow_template_update') {
    return '- Review workflow node ordering, evidence capture, approval gate, rollback plan, and verification steps for this failed task.';
  }
  if (type === 'tool_policy_update') {
    return '- Review tool policy, approval criteria, safety review wording, and operator guidance that led to the rejected approval.';
  }
  if (type === 'prompt_update') {
    return '- Review the agent system prompt and tool-use instructions so similar execution failures produce safer, more useful next steps.';
  }
  if (type === 'skill_update') {
    return `- Review the related skill guidance for ${sourceType.replace(/_/g, ' ')} and add evidence, fallback, or verification instructions.`;
  }
  return '- Review the relevant runtime capability and propose a minimal controlled improvement.';
}

function collectProposalEnrichmentEvidence(proposal: EvolutionProposalRecord): Record<string, unknown> {
  const queueItems = db.prepare(`
    SELECT id, source_type, source_id, reason, priority, status, correlation_id,
           generated_proposal_id, cluster_key, normalized_reason, created_at, reviewed_at
    FROM evolution_review_queue
    WHERE generated_proposal_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(proposal.id) as Array<Record<string, unknown>>;

  const clusterKey = queueItems.find(item => typeof item.cluster_key === 'string')?.cluster_key as string | undefined;
  const clusterItems = clusterKey ? db.prepare(`
    SELECT id, source_type, source_id, reason, priority, status, correlation_id,
           generated_proposal_id, cluster_key, normalized_reason, created_at, reviewed_at
    FROM evolution_review_queue
    WHERE cluster_key = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(clusterKey) as Array<Record<string, unknown>> : [];

  const events = db.prepare(`
    SELECT event_type, actor_id, comment, metadata, created_at
    FROM evolution_proposal_events
    WHERE proposal_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(proposal.id) as Array<Record<string, unknown>>;

  return sanitizeValue({
    schemaVersion: 'evolution.proposalEnrichmentEvidence.v1',
    proposal: {
      id: proposal.id,
      title: proposal.title,
      type: proposal.type,
      status: proposal.status,
      priority: proposal.priority,
      source: proposal.source,
      sourceRef: proposal.source_ref,
      correlationId: proposal.correlation_id,
      createdAt: proposal.created_at
    },
    targetDescriptor: proposal.target_descriptor,
    evidenceRefs: proposal.evidence_refs,
    reviewQueue: queueItems.map(formatQueueEvidenceItem),
    cluster: {
      key: clusterKey || null,
      occurrenceCount: clusterItems.length || queueItems.length,
      normalizedReason: nullableString(queueItems.find(item => item.normalized_reason)?.normalized_reason),
      samples: clusterItems.map(formatQueueEvidenceItem)
    },
    recentEvents: events.map(event => ({
      eventType: event.event_type,
      actorId: event.actor_id || null,
      comment: event.comment || null,
      metadata: parseJsonField(event.metadata, null),
      createdAt: event.created_at || null
    }))
  }) as Record<string, unknown>;
}

function formatQueueEvidenceItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: item.id,
    sourceType: item.source_type,
    sourceId: item.source_id,
    reason: item.reason,
    priority: item.priority,
    status: item.status,
    correlationId: item.correlation_id,
    clusterKey: item.cluster_key,
    normalizedReason: item.normalized_reason,
    createdAt: item.created_at
  };
}

function buildProposalEnrichmentPrompt(
  proposal: EvolutionProposalRecord,
  evidencePackage: Record<string, unknown>
): string {
  return [
    'You are Hermes Evolve. Enrich an existing evolution proposal using the candidate evidence below.',
    'Do not apply changes. Do not execute tools that alter production. Produce markdown only.',
    '',
    'Your output must include these exact sections:',
    '## Problem evidence',
    '## Proposed structured change',
    '## Evaluation plan',
    '## Risk and rollback',
    '## Release guard',
    '',
    'Rules:',
    '- Cite concrete sourceType/sourceId, correlationId, cluster key, failed node, rejected approval, or execution evidence when present.',
    '- Keep the change proposal-only and human-approved.',
    '- Prefer one minimal Skill / Workflow / Tool Policy / Prompt improvement, matching the proposal type.',
    '- Include verification steps and rollback boundary.',
    '',
    `Proposal id: ${proposal.id}`,
    `Proposal type: ${proposal.type}`,
    `Priority: ${proposal.priority}`,
    `Current title: ${proposal.title}`,
    '',
    'Current proposal body:',
    proposal.proposal_body,
    '',
    'Candidate evidence package:',
    JSON.stringify(evidencePackage, null, 2)
  ].join('\n');
}

function buildDeterministicEnrichmentOutput(
  proposal: EvolutionProposalRecord,
  evidencePackage: Record<string, unknown>,
  errorMessage: string
): string {
  const cluster = objectOrEmpty(evidencePackage.cluster);
  const queueItems = Array.isArray(evidencePackage.reviewQueue) ? evidencePackage.reviewQueue as Array<Record<string, unknown>> : [];
  const firstItem = queueItems[0] || {};
  const sourceLine = [
    firstItem.sourceType ? `sourceType=${firstItem.sourceType}` : null,
    firstItem.sourceId ? `sourceId=${firstItem.sourceId}` : null,
    firstItem.correlationId ? `correlationId=${firstItem.correlationId}` : null
  ].filter(Boolean).join(', ') || 'No queue source was available.';

  return [
    '## Problem evidence',
    `- Candidate source: ${sourceLine}`,
    `- Cluster: ${cluster.key || '-'} (${cluster.occurrenceCount || queueItems.length || 1} occurrence(s))`,
    `- Normalized reason: ${cluster.normalizedReason || firstItem.normalizedReason || firstItem.reason || proposal.title}`,
    `- Hermes enrichment fallback reason: ${errorMessage}`,
    '',
    '## Proposed structured change',
    `- Refine the ${proposal.type.replace(/_/g, ' ')} guidance using the candidate evidence above.`,
    '- Keep the improvement limited to evidence capture, operator guidance, validation, or rollback wording.',
    '- Do not apply runtime changes directly; keep this proposal in proposal_only mode.',
    '',
    '## Evaluation plan',
    '- Run deterministic proposal evaluation.',
    '- Confirm the proposal cites the failed source and cluster evidence.',
    '- Re-run or replay a representative failed case before moving to approval_pending.',
    '',
    '## Risk and rollback',
    '- Risk level: controlled proposal-only change.',
    '- Roll back by archiving this proposal or rolling back the published release overlay.',
    '',
    '## Release guard',
    '- Requires human review, deterministic evaluation, admin approval, and release versioning before any runtime effect.'
  ].join('\n');
}

function mergeEnrichedProposalBody(
  existingBody: string,
  enrichmentOutput: string,
  mode: EvolutionProposalEnrichmentResult['mode']
): string {
  const marker = '<!-- evolution-enrichment:p7d -->';
  const base = existingBody.includes(marker)
    ? existingBody.split(marker)[0].trim()
    : existingBody.trim();
  return [
    base,
    '',
    marker,
    '',
    `# P7d retrospective enrichment (${mode})`,
    '',
    enrichmentOutput.trim()
  ].join('\n').slice(0, 20000);
}

function mergeProposalEvidenceRefs(existingEvidence: unknown, enrichment: Record<string, unknown>): Record<string, unknown> {
  const existing = objectOrEmpty(existingEvidence);
  return sanitizeValue({
    ...existing,
    enrichment
  }) as Record<string, unknown>;
}

function buildEnrichedRiskNotes(existingRiskNotes: string | null, mode: EvolutionProposalEnrichmentResult['mode'], errorMessage: string | null): string {
  const notes = [
    existingRiskNotes || 'Generated from real execution feedback. This proposal remains proposal-only.',
    `P7d enrichment mode: ${mode}.`,
    errorMessage ? `Hermes enrichment error: ${errorMessage}` : null,
    'No runtime behavior is changed by enrichment. Evaluation, approval, release publication, and rollback remain required.'
  ].filter(Boolean).join(' ');
  return notes.slice(0, 5000);
}

function buildVerificationFailureEvidence(input: VerificationFailureCandidateInput): Record<string, unknown> {
  const task = input.task;
  const nodeResults = objectOrEmpty(task.node_results);

  return sanitizeValue({
    schemaVersion: 'verification.failure.evidence.v1',
    source: 'verify_remediation',
    taskId: input.verificationResult.taskId,
    workflowId: task.workflow_id || null,
    taskName: task.name || null,
    correlationId: input.correlationId || null,
    verificationResult: input.verificationResult,
    taskSnapshot: {
      status: task.status || null,
      currentNodeId: task.current_node_id || null,
      startTime: task.start_time || null,
      endTime: task.end_time || null,
      failedNodeCount: input.verificationResult.failedNodes.length,
      nodeResultKeys: Object.keys(nodeResults).slice(0, 50)
    },
    generatedAt: new Date().toISOString()
  }) as Record<string, unknown>;
}

function buildVerificationFailureProposalBody(input: VerificationFailureCandidateInput): string {
  const result = input.verificationResult;
  const failedNodeLines = result.failedNodes.length > 0
    ? result.failedNodes.map((node) => `- ${node.nodeId}: ${node.error}`).join('\n')
    : '- No failed node was reported, but task status did not match the expected status.';

  return [
    '# Verification failure retrospective candidate',
    '',
    '## Problem evidence',
    `- Task: ${result.taskId}`,
    `- Expected status: ${result.expectedStatus}`,
    `- Actual status: ${result.actualStatus}`,
    `- Verification message: ${result.message}`,
    '',
    '## Failed nodes',
    failedNodeLines,
    '',
    '## Proposed change',
    '- Review the workflow template, validation criteria, and rollback guidance for this remediation path.',
    '- Add or refine verification steps so the workflow can prove remediation success before it is reported as complete.',
    '- If the failure is caused by a missing operational precondition, encode that precheck into the workflow or related skill.',
    '',
    '## Evaluation plan',
    '- Re-run the affected workflow in a controlled environment.',
    '- Confirm verify_remediation returns verified=true for the same expected status.',
    '- Confirm failed node evidence is visible in task details and correlation trace.',
    '',
    '## Risk and rollback',
    '- This is a proposal-only candidate. No runtime behavior changes until evaluation, approval, and release publication.',
    '- Roll back by archiving this proposal or rolling back the published release version if it is later applied.'
  ].join('\n');
}

function collectEvolutionEvidence(input: {
  correlationId?: string;
  windowHours: number;
}): Record<string, unknown> {
  const params: unknown[] = [`-${input.windowHours} hours`];
  const correlationFilter = input.correlationId ? 'AND correlation_id = ?' : '';
  const correlationParams = input.correlationId ? [input.correlationId] : [];
  const escapedCorrelationPattern = input.correlationId ? `%${escapeLike(input.correlationId)}%` : null;

  const workerRuns = db.prepare(`
    SELECT id, worker_role, status, fallback_used, correlation_id, latency_ms, error, created_at
    FROM hermes_worker_runs
    WHERE created_at >= datetime('now', ?)
      ${correlationFilter}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...params, ...correlationParams);

  const hermesSessions = db.prepare(`
    SELECT id, agent_name, mode, status, correlation_id, extracted_refs, created_at
    FROM hermes_sessions
    WHERE created_at >= datetime('now', ?)
      ${correlationFilter}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...params, ...correlationParams);

  const agentExecutionRows = db.prepare(`
    SELECT id, agent_name, status, execution_time_ms, metadata, created_at
    FROM agent_executions
    WHERE created_at >= datetime('now', ?)
      ${input.correlationId ? "AND IFNULL(metadata, '') LIKE ?" : ''}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...params, ...(escapedCorrelationPattern ? [escapedCorrelationPattern] : [])) as Array<Record<string, unknown>>;

  const taskRows = db.prepare(`
    SELECT id, name, status, context, node_results, logs, created_at
    FROM tasks
    WHERE created_at >= datetime('now', ?)
      ${input.correlationId ? "AND (IFNULL(context, '') LIKE ? OR IFNULL(node_results, '') LIKE ? OR IFNULL(logs, '') LIKE ?)" : ''}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(
    ...params,
    ...(escapedCorrelationPattern ? [escapedCorrelationPattern, escapedCorrelationPattern, escapedCorrelationPattern] : [])
  ) as Array<Record<string, unknown>>;

  const approvals = db.prepare(`
    SELECT id, tool_name, status, risk_level, reason, correlation_id, requested_at, reviewed_at
    FROM tool_approvals
    WHERE requested_at >= datetime('now', ?)
      ${correlationFilter}
    ORDER BY requested_at DESC
    LIMIT 20
  `).all(...params, ...correlationParams);

  const parsedAgentExecutions = agentExecutionRows.map((execution) => {
    const metadata = parseJsonField<Record<string, unknown>>(execution.metadata, {});
    const executionEvidence = objectOrEmpty(metadata.executionEvidence);
    return {
      id: execution.id,
      agent_name: execution.agent_name,
      status: execution.status,
      execution_time_ms: execution.execution_time_ms,
      correlationId: typeof metadata.correlationId === 'string' ? metadata.correlationId : extractCorrelationId(execution.metadata),
      hasExecutionEvidence: executionEvidence.schemaVersion === 'execution.evidence.v1',
      riskLevel: nullableString(executionEvidence.riskLevel),
      traceId: nullableString(executionEvidence.traceId),
      hypothesis: nullableString(executionEvidence.hypothesis),
      created_at: execution.created_at
    };
  });
  const agentExecutionEvidence = collectAgentExecutionEvidence(agentExecutionRows);
  const taskExecutionEvidence = collectTaskExecutionEvidence(taskRows);
  const windowExecutionEvidence = [...agentExecutionEvidence, ...taskExecutionEvidence].slice(0, 50);
  const correlationTrace = input.correlationId ? safeGetCorrelationTrace(input.correlationId) : null;
  const structuredExecutionEvidence = (
    correlationTrace?.executionEvidence?.length
      ? correlationTrace.executionEvidence
      : windowExecutionEvidence
  ).map(compactExecutionEvidence).slice(0, 50);

  return sanitizeValue({
    schemaVersion: 'evolution.evidence.v2',
    windowHours: input.windowHours,
    correlationId: input.correlationId || null,
    evidencePriority: [
      'executionEvidence',
      'correlationTrace',
      'workerRuns',
      'hermesSessions',
      'agentExecutions',
      'approvals'
    ],
    executionEvidence: structuredExecutionEvidence,
    executionEvidenceSummary: correlationTrace?.executionEvidenceSummary || buildEvolutionEvidenceSummary(structuredExecutionEvidence),
    correlationTraceSummary: correlationTrace ? {
      schemaVersion: correlationTrace.executionEvidenceSummary?.schemaVersion || null,
      counts: correlationTrace.executionEvidenceSummary?.counts || {},
      riskLevels: correlationTrace.executionEvidenceSummary?.riskLevels || [],
      toolCalls: correlationTrace.executionEvidenceSummary?.toolCalls || [],
      traceIds: correlationTrace.executionEvidenceSummary?.traceIds || [],
      releaseOverlayVersionIds: correlationTrace.executionEvidenceSummary?.releaseOverlayVersionIds || [],
      latestEvidenceAt: correlationTrace.executionEvidenceSummary?.latestEvidenceAt || null
    } : null,
    workerRuns,
    hermesSessions: (hermesSessions as Array<Record<string, unknown>>).map((session) => ({
      ...session,
      extracted_refs: parseJsonField(session.extracted_refs, {})
    })),
    agentExecutions: parsedAgentExecutions,
    tasks: taskRows.map((task) => ({
      id: task.id,
      name: task.name,
      status: task.status,
      hasExecutionEvidence: collectTaskExecutionEvidence([task]).length > 0,
      created_at: task.created_at
    })),
    approvals
  }) as Record<string, unknown>;
}

function collectAgentExecutionEvidence(agentExecutions: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return agentExecutions.flatMap((execution) => {
    const metadata = parseJsonField<Record<string, unknown>>(execution.metadata, {});
    const evidence = objectOrEmpty(metadata.executionEvidence);
    if (evidence.schemaVersion !== 'execution.evidence.v1') {
      return [];
    }

    return [{
      sourceType: 'agent_execution',
      sourceId: String(execution.id || ''),
      agentName: execution.agent_name || null,
      createdAt: execution.created_at || null,
      ...evidence
    }];
  });
}

function collectTaskExecutionEvidence(tasks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return tasks.flatMap((task) => {
    const nodeResults = parseJsonField<Record<string, unknown>>(task.node_results, {});
    return Object.entries(objectOrEmpty(nodeResults)).flatMap(([nodeId, rawResult]) => {
      const result = objectOrEmpty(rawResult);
      const metadata = objectOrEmpty(result.metadata);
      const evidence = objectOrEmpty(metadata.executionEvidence);
      if (evidence.schemaVersion !== 'execution.evidence.v1') {
        return [];
      }

      return [{
        sourceType: 'workflow_node',
        sourceId: `${task.id || ''}:${nodeId}`,
        taskId: task.id || null,
        taskName: task.name || null,
        nodeId,
        createdAt: task.created_at || null,
        ...evidence
      }];
    });
  });
}

function compactExecutionEvidence(item: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: item.schemaVersion,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    agentName: item.agentName,
    taskId: item.taskId,
    taskName: item.taskName,
    nodeId: item.nodeId,
    status: item.status,
    riskLevel: item.riskLevel,
    hypothesis: item.hypothesis,
    plannedActions: item.plannedActions,
    approvalId: item.approvalId,
    taskRefId: item.taskId,
    verificationResult: item.verificationResult,
    traceId: item.traceId,
    generatedAt: item.generatedAt,
    createdAt: item.createdAt,
    evidence: compactEvidenceDetails(objectOrEmpty(item.evidence))
  };
}

function compactEvidenceDetails(evidence: Record<string, unknown>): Record<string, unknown> {
  const observedRefs = objectOrEmpty(evidence.observedRefs);
  return {
    summary: evidence.summary,
    toolCalls: normalizeStringList(evidence.toolCalls).slice(0, 20),
    releaseOverlayVersionIds: normalizeStringList(evidence.releaseOverlayVersionIds).slice(0, 10),
    observedRefs: {
      approvalIds: normalizeStringList(observedRefs.approvalIds).slice(0, 20),
      taskIds: normalizeStringList(observedRefs.taskIds).slice(0, 20),
      correlationIds: normalizeStringList(observedRefs.correlationIds).slice(0, 20)
    }
  };
}

function buildEvolutionEvidenceSummary(executionEvidence: Array<Record<string, unknown>>): Record<string, unknown> {
  const riskLevels = new Set<string>();
  const toolCalls = new Set<string>();
  const traceIds = new Set<string>();
  const approvalIds = new Set<string>();
  const taskIds = new Set<string>();

  executionEvidence.forEach((item) => {
    addString(item.riskLevel, riskLevels);
    addString(item.traceId, traceIds);
    addString(item.approvalId, approvalIds);
    addString(item.taskId, taskIds);
    const evidence = objectOrEmpty(item.evidence);
    normalizeStringList(evidence.toolCalls).forEach(tool => toolCalls.add(tool));
    const observedRefs = objectOrEmpty(evidence.observedRefs);
    normalizeStringList(observedRefs.approvalIds).forEach(id => approvalIds.add(id));
    normalizeStringList(observedRefs.taskIds).forEach(id => taskIds.add(id));
  });

  return {
    schemaVersion: 'evolution.executionEvidenceSummary.v1',
    counts: {
      executionEvidence: executionEvidence.length,
      agentExecutions: executionEvidence.filter(item => item.sourceType === 'agent_execution').length,
      workflowNodes: executionEvidence.filter(item => item.sourceType === 'workflow_node').length
    },
    riskLevels: Array.from(riskLevels),
    toolCalls: Array.from(toolCalls),
    traceIds: Array.from(traceIds),
    approvalIds: Array.from(approvalIds),
    taskIds: Array.from(taskIds)
  };
}

function buildEvolutionPrompt(input: {
  requestedType: EvolutionProposalType;
  priority: string;
  operatorPrompt?: string;
  evidence: Record<string, unknown>;
  evidenceWindowHours: number;
}): string {
  return [
    'You are Hermes Evolve. Generate one controlled evolution proposal for this AIOps platform.',
    'Do not apply changes. Do not execute production actions. Only propose a change that can later be evaluated, approved, versioned, and rolled back.',
    '',
    `Requested proposal type: ${input.requestedType}`,
    `Suggested priority: ${input.priority}`,
    `Evidence window: ${input.evidenceWindowHours} hours`,
    input.operatorPrompt ? `Operator request: ${input.operatorPrompt}` : '',
    '',
    'Return a concise proposal with these sections:',
    '1. Title',
    '2. Problem evidence',
    '3. Proposed change',
    '4. Target object',
    '5. Expected benefit',
    '6. Evaluation plan',
    '7. Risk and rollback',
    '',
    'Also make the proposal concrete enough to be converted into a structured patch:',
    '- skill_update -> skill_patch',
    '- workflow_template_update -> workflow_template_patch',
    '- tool_policy_update -> tool_policy_patch',
    '- knowledge_update -> knowledge_patch',
    '- mcp_binding_update -> mcp_binding_patch',
    '- prompt_update -> prompt_patch',
    'The patch must remain proposal_only and must require human approval before any runtime effect.',
    '',
    'Evidence snapshot:',
    JSON.stringify(input.evidence, null, 2),
    '',
    'Evidence usage rule:',
    '- Prioritize evidence_refs.executionEvidence and evidence_refs.executionEvidenceSummary over free-form trace text.',
    '- Cite sourceType/sourceId, riskLevel, hypothesis, approvalId, taskId, traceId, and verificationResult when available.'
  ].filter(Boolean).join('\n');
}

function appendProposalEvent(
  proposalId: string,
  eventType: string,
  actorId?: string | null,
  comment?: string | null,
  metadata?: unknown
): void {
  db.prepare(`
    INSERT INTO evolution_proposal_events (
      id, proposal_id, event_type, actor_id, comment, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    randomUUID(),
    proposalId,
    eventType,
    actorId || null,
    normalizeOptionalText(comment, 5000),
    JSON.stringify(metadata ?? null)
  );
}

function parseProposal(row: Record<string, unknown>): EvolutionProposalRecord {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    type: normalizeType(String(row.type || 'skill_update')),
    status: normalizeStatus(String(row.status || 'draft')),
    priority: String(row.priority || 'P2'),
    source: String(row.source || 'manual'),
    source_ref: nullableString(row.source_ref),
    target_descriptor: parseJsonField(row.target_descriptor, null),
    proposal_body: String(row.proposal_body || ''),
    evidence_refs: parseJsonField(row.evidence_refs, null),
    risk_notes: nullableString(row.risk_notes),
    eval_summary: parseJsonField(row.eval_summary, null),
    review_comment: nullableString(row.review_comment),
    correlation_id: nullableString(row.correlation_id),
    agent_execution_id: nullableString(row.agent_execution_id),
    hermes_session_id: nullableString(row.hermes_session_id),
    created_by: nullableString(row.created_by),
    reviewed_by: nullableString(row.reviewed_by),
    reviewed_at: nullableString(row.reviewed_at),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function parseEvent(row: Record<string, unknown>): EvolutionProposalEventRecord {
  return {
    id: String(row.id),
    proposal_id: String(row.proposal_id),
    event_type: String(row.event_type),
    actor_id: nullableString(row.actor_id),
    comment: nullableString(row.comment),
    metadata: parseJsonField(row.metadata, null),
    created_at: String(row.created_at || '')
  };
}

function normalizeType(value: string): EvolutionProposalType {
  if (PROPOSAL_TYPES.has(value as EvolutionProposalType)) {
    return value as EvolutionProposalType;
  }
  throw new Error(`Invalid evolution proposal type: ${value}`);
}

function normalizeStatus(value: string): EvolutionProposalStatus {
  if (PROPOSAL_STATUSES.has(value as EvolutionProposalStatus)) {
    return value as EvolutionProposalStatus;
  }
  throw new Error(`Invalid evolution proposal status: ${value}`);
}

function normalizePriority(value?: string): string {
  const priority = value || 'P2';
  if (PRIORITIES.has(priority)) {
    return priority;
  }
  throw new Error(`Invalid evolution proposal priority: ${priority}`);
}

function normalizeRequiredText(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim().slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().slice(0, maxLength);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function clampNumber(value: unknown, min: number, max: number, defaultValue: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.min(Math.max(parsed, min), max);
}

function inferProposalTitle(output: string, type: EvolutionProposalType): string {
  const titleLine = output
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .find(line => line.length > 0 && !/^title$/i.test(line));

  return (titleLine || `${type.replace(/_/g, ' ')} proposal`).slice(0, 160);
}

function inferTargetDescriptor(type: EvolutionProposalType): Record<string, string> {
  const targetTypeMap: Record<EvolutionProposalType, string> = {
    skill_update: 'skill',
    workflow_template_update: 'workflow_template',
    tool_policy_update: 'tool_policy',
    knowledge_update: 'knowledge',
    mcp_binding_update: 'mcp_binding',
    prompt_update: 'agent_prompt'
  };

  return {
    targetType: targetTypeMap[type],
    applyMode: 'proposal_only'
  };
}

function mapProposalStatusToCaseStatus(status: string): OperationCaseStatus {
  if (status === 'published') return 'closed';
  if (status === 'rejected' || status === 'archived') return 'reviewing';
  return 'evolving';
}

function extractCorrelationId(metadata: unknown): string | null {
  const parsed = parseJsonField<Record<string, unknown> | null>(metadata, null);
  return typeof parsed?.correlationId === 'string' ? parsed.correlationId : null;
}

function safeGetCorrelationTrace(correlationId: string): ReturnType<typeof getCorrelationTrace> | null {
  try {
    return getCorrelationTrace(correlationId);
  } catch {
    return null;
  }
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
}

function addString(value: unknown, target: Set<string>): void {
  if (typeof value === 'string' && value.trim()) {
    target.add(value.trim());
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\bsk-[A-Za-z0-9]{12,}\b/g, '[REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /(api[_-]?key|token|secret|password|authorization|private[_-]?key)/i.test(key) ? '[REDACTED]' : sanitizeValue(item)
    ]));
  }
  return value;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}
