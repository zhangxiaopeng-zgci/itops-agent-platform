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

  if (input.nextStatus && operationCase.status !== input.nextStatus) {
    const closedAt = input.nextStatus === 'closed' || input.nextStatus === 'cancelled' ? 'CURRENT_TIMESTAMP' : 'NULL';
    db.prepare(`
      UPDATE operation_cases
      SET status = ?,
          updated_at = CURRENT_TIMESTAMP,
          closed_at = ${closedAt}
      WHERE id = ?
    `).run(input.nextStatus, operationCase.id);
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
      nextStatus: input.nextStatus || operationCase.status
    },
    createdBy: input.createdBy || null
  });
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
