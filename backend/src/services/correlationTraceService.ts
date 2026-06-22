import db from '../models/database';
import { listHermesSessionsByCorrelation } from './hermesSessionService';

export interface CorrelationTraceResult {
  correlationId: string;
  hermesSessions: Array<Record<string, unknown>>;
  agentExecutions: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  teamRuns: Array<Record<string, unknown>>;
  workerRuns: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  externalLinks: Array<Record<string, unknown>>;
  boardFeedback: Array<Record<string, unknown>>;
  executionEvidence: Array<Record<string, unknown>>;
  executionEvidenceSummary: Record<string, unknown>;
}

export function getCorrelationTrace(correlationId: string): CorrelationTraceResult {
  if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(correlationId)) {
    throw new Error('Invalid correlation id');
  }

  const pattern = `%${escapeLike(correlationId)}%`;
  const likeSql = "LIKE ? ESCAPE '\\'";

  const agentExecutions = db.prepare(`
    SELECT *
    FROM agent_executions
    WHERE IFNULL(metadata, '') ${likeSql}
    ORDER BY created_at DESC
    LIMIT 50
  `).all(pattern).map(parseAgentExecution);

  const hermesSessions = listHermesSessionsByCorrelation(correlationId) as unknown as Array<Record<string, unknown>>;

  const approvals = db.prepare(`
    SELECT *
    FROM tool_approvals
    WHERE correlation_id = ?
       OR input ${likeSql}
       OR IFNULL(execution_result, '') ${likeSql}
    ORDER BY requested_at DESC
    LIMIT 50
  `).all(correlationId, pattern, pattern).map(parseToolApproval);

  const tasks = db.prepare(`
    SELECT *
    FROM tasks
    WHERE IFNULL(context, '') ${likeSql}
       OR IFNULL(node_results, '') ${likeSql}
       OR IFNULL(logs, '') ${likeSql}
    ORDER BY created_at DESC
    LIMIT 50
  `).all(pattern, pattern, pattern).map(parseTask);

  const auditLogs = db.prepare(`
    SELECT *
    FROM audit_logs
    WHERE IFNULL(details, '') ${likeSql}
    ORDER BY created_at DESC
    LIMIT 100
  `).all(pattern).map(parseAuditLog);

  const teamRuns = db.prepare(`
    SELECT *
    FROM agent_team_runs
    WHERE correlation_id = ?
       OR IFNULL(context, '') ${likeSql}
       OR IFNULL(output, '') ${likeSql}
    ORDER BY created_at DESC
    LIMIT 50
  `).all(correlationId, pattern, pattern).map(parseTeamRun);

  const workerRuns = db.prepare(`
    SELECT *
    FROM hermes_worker_runs
    WHERE correlation_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(correlationId).map((row) => row as Record<string, unknown>);

  const proposals = db.prepare(`
    SELECT
      id, title, type, status, priority, source, source_ref, target_descriptor,
      evidence_refs, risk_notes, eval_summary, correlation_id, hermes_session_id,
      created_by, reviewed_by, reviewed_at, created_at, updated_at
    FROM evolution_proposals
    WHERE correlation_id = ?
       OR IFNULL(source_ref, '') ${likeSql}
       OR IFNULL(evidence_refs, '') ${likeSql}
       OR IFNULL(proposal_body, '') ${likeSql}
       OR IFNULL(risk_notes, '') ${likeSql}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 30
  `).all(correlationId, pattern, pattern, pattern, pattern).map(parseEvolutionProposal);

  const externalLinks = db.prepare(`
    SELECT *
    FROM hermes_external_links
    WHERE correlation_id = ?
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 30
  `).all(correlationId).map(parseExternalLink);

  const boardFeedback = db.prepare(`
    SELECT *
    FROM hermes_board_feedback
    WHERE correlation_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(correlationId).map(parseBoardFeedback);

  const executionEvidence = collectExecutionEvidence(agentExecutions, tasks);

  return {
    correlationId,
    hermesSessions,
    agentExecutions,
    approvals,
    tasks,
    auditLogs,
    teamRuns,
    workerRuns,
    proposals,
    externalLinks,
    boardFeedback,
    executionEvidence,
    executionEvidenceSummary: buildExecutionEvidenceSummary({
      correlationId,
      hermesSessions,
      agentExecutions,
      approvals,
      tasks,
      auditLogs,
      teamRuns,
      workerRuns,
      proposals,
      externalLinks,
      boardFeedback,
      executionEvidence
    })
  };
}

function collectExecutionEvidence(
  agentExecutions: Array<Record<string, unknown>>,
  tasks: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const evidenceItems: Array<Record<string, unknown>> = [];

  agentExecutions.forEach((execution) => {
    const metadata = objectOrEmpty(execution.metadata);
    const evidence = objectOrEmpty(metadata.executionEvidence);
    if (evidence.schemaVersion === 'execution.evidence.v1') {
      evidenceItems.push({
        sourceType: 'agent_execution',
        sourceId: String(execution.id || ''),
        agentName: execution.agent_name || null,
        createdAt: execution.created_at || null,
        ...evidence
      });
    }
  });

  tasks.forEach((task) => {
    const nodeResults = objectOrEmpty(task.node_results);
    Object.entries(nodeResults).forEach(([nodeId, rawResult]) => {
      const result = objectOrEmpty(rawResult);
      const metadata = objectOrEmpty(result.metadata);
      const evidence = objectOrEmpty(metadata.executionEvidence);
      if (evidence.schemaVersion === 'execution.evidence.v1') {
        evidenceItems.push({
          sourceType: 'workflow_node',
          sourceId: `${task.id || ''}:${nodeId}`,
          taskId: task.id || null,
          taskName: task.name || null,
          nodeId,
          createdAt: task.created_at || null,
          ...evidence
        });
      }
    });
  });

  return evidenceItems.slice(0, 100);
}

function buildExecutionEvidenceSummary(input: {
  correlationId: string;
  hermesSessions: Array<Record<string, unknown>>;
  agentExecutions: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  teamRuns: Array<Record<string, unknown>>;
  workerRuns: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  externalLinks: Array<Record<string, unknown>>;
  boardFeedback: Array<Record<string, unknown>>;
  executionEvidence: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  const riskLevels = new Set<string>();
  const toolCalls = new Set<string>();
  const approvalIds = new Set<string>();
  const taskIds = new Set<string>();
  const proposalIds = new Set<string>();
  const externalCardIds = new Set<string>();
  const correlationIds = new Set<string>([input.correlationId]);
  const traceIds = new Set<string>();
  const releaseOverlayVersionIds = new Set<string>();

  input.executionEvidence.forEach((item) => {
    addString(item.riskLevel, riskLevels);
    addString(item.approvalId, approvalIds);
    addString(item.taskId, taskIds);
    addString(item.correlationId, correlationIds);
    addString(item.traceId, traceIds);
    normalizeStringList(objectOrEmpty(item.evidence).toolCalls).forEach(tool => toolCalls.add(tool));
    normalizeStringList(objectOrEmpty(item.evidence).releaseOverlayVersionIds).forEach(id => releaseOverlayVersionIds.add(id));
    const observedRefs = objectOrEmpty(objectOrEmpty(item.evidence).observedRefs);
    normalizeStringList(observedRefs.approvalIds).forEach(id => approvalIds.add(id));
    normalizeStringList(observedRefs.taskIds).forEach(id => taskIds.add(id));
    normalizeStringList(observedRefs.correlationIds).forEach(id => correlationIds.add(id));
  });

  input.approvals.forEach((approval) => {
    addString(approval.id, approvalIds);
    addString(approval.correlation_id, correlationIds);
    addString(approval.risk_level, riskLevels);
  });
  input.tasks.forEach((task) => addString(task.id, taskIds));
  input.teamRuns.forEach((run) => addString(run.correlation_id, correlationIds));
  input.workerRuns.forEach((run) => addString(run.correlation_id, correlationIds));
  input.proposals.forEach((proposal) => {
    addString(proposal.id, proposalIds);
    addString(proposal.correlation_id, correlationIds);
  });
  input.externalLinks.forEach((link) => {
    addString(link.external_card_id, externalCardIds);
    addString(link.external_run_id, externalCardIds);
    addString(link.correlation_id, correlationIds);
  });
  input.boardFeedback.forEach((feedback) => {
    addString(feedback.generated_proposal_id, proposalIds);
    addString(feedback.correlation_id, correlationIds);
  });
  const evidenceTimes = input.executionEvidence
    .map(item => typeof item.generatedAt === 'string' ? item.generatedAt : null)
    .filter((item): item is string => Boolean(item))
    .sort();

  return {
    schemaVersion: 'correlation.executionEvidence.v1',
    correlationId: input.correlationId,
    counts: {
      evidence: input.executionEvidence.length,
      hermesSessions: input.hermesSessions.length,
      agentExecutions: input.agentExecutions.length,
      approvals: input.approvals.length,
      tasks: input.tasks.length,
      teamRuns: input.teamRuns.length,
      workerRuns: input.workerRuns.length,
      proposals: input.proposals.length,
      externalLinks: input.externalLinks.length,
      boardFeedback: input.boardFeedback.length,
      auditLogs: input.auditLogs.length
    },
    riskLevels: Array.from(riskLevels),
    toolCalls: Array.from(toolCalls),
    approvalIds: Array.from(approvalIds),
    taskIds: Array.from(taskIds),
    proposalIds: Array.from(proposalIds),
    externalCardIds: Array.from(externalCardIds),
    correlationIds: Array.from(correlationIds),
    traceIds: Array.from(traceIds),
    releaseOverlayVersionIds: Array.from(releaseOverlayVersionIds),
    latestEvidenceAt: evidenceTimes.length > 0 ? evidenceTimes[evidenceTimes.length - 1] : null
  };
}

function parseEvolutionProposal(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    evidence_refs: parseJson(record.evidence_refs, null),
    eval_summary: parseJson(record.eval_summary, null)
  };
}

function parseExternalLink(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    metadata: parseJson(record.metadata, null)
  };
}

function parseBoardFeedback(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    evidence_refs: parseJson(record.evidence_refs, null)
  };
}

function parseAgentExecution(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    metadata: parseJson(record.metadata, {})
  };
}

function parseToolApproval(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    input: parseJson(record.input, {}),
    execution_result: parseJson(record.execution_result, null)
  };
}

function parseTask(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    context: parseJson(record.context, {}),
    node_results: parseJson(record.node_results, null),
    logs: parseJson(record.logs, null),
    metrics: parseJson(record.metrics, null),
    execution_order: parseJson(record.execution_order, null)
  };
}

function parseTeamRun(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    context: parseJson(record.context, null)
  };
}

function parseAuditLog(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    details: parseJson(record.details, null)
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function addString(value: unknown, target: Set<string>): void {
  if (typeof value === 'string' && value.trim()) {
    target.add(value.trim());
  }
}
