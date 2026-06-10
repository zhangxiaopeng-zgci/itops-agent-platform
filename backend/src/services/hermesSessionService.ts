import { randomUUID } from 'crypto';
import db from '../models/database';
import { AgentTraceEvent } from './agentRuntime/types';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|passwd|private[_-]?key|authorization|credential)/i;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const API_KEY_PATTERN = /\bsk-[A-Za-z0-9]{12,}\b/g;

export interface HermesSessionRefs {
  approvalIds: string[];
  taskIds: string[];
  correlationIds: string[];
}

export interface CreateHermesSessionInput {
  agentExecutionId: string;
  agentId: string;
  agentName: string;
  mode?: string | null;
  input: string;
  output: string;
  selectedContext?: unknown;
  trace?: AgentTraceEvent[];
  correlationId?: string | null;
  status: string;
  createdBy?: string | null;
}

export interface HermesSessionRecord {
  id: string;
  agent_execution_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  mode: string | null;
  input: string;
  output: string | null;
  selected_context: unknown;
  trace: AgentTraceEvent[];
  extracted_refs: HermesSessionRefs;
  correlation_id: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function createHermesSession(input: CreateHermesSessionInput): HermesSessionRecord {
  const trace = sanitizeValue(input.trace || []) as AgentTraceEvent[];
  const selectedContext = sanitizeValue(input.selectedContext ?? null);
  const extractedRefs = extractHermesRefs(trace, input.correlationId || undefined);
  const id = randomUUID();

  db.prepare(`
    INSERT INTO hermes_sessions (
      id, agent_execution_id, agent_id, agent_name, mode, input, output,
      selected_context, trace, extracted_refs, correlation_id, status, created_by,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    input.agentExecutionId,
    input.agentId,
    input.agentName,
    input.mode || null,
    redactString(input.input),
    redactString(input.output),
    JSON.stringify(selectedContext),
    JSON.stringify(trace),
    JSON.stringify(extractedRefs),
    input.correlationId || extractedRefs.correlationIds[0] || null,
    input.status,
    input.createdBy || null
  );

  return getHermesSession(id)!;
}

export function listHermesSessions(filters: {
  mode?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
} = {}): { sessions: HermesSessionRecord[]; total: number } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.mode) {
    conditions.push('mode = ?');
    params.push(filters.mode);
  }

  if (filters.correlationId) {
    conditions.push("(correlation_id = ? OR IFNULL(extracted_refs, '') LIKE ? ESCAPE '\\')");
    params.push(filters.correlationId, `%${escapeLike(filters.correlationId)}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as count FROM hermes_sessions ${where}`).get(...params) as { count: number }).count;
  const limit = clampLimit(filters.limit, 10, 50);
  const offset = Math.max(0, Number(filters.offset || 0));

  const rows = db.prepare(`
    SELECT *
    FROM hermes_sessions
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    sessions: rows.map(parseHermesSession),
    total
  };
}

export function listHermesSessionsByCorrelation(correlationId: string): HermesSessionRecord[] {
  const pattern = `%${escapeLike(correlationId)}%`;
  const rows = db.prepare(`
    SELECT *
    FROM hermes_sessions
    WHERE correlation_id = ?
       OR IFNULL(extracted_refs, '') LIKE ? ESCAPE '\\'
    ORDER BY created_at DESC
    LIMIT 50
  `).all(correlationId, pattern) as Array<Record<string, unknown>>;

  return rows.map(parseHermesSession);
}

export function getHermesSession(id: string): HermesSessionRecord | null {
  const row = db.prepare('SELECT * FROM hermes_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseHermesSession(row) : null;
}

export function parseHermesSession(row: Record<string, unknown>): HermesSessionRecord {
  return {
    id: String(row.id),
    agent_execution_id: nullableString(row.agent_execution_id),
    agent_id: nullableString(row.agent_id),
    agent_name: nullableString(row.agent_name),
    mode: nullableString(row.mode),
    input: String(row.input || ''),
    output: nullableString(row.output),
    selected_context: parseJsonField(row.selected_context, null),
    trace: parseJsonField(row.trace, []),
    extracted_refs: parseJsonField(row.extracted_refs, { approvalIds: [], taskIds: [], correlationIds: [] }),
    correlation_id: nullableString(row.correlation_id),
    status: String(row.status || 'success'),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

export function extractHermesRefs(trace: AgentTraceEvent[], correlationId?: string): HermesSessionRefs {
  const approvalIds = new Set<string>();
  const taskIds = new Set<string>();
  const correlationIds = new Set<string>();
  if (correlationId) correlationIds.add(correlationId);

  trace.forEach((event) => {
    collectRefs(event.metadata, approvalIds, taskIds, correlationIds);
    const parsed = parseTraceContent(event.content);
    collectRefs(parsed, approvalIds, taskIds, correlationIds);
  });

  return {
    approvalIds: Array.from(approvalIds),
    taskIds: Array.from(taskIds),
    correlationIds: Array.from(correlationIds)
  };
}

function collectRefs(
  value: unknown,
  approvalIds: Set<string>,
  taskIds: Set<string>,
  correlationIds: Set<string>
): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, approvalIds, taskIds, correlationIds));
    return;
  }

  const record = value as Record<string, unknown>;
  addString(record.approvalId, approvalIds);
  addString(record.approval_id, approvalIds);
  addString(record.taskId, taskIds);
  addString(record.task_id, taskIds);
  addString(record.correlationId, correlationIds);
  addString(record.correlation_id, correlationIds);

  Object.values(record).forEach((item) => collectRefs(item, approvalIds, taskIds, correlationIds));
}

function addString(value: unknown, set: Set<string>): void {
  if (typeof value === 'string' && value.trim().length > 0) {
    set.add(value.trim());
  }
}

function parseTraceContent(content?: string): unknown {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : sanitizeValue(item)
    ]));
  }
  return value;
}

function redactString(value: string): string {
  return value
    .replace(PRIVATE_KEY_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `$1${REDACTED}`)
    .replace(API_KEY_PATTERN, REDACTED);
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

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}
