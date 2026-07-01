import { randomUUID } from 'crypto';
import db from '../models/database';
import { createAuditLog } from './auditService';

export type OperationCaseStatus =
  | 'diagnosing'
  | 'diagnosis_ready'
  | 'approval_pending'
  | 'executing'
  | 'verifying'
  | 'reviewing'
  | 'evolving'
  | 'closed'
  | 'cancelled';

export interface OperationCaseRecord {
  id: string;
  title: string;
  case_type: string;
  status: OperationCaseStatus;
  severity: string | null;
  source: string;
  asset_id: string | null;
  asset_type: string | null;
  asset_name: string | null;
  alert_id: string | null;
  correlation_id: string;
  server_ids: string[];
  context: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface OperationCaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export type OperationCasePipelineStatus = 'waiting' | 'active' | 'done' | 'failed';

export interface OperationCasePipelineStep {
  key: 'detect' | 'diagnose' | 'approval' | 'execute' | 'verify' | 'review';
  status: OperationCasePipelineStatus;
  startedAt: string | null;
  finishedAt: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  recommendedNextAction: {
    type: string;
    target?: string | null;
    reason: string;
  };
}

interface CorrelationTraceLike {
  hermesSessions?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  proposals?: Array<Record<string, unknown>>;
  executionEvidence?: Array<Record<string, unknown>>;
}

export interface CreateOperationCaseInput {
  title?: string;
  caseType?: string;
  status?: OperationCaseStatus;
  severity?: string | null;
  source?: string;
  assetId?: string | null;
  assetType?: string | null;
  assetName?: string | null;
  alertId?: string | null;
  correlationId?: string | null;
  serverIds?: string[];
  context?: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  createdBy?: string | null;
}

export interface AddOperationCaseEventInput {
  caseId: string;
  eventType: string;
  sourceType?: string | null;
  sourceId?: string | null;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}

export interface RecordOperationCaseEventInput {
  caseId?: string | null;
  correlationId?: string | null;
  eventType: string;
  sourceType?: string | null;
  sourceId?: string | null;
  payload?: Record<string, unknown>;
  nextStatus?: OperationCaseStatus | null;
  createdBy?: string | null;
}

export function createOperationCase(input: CreateOperationCaseInput): OperationCaseRecord {
  const id = randomUUID();
  const correlationId = normalizeCorrelationId(input.correlationId) || `case-${id}`;
  const title = input.title?.trim() || buildDefaultTitle(input);
  const serverIds = Array.isArray(input.serverIds) ? Array.from(new Set(input.serverIds.filter(Boolean))) : [];
  const context = input.context || {};
  const summary = input.summary || null;

  db.prepare(`
    INSERT INTO operation_cases (
      id, title, case_type, status, severity, source, asset_id, asset_type, asset_name,
      alert_id, correlation_id, server_ids, context, summary, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    input.caseType || 'incident',
    input.status || 'diagnosing',
    input.severity || null,
    input.source || 'diagnosis_center',
    input.assetId || null,
    input.assetType || null,
    input.assetName || null,
    input.alertId || null,
    correlationId,
    JSON.stringify(serverIds),
    JSON.stringify(context),
    summary ? JSON.stringify(summary) : null,
    input.createdBy || null
  );

  addOperationCaseEvent({
    caseId: id,
    eventType: 'case_created',
    sourceType: input.source || 'diagnosis_center',
    sourceId: input.alertId || input.assetId || null,
    correlationId,
    payload: {
      title,
      status: input.status || 'diagnosing',
      assetId: input.assetId || null,
      assetType: input.assetType || null,
      alertId: input.alertId || null,
      serverIds
    },
    createdBy: input.createdBy || null
  });

  createAuditLog({
    user_id: input.createdBy || undefined,
    action: 'operation_case_created',
    resource_type: 'operation_case',
    resource_id: id,
    details: { correlationId, title, source: input.source || 'diagnosis_center' }
  });

  const created = getOperationCase(id);
  if (!created) {
    throw new Error('Failed to create operation case');
  }
  return created;
}

export function listOperationCases(options: {
  status?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
} = {}): { cases: OperationCaseRecord[]; total: number } {
  let query = 'FROM operation_cases WHERE 1=1';
  const params: unknown[] = [];

  if (options.status) {
    query += ' AND status = ?';
    params.push(options.status);
  }

  if (options.correlationId) {
    query += ' AND correlation_id = ?';
    params.push(options.correlationId);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count ${query}`).get(...params) as { count: number }).count;
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const offset = Math.max(options.offset || 0, 0);
  const rows = db.prepare(`
    SELECT *
    ${query}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    cases: rows.map(parseOperationCase),
    total
  };
}

export function getOperationCase(id: string): OperationCaseRecord | null {
  const row = db.prepare('SELECT * FROM operation_cases WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseOperationCase(row) : null;
}

export function getOperationCaseByCorrelation(correlationId: string): OperationCaseRecord | null {
  const row = db.prepare('SELECT * FROM operation_cases WHERE correlation_id = ?').get(correlationId) as Record<string, unknown> | undefined;
  return row ? parseOperationCase(row) : null;
}

export function listOperationCaseEvents(caseId: string): OperationCaseEvent[] {
  const rows = db.prepare(`
    SELECT *
    FROM operation_case_events
    WHERE case_id = ?
    ORDER BY created_at ASC, rowid ASC
  `).all(caseId) as Array<Record<string, unknown>>;
  return rows.map(parseOperationCaseEvent);
}

export function addOperationCaseEvent(input: AddOperationCaseEventInput): OperationCaseEvent {
  const existing = getOperationCase(input.caseId);
  if (!existing) {
    throw new Error('Operation case not found');
  }

  const id = randomUUID();
  const correlationId = input.correlationId || existing.correlation_id;
  db.prepare(`
    INSERT INTO operation_case_events (
      id, case_id, event_type, source_type, source_id, correlation_id, payload, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.caseId,
    input.eventType,
    input.sourceType || null,
    input.sourceId || null,
    correlationId,
    JSON.stringify(input.payload || {}),
    input.createdBy || null
  );

  db.prepare('UPDATE operation_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(input.caseId);

  const event = db.prepare('SELECT * FROM operation_case_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!event) {
    throw new Error('Failed to create operation case event');
  }
  return parseOperationCaseEvent(event);
}

export function updateOperationCaseStatus(input: {
  id: string;
  status: OperationCaseStatus;
  summary?: Record<string, unknown> | null;
  createdBy?: string | null;
}): OperationCaseRecord {
  const existing = getOperationCase(input.id);
  if (!existing) {
    throw new Error('Operation case not found');
  }

  const closedAt = input.status === 'closed' || input.status === 'cancelled' ? 'CURRENT_TIMESTAMP' : 'NULL';
  db.prepare(`
    UPDATE operation_cases
    SET status = ?,
        summary = COALESCE(?, summary),
        updated_at = CURRENT_TIMESTAMP,
        closed_at = ${closedAt}
    WHERE id = ?
  `).run(
    input.status,
    input.summary ? JSON.stringify(input.summary) : null,
    input.id
  );

  addOperationCaseEvent({
    caseId: input.id,
    eventType: 'status_changed',
    correlationId: existing.correlation_id,
    payload: { from: existing.status, to: input.status, summary: input.summary || null },
    createdBy: input.createdBy || null
  });

  const updated = getOperationCase(input.id);
  if (!updated) {
    throw new Error('Failed to update operation case');
  }
  return updated;
}

export function listOperationCasesByCorrelation(correlationId: string): OperationCaseRecord[] {
  return listOperationCases({ correlationId, limit: 20 }).cases;
}

export function recordOperationCaseEvent(input: RecordOperationCaseEventInput): OperationCaseEvent | null {
  const operationCase = input.caseId
    ? getOperationCase(input.caseId)
    : input.correlationId
      ? getOperationCaseByCorrelation(input.correlationId)
      : null;

  if (!operationCase) {
    return null;
  }

  const nextStatus = input.nextStatus || inferNextStatus(input.eventType, input.payload);
  const canAutoAdvance = !['closed', 'cancelled'].includes(operationCase.status) || Boolean(input.nextStatus);

  if (nextStatus && canAutoAdvance && operationCase.status !== nextStatus) {
    const closedAt = nextStatus === 'closed' || nextStatus === 'cancelled' ? 'CURRENT_TIMESTAMP' : 'NULL';
    db.prepare(`
      UPDATE operation_cases
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP,
          closed_at = ${closedAt}
      WHERE id = ?
    `).run(nextStatus, operationCase.id);
  } else {
    db.prepare('UPDATE operation_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(operationCase.id);
  }

  return addOperationCaseEvent({
    caseId: operationCase.id,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    correlationId: input.correlationId || operationCase.correlation_id,
    payload: {
      ...(input.payload || {}),
      previousStatus: operationCase.status,
      nextStatus: nextStatus || operationCase.status
    },
    createdBy: input.createdBy || null
  });
}

export function buildOperationCasePipeline(
  operationCase: OperationCaseRecord,
  events: OperationCaseEvent[],
  trace?: CorrelationTraceLike
): OperationCasePipelineStep[] {
  const hermesSessions = toRecordArray(trace?.hermesSessions);
  const approvals = toRecordArray(trace?.approvals);
  const tasks = toRecordArray(trace?.tasks);
  const proposals = toRecordArray(trace?.proposals);
  const executionEvidence = toRecordArray(trace?.executionEvidence);

  const eventMatches = (matcher: (event: OperationCaseEvent) => boolean) => events.filter(matcher);
  const hasEvent = (matcher: (event: OperationCaseEvent) => boolean) => eventMatches(matcher).length > 0;
  const latestEventTime = (matcher: (event: OperationCaseEvent) => boolean) => latestTime(eventMatches(matcher).map((event) => event.created_at));
  const latestRecordTime = (records: Array<Record<string, unknown>>) => latestTime(records.map(readRecordTime));
  const statusIndex = statusOrderForPipeline.indexOf(operationCase.status);
  const hasReached = (status: OperationCaseStatus) => statusIndex >= statusOrderForPipeline.indexOf(status) && statusIndex >= 0;

  const pendingApprovals = approvals.filter((item) => readRecordString(item, 'status') === 'pending');
  const failedApprovals = approvals.filter((item) => ['failed', 'rejected'].includes(readRecordString(item, 'status') || ''));
  const completedApprovals = approvals.filter((item) => ['approved', 'executed'].includes(readRecordString(item, 'status') || ''));
  const activeTasks = tasks.filter((item) => ['pending', 'running', 'paused'].includes(readRecordString(item, 'status') || ''));
  const failedTasks = tasks.filter((item) => readRecordString(item, 'status') === 'failed');
  const completedTasks = tasks.filter((item) => readRecordString(item, 'status') === 'completed');
  const hermesFailed = hasEvent((event) => event.event_type === 'hermes_session_failed');
  const hermesDone = hasEvent((event) => event.event_type.includes('hermes') && event.event_type !== 'hermes_session_failed') || hermesSessions.length > 0;
  const verificationFailed = hasEvent((event) => event.event_type === 'remediation_verification_failed');
  const verificationPassed = hasEvent((event) => event.event_type === 'remediation_verification_passed');
  const reviewDone = hasEvent((event) => event.event_type === 'hermes_retrospective_completed');

  return [
    {
      key: 'detect',
      status: 'done',
      startedAt: operationCase.created_at,
      finishedAt: operationCase.created_at,
      inputs: {
        source: operationCase.source,
        assetId: operationCase.asset_id,
        assetType: operationCase.asset_type,
        alertId: operationCase.alert_id,
      },
      outputs: {
        assetName: operationCase.asset_name || operationCase.asset_id || operationCase.source,
        correlationId: operationCase.correlation_id,
      },
      evidence: eventEvidence(events.filter((event) => event.event_type === 'case_created')),
      recommendedNextAction: {
        type: 'diagnose',
        target: operationCase.id,
        reason: 'Case exists and can continue into Hermes diagnosis.',
      },
    },
    {
      key: 'diagnose',
      status: hermesFailed ? 'failed' : hermesDone || hasReached('diagnosis_ready') ? 'done' : operationCase.status === 'diagnosing' ? 'active' : 'waiting',
      startedAt: latestTime([latestEventTime((event) => event.event_type.includes('hermes')), latestRecordTime(hermesSessions)]),
      finishedAt: hermesDone ? latestTime([latestEventTime((event) => event.event_type.includes('hermes')), latestRecordTime(hermesSessions)]) : null,
      inputs: {
        hermesSessions: hermesSessions.length,
      },
      outputs: {
        sessions: hermesSessions.length,
        evidence: executionEvidence.length,
      },
      evidence: eventEvidence(eventMatches((event) => event.event_type.includes('hermes'))).concat(recordEvidence('hermes_session', hermesSessions)),
      recommendedNextAction: {
        type: hermesFailed ? 'inspect_hermes_failure' : 'continue_diagnosis',
        target: operationCase.id,
        reason: hermesDone ? 'Diagnosis evidence is available.' : 'Hermes diagnosis should collect evidence and risk.',
      },
    },
    {
      key: 'approval',
      status: failedApprovals.length > 0 ? 'failed' : pendingApprovals.length > 0 ? 'active' : completedApprovals.length > 0 ? 'done' : 'waiting',
      startedAt: latestTime([latestEventTime((event) => event.event_type.includes('approval')), latestRecordTime(approvals)]),
      finishedAt: completedApprovals.length > 0 ? latestTime([latestEventTime((event) => event.event_type.includes('approval')), latestRecordTime(completedApprovals)]) : null,
      inputs: {
        approvalRequired: approvals.length > 0,
      },
      outputs: {
        pending: pendingApprovals.length,
        failed: failedApprovals.length,
        total: approvals.length,
      },
      evidence: eventEvidence(eventMatches((event) => event.event_type.includes('approval'))).concat(recordEvidence('approval', approvals)),
      recommendedNextAction: {
        type: pendingApprovals.length > 0 ? 'handle_approval' : 'review_approval_state',
        target: readRecordString(pendingApprovals[0] || {}, 'id'),
        reason: pendingApprovals.length > 0 ? 'A tool approval is waiting for human confirmation.' : 'No pending approval is blocking execution.',
      },
    },
    {
      key: 'execute',
      status: failedTasks.length > 0 ? 'failed' : activeTasks.length > 0 ? 'active' : completedTasks.length > 0 ? 'done' : operationCase.status === 'executing' ? 'active' : 'waiting',
      startedAt: latestTime([latestEventTime((event) => event.event_type.includes('task') || event.event_type.includes('workflow')), latestRecordTime(tasks)]),
      finishedAt: completedTasks.length > 0 ? latestTime([latestEventTime((event) => event.event_type.includes('task') || event.event_type.includes('workflow')), latestRecordTime(completedTasks)]) : null,
      inputs: {
        taskCount: tasks.length,
      },
      outputs: {
        active: activeTasks.length,
        completed: completedTasks.length,
        failed: failedTasks.length,
      },
      evidence: eventEvidence(eventMatches((event) => event.event_type.includes('task') || event.event_type.includes('workflow'))).concat(recordEvidence('task', tasks)),
      recommendedNextAction: {
        type: failedTasks.length > 0 ? 'inspect_failed_task' : activeTasks.length > 0 ? 'track_task' : 'prepare_execution',
        target: readRecordString((failedTasks[0] || activeTasks[0] || {}), 'id'),
        reason: failedTasks.length > 0 ? 'A linked task failed.' : activeTasks.length > 0 ? 'A linked task is still active.' : 'No execution task is currently active.',
      },
    },
    {
      key: 'verify',
      status: verificationFailed ? 'failed' : verificationPassed ? 'done' : operationCase.status === 'verifying' ? 'active' : 'waiting',
      startedAt: latestEventTime((event) => event.event_type.includes('verification')),
      finishedAt: verificationPassed || verificationFailed ? latestEventTime((event) => event.event_type.includes('verification')) : null,
      inputs: {
        completedTasks: completedTasks.length,
      },
      outputs: {
        passed: verificationPassed,
        failed: verificationFailed,
      },
      evidence: eventEvidence(eventMatches((event) => event.event_type.includes('verification'))),
      recommendedNextAction: {
        type: verificationFailed ? 'rerun_diagnosis_or_execution' : verificationPassed ? 'start_review' : 'verify_remediation',
        target: operationCase.id,
        reason: verificationPassed ? 'Recovery has been verified.' : 'Verification evidence is not complete yet.',
      },
    },
    {
      key: 'review',
      status: reviewDone || operationCase.status === 'closed' ? 'done' : ['reviewing', 'evolving'].includes(operationCase.status) ? 'active' : 'waiting',
      startedAt: latestTime([latestEventTime((event) => event.event_type.includes('retrospective') || event.event_type.includes('evolution')), latestRecordTime(proposals)]),
      finishedAt: operationCase.status === 'closed' ? operationCase.closed_at : null,
      inputs: {
        proposals: proposals.length,
      },
      outputs: {
        proposals: proposals.length,
        closed: operationCase.status === 'closed',
      },
      evidence: eventEvidence(eventMatches((event) => event.event_type.includes('retrospective') || event.event_type.includes('evolution'))).concat(recordEvidence('proposal', proposals)),
      recommendedNextAction: {
        type: operationCase.status === 'closed' ? 'view_trace' : 'run_retrospective',
        target: operationCase.correlation_id,
        reason: operationCase.status === 'closed' ? 'Case is closed and ready for audit.' : 'Review should capture lessons and improvement proposals.',
      },
    },
  ];
}

function inferNextStatus(eventType: string, payload?: Record<string, unknown>): OperationCaseStatus | null {
  switch (eventType) {
    case 'hermes_diagnosis_completed':
      return 'diagnosis_ready';
    case 'tool_approval_created':
      return 'approval_pending';
    case 'tool_approval_approved':
    case 'workflow_task_created':
    case 'workflow_task_started':
      return 'executing';
    case 'tool_approval_executed':
      return typeof payload?.taskId === 'string' && payload.taskId ? 'executing' : 'verifying';
    case 'workflow_task_completed':
    case 'remediation_verification_failed':
      return 'verifying';
    case 'tool_approval_rejected':
    case 'tool_approval_execution_failed':
    case 'workflow_task_failed':
    case 'remediation_verification_passed':
    case 'hermes_remediation_reviewed':
      return 'reviewing';
    case 'hermes_retrospective_completed':
    case 'evolution_proposal_created':
      return 'evolving';
    case 'evolution_proposal_status_changed':
      return payload?.status === 'published' ? 'closed' : 'evolving';
    default:
      return null;
  }
}

const statusOrderForPipeline: OperationCaseStatus[] = [
  'diagnosing',
  'diagnosis_ready',
  'approval_pending',
  'executing',
  'verifying',
  'reviewing',
  'evolving',
  'closed'
];

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRecordTime(record: Record<string, unknown>): string | null {
  return readRecordString(record, 'updated_at')
    || readRecordString(record, 'completed_at')
    || readRecordString(record, 'finished_at')
    || readRecordString(record, 'reviewed_at')
    || readRecordString(record, 'requested_at')
    || readRecordString(record, 'started_at')
    || readRecordString(record, 'created_at');
}

function latestTime(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((item) => !Number.isNaN(item.time))
    .sort((a, b) => b.time - a.time);
  return timestamps[0]?.value || null;
}

function eventEvidence(events: OperationCaseEvent[]): Array<Record<string, unknown>> {
  return events.slice(0, 20).map((event) => ({
    sourceType: event.source_type || 'operation_case_event',
    sourceId: event.source_id || event.id,
    eventType: event.event_type,
    createdAt: event.created_at,
  }));
}

function recordEvidence(sourceType: string, records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return records.slice(0, 20).map((record) => ({
    sourceType,
    sourceId: readRecordString(record, 'id') || null,
    status: readRecordString(record, 'status'),
    createdAt: readRecordTime(record),
  }));
}

function parseOperationCase(row: Record<string, unknown>): OperationCaseRecord {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    case_type: String(row.case_type || 'incident'),
    status: String(row.status || 'diagnosing') as OperationCaseStatus,
    severity: stringOrNull(row.severity),
    source: String(row.source || 'diagnosis_center'),
    asset_id: stringOrNull(row.asset_id),
    asset_type: stringOrNull(row.asset_type),
    asset_name: stringOrNull(row.asset_name),
    alert_id: stringOrNull(row.alert_id),
    correlation_id: String(row.correlation_id || ''),
    server_ids: parseJsonArray(row.server_ids),
    context: parseJsonObject(row.context),
    summary: row.summary ? parseJsonObject(row.summary) : null,
    created_by: stringOrNull(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    closed_at: stringOrNull(row.closed_at)
  };
}

function parseOperationCaseEvent(row: Record<string, unknown>): OperationCaseEvent {
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    event_type: String(row.event_type),
    source_type: stringOrNull(row.source_type),
    source_id: stringOrNull(row.source_id),
    correlation_id: stringOrNull(row.correlation_id),
    payload: parseJsonObject(row.payload),
    created_by: stringOrNull(row.created_by),
    created_at: String(row.created_at || '')
  };
}

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeCorrelationId(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9._:-]{8,128}$/.test(trimmed) ? trimmed : null;
}

function buildDefaultTitle(input: CreateOperationCaseInput): string {
  if (input.alertId && input.assetName) return `${input.assetName} alert diagnosis`;
  if (input.assetName) return `${input.assetName} diagnosis`;
  if (input.alertId) return `Alert ${input.alertId} diagnosis`;
  return 'Operations diagnosis case';
}
