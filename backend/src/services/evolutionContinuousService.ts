import { randomUUID } from 'crypto';
import { scheduleJob, Job } from 'node-schedule';
import db from '../models/database';
import { logger } from '../utils/logger';
import { evaluateEvolutionProposal } from './evolutionEvaluationService';
import {
  createOrGetFeedbackDrivenProposal,
  generateEvolutionProposal,
  updateEvolutionProposalStatus
} from './evolutionProposalService';

export type EvolutionTaskKind =
  | 'daily_review'
  | 'weekly_report'
  | 'failure_review'
  | 'rejected_approval_review'
  | 'proposal_promotion';

export interface EvolutionContinuousTaskRecord {
  id: string;
  name: string;
  kind: EvolutionTaskKind;
  schedule: string;
  description: string | null;
  enabled: number;
  last_run_at: string | null;
  last_status: string | null;
  last_result: unknown;
  created_at: string;
  updated_at: string;
}

export interface EvolutionTaskRunRecord {
  id: string;
  task_id: string;
  kind: EvolutionTaskKind;
  status: string;
  triggered_by: string | null;
  started_at: string;
  completed_at: string | null;
  generated_proposal_id: string | null;
  result_summary: unknown;
  error: string | null;
}

export interface EvolutionReviewQueueRecord {
  id: string;
  source_type: string;
  source_id: string;
  reason: string | null;
  priority: string;
  status: string;
  correlation_id: string | null;
  generated_proposal_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

class EvolutionContinuousService {
  private jobs = new Map<string, Job>();
  private runningKinds = new Set<string>();
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    try {
      const tasks = listEvolutionTasks().filter(task => task.enabled === 1);
      tasks.forEach(task => this.scheduleTask(task));
      this.initialized = true;
      logger.info(`✅ Evolution continuous service initialized with ${tasks.length} tasks`);
    } catch (error) {
      logger.warn('⚠️ Could not initialize evolution continuous service', error as Error);
    }
  }

  shutdown(): void {
    this.jobs.forEach(job => job.cancel());
    this.jobs.clear();
    this.runningKinds.clear();
    this.initialized = false;
    logger.info('🛑 Evolution continuous service stopped');
  }

  scheduleTask(task: EvolutionContinuousTaskRecord): void {
    this.cancelTask(task.id);
    if (!task.enabled) return;

    try {
      const job = scheduleJob(task.schedule, async () => {
        await this.runTask(task.id, 'scheduler');
      });
      this.jobs.set(task.id, job);
      logger.info(`✅ Evolution task scheduled: ${task.name} (${task.schedule})`);
    } catch (error) {
      logger.error(`❌ Failed to schedule evolution task ${task.name}`, error as Error);
    }
  }

  cancelTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.cancel();
      this.jobs.delete(taskId);
    }
  }

  updateTask(task: EvolutionContinuousTaskRecord): void {
    if (task.enabled) {
      this.scheduleTask(task);
    } else {
      this.cancelTask(task.id);
    }
  }

  async runTask(taskId: string, triggeredBy?: string | null): Promise<EvolutionTaskRunRecord> {
    const task = getEvolutionTask(taskId);
    if (!task) {
      throw new Error('Evolution task not found');
    }
    if (this.runningKinds.has(task.kind)) {
      throw new Error(`Evolution task kind is already running: ${task.kind}`);
    }

    const runId = randomUUID();
    db.prepare(`
      INSERT INTO evolution_task_runs (
        id, task_id, kind, status, triggered_by, started_at
      )
      VALUES (?, ?, ?, 'running', ?, CURRENT_TIMESTAMP)
    `).run(runId, task.id, task.kind, triggeredBy || null);

    this.runningKinds.add(task.kind);
    try {
      const result = await this.executeTask(task);
      db.prepare(`
        UPDATE evolution_task_runs
        SET status = 'success',
            completed_at = CURRENT_TIMESTAMP,
            generated_proposal_id = ?,
            result_summary = ?
        WHERE id = ?
      `).run(result.generatedProposalId || null, JSON.stringify(result), runId);

      db.prepare(`
        UPDATE evolution_continuous_tasks
        SET last_run_at = CURRENT_TIMESTAMP,
            last_status = 'success',
            last_result = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(result), task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(`
        UPDATE evolution_task_runs
        SET status = 'failed',
            completed_at = CURRENT_TIMESTAMP,
            error = ?
        WHERE id = ?
      `).run(message, runId);
      db.prepare(`
        UPDATE evolution_continuous_tasks
        SET last_run_at = CURRENT_TIMESTAMP,
            last_status = 'failed',
            last_result = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify({ error: message }), task.id);
      throw error;
    } finally {
      this.runningKinds.delete(task.kind);
    }

    return getEvolutionTaskRun(runId)!;
  }

  private async executeTask(task: EvolutionContinuousTaskRecord): Promise<Record<string, unknown> & { generatedProposalId?: string }> {
    switch (task.kind) {
      case 'daily_review':
        return this.generateReviewProposal({
          task,
          type: 'skill_update',
          priority: 'P2',
          evidenceWindowHours: 24,
          prompt: 'Daily review: inspect the last 24 hours of Hermes worker runs, sessions, approvals, failures, and fallbacks. Generate one controlled proposal only if evidence supports a concrete improvement.'
        });
      case 'weekly_report':
        return this.generateReviewProposal({
          task,
          type: 'workflow_template_update',
          priority: 'P2',
          evidenceWindowHours: 168,
          prompt: 'Weekly optimization report: review the last 7 days and generate one higher-level workflow, knowledge, or skill improvement proposal. Do not apply changes.'
        });
      case 'failure_review':
        return queueFailureEvidence();
      case 'rejected_approval_review':
        return queueRejectedApprovalEvidence();
      case 'proposal_promotion':
        return promoteHighValueProposals();
      default:
        throw new Error(`Unsupported evolution task kind: ${task.kind}`);
    }
  }

  private async generateReviewProposal(input: {
    task: EvolutionContinuousTaskRecord;
    type: string;
    priority: string;
    evidenceWindowHours: number;
    prompt: string;
  }): Promise<Record<string, unknown> & { generatedProposalId?: string }> {
    const proposal = await generateEvolutionProposal({
      type: input.type,
      priority: input.priority,
      evidenceWindowHours: input.evidenceWindowHours,
      prompt: input.prompt,
      createdBy: 'system',
      userRole: 'operator'
    });

    const evaluation = evaluateEvolutionProposal({
      proposalId: proposal.id,
      actorId: 'system'
    });

    if (evaluation.passed && evaluation.score >= 90 && (proposal.priority === 'P0' || proposal.priority === 'P1')) {
      updateEvolutionProposalStatus({
        id: proposal.id,
        status: 'approval_pending',
        actorId: 'system',
        comment: 'High value proposal automatically moved to approval_pending by continuous evolution task',
        evalSummary: evaluation.result_summary
      });
    }

    return {
      generatedProposalId: proposal.id,
      proposalStatus: getProposalStatus(proposal.id),
      evaluationScore: evaluation.score,
      evaluationPassed: Boolean(evaluation.passed)
    };
  }
}

export const evolutionContinuousService = new EvolutionContinuousService();

export function listEvolutionTasks(): EvolutionContinuousTaskRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM evolution_continuous_tasks
    ORDER BY
      CASE kind
        WHEN 'daily_review' THEN 1
        WHEN 'weekly_report' THEN 2
        WHEN 'failure_review' THEN 3
        WHEN 'rejected_approval_review' THEN 4
        WHEN 'proposal_promotion' THEN 5
        ELSE 6
      END
  `).all() as Array<Record<string, unknown>>;

  return rows.map(parseTask);
}

export function getEvolutionTask(id: string): EvolutionContinuousTaskRecord | null {
  const row = db.prepare('SELECT * FROM evolution_continuous_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseTask(row) : null;
}

export function updateEvolutionTask(input: {
  id: string;
  enabled?: boolean;
  schedule?: string;
}): EvolutionContinuousTaskRecord {
  const existing = getEvolutionTask(input.id);
  if (!existing) {
    throw new Error('Evolution task not found');
  }

  db.prepare(`
    UPDATE evolution_continuous_tasks
    SET enabled = COALESCE(?, enabled),
        schedule = COALESCE(?, schedule),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    input.enabled === undefined ? null : input.enabled ? 1 : 0,
    typeof input.schedule === 'string' && input.schedule.trim() ? input.schedule.trim() : null,
    input.id
  );

  const updated = getEvolutionTask(input.id)!;
  evolutionContinuousService.updateTask(updated);
  return updated;
}

export function listEvolutionTaskRuns(limit = 50): EvolutionTaskRunRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM evolution_task_runs
    ORDER BY started_at DESC
    LIMIT ?
  `).all(clampLimit(limit, 50, 200)) as Array<Record<string, unknown>>;

  return rows.map(parseRun);
}

export function getEvolutionTaskRun(id: string): EvolutionTaskRunRecord | null {
  const row = db.prepare('SELECT * FROM evolution_task_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseRun(row) : null;
}

export function listEvolutionReviewQueue(filters: {
  status?: string;
  limit?: number;
} = {}): EvolutionReviewQueueRecord[] {
  const params: unknown[] = [];
  let query = 'SELECT * FROM evolution_review_queue WHERE 1=1';
  if (filters.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(clampLimit(filters.limit, 50, 200));

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(parseQueueItem);
}

function queueFailureEvidence(): Record<string, unknown> {
  let queued = 0;
  let generated = 0;
  const proposalIds = new Set<string>();
  const workerRuns = db.prepare(`
    SELECT id, worker_role, status, correlation_id, error
    FROM hermes_worker_runs
    WHERE created_at >= datetime('now', '-24 hours')
      AND (status IN ('failed', 'fallback') OR fallback_used = 1)
    ORDER BY created_at DESC
    LIMIT 50
  `).all() as Array<Record<string, unknown>>;

  workerRuns.forEach((run) => {
    const result = enqueueReviewItem({
      sourceType: 'worker_run',
      sourceId: String(run.id),
      reason: `${run.worker_role || 'worker'} ${run.status || 'unknown'}${run.error ? `: ${run.error}` : ''}`,
      priority: run.status === 'failed' ? 'P1' : 'P2',
      correlationId: nullableString(run.correlation_id),
      evidence: run
    });
    queued += result.queued;
    generated += result.generated;
    addString(result.proposalId, proposalIds);
  });

  const executions = db.prepare(`
    SELECT id, agent_name, error_message, metadata
    FROM agent_executions
    WHERE created_at >= datetime('now', '-24 hours')
      AND status = 'error'
    ORDER BY created_at DESC
    LIMIT 50
  `).all() as Array<Record<string, unknown>>;

  executions.forEach((execution) => {
    const result = enqueueReviewItem({
      sourceType: 'agent_execution',
      sourceId: String(execution.id),
      reason: `${execution.agent_name || 'Agent'} execution failed${execution.error_message ? `: ${execution.error_message}` : ''}`,
      priority: 'P1',
      correlationId: extractCorrelationId(execution.metadata),
      evidence: {
        ...execution,
        metadata: parseJsonField(execution.metadata, null)
      }
    });
    queued += result.queued;
    generated += result.generated;
    addString(result.proposalId, proposalIds);
  });

  const tasks = db.prepare(`
    SELECT id, workflow_id, name, status, current_node_id, node_results, logs, context
    FROM tasks
    WHERE created_at >= datetime('now', '-24 hours')
      AND status IN ('failed', 'error')
    ORDER BY created_at DESC
    LIMIT 50
  `).all() as Array<Record<string, unknown>>;

  tasks.forEach((task) => {
    const nodeResults = parseJsonField<Record<string, unknown>>(task.node_results, {});
    const failedNodes = Object.entries(nodeResults)
      .filter(([, value]) => objectOrEmpty(value).status === 'failed')
      .map(([nodeId, value]) => ({
        nodeId,
        error: nullableString(objectOrEmpty(value).error) || 'Node failed'
      }));
    const result = enqueueReviewItem({
      sourceType: 'task',
      sourceId: String(task.id),
      reason: `${task.name || 'workflow task'} ${task.status || 'failed'}${failedNodes.length ? `: ${failedNodes.map(node => node.nodeId).join(', ')}` : ''}`,
      priority: failedNodes.length > 0 ? 'P1' : 'P2',
      correlationId: extractCorrelationIdFromTask(task),
      evidence: {
        ...task,
        context: parseJsonField(task.context, null),
        logs: parseJsonField(task.logs, []),
        node_results: nodeResults,
        failedNodes
      }
    });
    queued += result.queued;
    generated += result.generated;
    addString(result.proposalId, proposalIds);
  });

  return {
    queued,
    generated,
    generatedProposalId: Array.from(proposalIds)[0] || undefined,
    proposalIds: Array.from(proposalIds),
    workerRunCandidates: workerRuns.length,
    agentExecutionCandidates: executions.length,
    taskCandidates: tasks.length
  };
}

function queueRejectedApprovalEvidence(): Record<string, unknown> {
  let queued = 0;
  let generated = 0;
  const proposalIds = new Set<string>();
  const approvals = db.prepare(`
    SELECT id, tool_name, risk_level, reason, status, correlation_id, review_comment, input
    FROM tool_approvals
    WHERE requested_at >= datetime('now', '-24 hours')
      AND status = 'rejected'
    ORDER BY requested_at DESC
    LIMIT 50
  `).all() as Array<Record<string, unknown>>;

  approvals.forEach((approval) => {
    const result = enqueueReviewItem({
      sourceType: 'tool_approval',
      sourceId: String(approval.id),
      reason: `${approval.tool_name || 'tool'} approval rejected: ${approval.reason || approval.risk_level || 'no reason recorded'}`,
      priority: approval.risk_level === 'high_risk' || approval.risk_level === 'destructive' ? 'P1' : 'P2',
      correlationId: nullableString(approval.correlation_id),
      evidence: {
        ...approval,
        input: parseJsonField(approval.input, {})
      }
    });
    queued += result.queued;
    generated += result.generated;
    addString(result.proposalId, proposalIds);
  });

  return {
    queued,
    generated,
    generatedProposalId: Array.from(proposalIds)[0] || undefined,
    proposalIds: Array.from(proposalIds),
    rejectedApprovalCandidates: approvals.length
  };
}

function promoteHighValueProposals(): Record<string, unknown> {
  const rows = db.prepare(`
    SELECT p.id, p.priority, e.score
    FROM evolution_proposals p
    INNER JOIN (
      SELECT proposal_id, MAX(created_at) AS latest_created_at
      FROM evolution_proposal_evaluations
      GROUP BY proposal_id
    ) latest ON latest.proposal_id = p.id
    INNER JOIN evolution_proposal_evaluations e
      ON e.proposal_id = latest.proposal_id
     AND e.created_at = latest.latest_created_at
    WHERE p.status = 'eval_passed'
      AND e.passed = 1
      AND (e.score >= 90 OR p.priority IN ('P0', 'P1'))
    ORDER BY e.score DESC
    LIMIT 20
  `).all() as Array<{ id: string; priority: string; score: number }>;

  rows.forEach((row) => {
    updateEvolutionProposalStatus({
      id: row.id,
      status: 'approval_pending',
      actorId: 'system',
      comment: `Continuous evolution promoted high-value proposal (score=${row.score}, priority=${row.priority})`
    });
  });

  return {
    promoted: rows.length,
    proposalIds: rows.map(row => row.id)
  };
}

function enqueueReviewItem(input: {
  sourceType: string;
  sourceId: string;
  reason: string;
  priority: string;
  correlationId?: string | null;
  evidence?: Record<string, unknown>;
}): { queued: number; generated: number; proposalId: string | null } {
  const result = db.prepare(`
    INSERT OR IGNORE INTO evolution_review_queue (
      id, source_type, source_id, reason, priority, status, correlation_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, 'queued', ?, CURRENT_TIMESTAMP)
  `).run(
    randomUUID(),
    input.sourceType,
    input.sourceId,
    input.reason,
    input.priority,
    input.correlationId || null
  );

  const proposal = createOrGetFeedbackDrivenProposal({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    reason: input.reason,
    priority: input.priority,
    correlationId: input.correlationId || null,
    evidence: input.evidence || {},
    createdBy: 'system'
  });

  db.prepare(`
    UPDATE evolution_review_queue
    SET generated_proposal_id = ?,
        status = CASE WHEN status = 'queued' THEN 'proposal_generated' ELSE status END,
        reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP)
    WHERE source_type = ?
      AND source_id = ?
      AND (generated_proposal_id IS NULL OR generated_proposal_id = ?)
  `).run(proposal.id, input.sourceType, input.sourceId, proposal.id);

  return {
    queued: result.changes,
    generated: 1,
    proposalId: proposal.id
  };
}

function getProposalStatus(proposalId: string): string | null {
  const row = db.prepare('SELECT status FROM evolution_proposals WHERE id = ?').get(proposalId) as { status: string } | undefined;
  return row?.status || null;
}

function parseTask(row: Record<string, unknown>): EvolutionContinuousTaskRecord {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    kind: String(row.kind || 'daily_review') as EvolutionTaskKind,
    schedule: String(row.schedule || ''),
    description: nullableString(row.description),
    enabled: Number(row.enabled ?? 1),
    last_run_at: nullableString(row.last_run_at),
    last_status: nullableString(row.last_status),
    last_result: parseJsonField(row.last_result, null),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function parseRun(row: Record<string, unknown>): EvolutionTaskRunRecord {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    kind: String(row.kind || 'daily_review') as EvolutionTaskKind,
    status: String(row.status || 'unknown'),
    triggered_by: nullableString(row.triggered_by),
    started_at: String(row.started_at || ''),
    completed_at: nullableString(row.completed_at),
    generated_proposal_id: nullableString(row.generated_proposal_id),
    result_summary: parseJsonField(row.result_summary, null),
    error: nullableString(row.error)
  };
}

function parseQueueItem(row: Record<string, unknown>): EvolutionReviewQueueRecord {
  return {
    id: String(row.id),
    source_type: String(row.source_type || ''),
    source_id: String(row.source_id || ''),
    reason: nullableString(row.reason),
    priority: String(row.priority || 'P2'),
    status: String(row.status || 'queued'),
    correlation_id: nullableString(row.correlation_id),
    generated_proposal_id: nullableString(row.generated_proposal_id),
    created_at: String(row.created_at || ''),
    reviewed_at: nullableString(row.reviewed_at)
  };
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

function extractCorrelationId(metadata: unknown): string | null {
  const parsed = parseJsonField<Record<string, unknown> | null>(metadata, null);
  return typeof parsed?.correlationId === 'string' ? parsed.correlationId : null;
}

function extractCorrelationIdFromTask(task: Record<string, unknown>): string | null {
  const context = parseJsonField<Record<string, unknown> | null>(task.context, null);
  const logs = parseJsonField<unknown[]>(task.logs, []);
  const nodeResults = parseJsonField<Record<string, unknown>>(task.node_results, {});
  return findStringField(context, 'correlationId')
    || findStringField(logs, 'correlationId')
    || findStringField(nodeResults, 'correlationId');
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function findStringField(value: unknown, key: string, depth = 0): string | null {
  if (depth > 8 || !value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, key, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = nullableString(record[key]);
  if (direct) return direct;

  for (const child of Object.values(record)) {
    const found = findStringField(child, key, depth + 1);
    if (found) return found;
  }

  return null;
}

function addString(value: unknown, target: Set<string>): void {
  if (typeof value === 'string' && value.trim()) {
    target.add(value.trim());
  }
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}
