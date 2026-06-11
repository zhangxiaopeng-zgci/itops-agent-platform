import { randomUUID } from 'crypto';
import db from '../models/database';
import { executeAgentRun } from './agentExecutor';
import { AgentRunResult } from './agentRuntime/types';
import { createHermesSession } from './hermesSessionService';
import { ensureStructuredPatchDescriptor } from './evolutionPatchService';

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

  return getEvolutionProposal(id)!;
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

  return getEvolutionProposal(input.id)!;
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

  try {
    runResult = await executeAgentRun(agent.id, evolutionPrompt, {
      source: 'evolution_proposal',
      mode: 'review',
      userId: input.createdBy || undefined,
      userRole: input.userRole || 'operator',
      ipAddress: input.ipAddress,
      correlationId,
      agentExecutionId: executionId,
      evidenceWindowHours,
      proposalType: type
    });
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

function collectEvolutionEvidence(input: {
  correlationId?: string;
  windowHours: number;
}): Record<string, unknown> {
  const params: unknown[] = [`-${input.windowHours} hours`];
  const correlationFilter = input.correlationId ? 'AND correlation_id = ?' : '';
  const correlationParams = input.correlationId ? [input.correlationId] : [];

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

  const agentExecutions = db.prepare(`
    SELECT id, agent_name, status, execution_time_ms, metadata, created_at
    FROM agent_executions
    WHERE created_at >= datetime('now', ?)
      ${input.correlationId ? "AND IFNULL(metadata, '') LIKE ?" : ''}
    ORDER BY created_at DESC
    LIMIT 20
  `).all(...params, ...(input.correlationId ? [`%${escapeLike(input.correlationId)}%`] : []));

  const approvals = db.prepare(`
    SELECT id, tool_name, status, risk_level, reason, correlation_id, requested_at, reviewed_at
    FROM tool_approvals
    WHERE requested_at >= datetime('now', ?)
      ${correlationFilter}
    ORDER BY requested_at DESC
    LIMIT 20
  `).all(...params, ...correlationParams);

  return sanitizeValue({
    windowHours: input.windowHours,
    correlationId: input.correlationId || null,
    workerRuns,
    hermesSessions: (hermesSessions as Array<Record<string, unknown>>).map((session) => ({
      ...session,
      extracted_refs: parseJsonField(session.extracted_refs, {})
    })),
    agentExecutions: (agentExecutions as Array<Record<string, unknown>>).map((execution) => ({
      id: execution.id,
      agent_name: execution.agent_name,
      status: execution.status,
      execution_time_ms: execution.execution_time_ms,
      correlationId: extractCorrelationId(execution.metadata),
      created_at: execution.created_at
    })),
    approvals
  }) as Record<string, unknown>;
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
    JSON.stringify(input.evidence, null, 2)
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

function extractCorrelationId(metadata: unknown): string | null {
  const parsed = parseJsonField<Record<string, unknown> | null>(metadata, null);
  return typeof parsed?.correlationId === 'string' ? parsed.correlationId : null;
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
