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
  runtimeMetadata?: Record<string, unknown>;
  correlationId?: string | null;
  status: string;
  createdBy?: string | null;
}

export interface HermesIntentSummary {
  entities: string[];
  action: string;
  timeWindow: string | null;
  environment: string | null;
  assetRefs: string[];
  expectedOutput: string;
}

export interface HermesEvidenceSummary {
  toolsUsed: string[];
  skillsUsed: string[];
  mcpServersUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  missingEvidence: string[];
  suggestedNextAction: string;
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
  intent_summary: HermesIntentSummary;
  evidence_summary: HermesEvidenceSummary;
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
  const intentSummary = buildHermesIntentSummary({
    input: input.input,
    output: input.output,
    mode: input.mode || null,
    selectedContext,
    refs: extractedRefs,
    correlationId: input.correlationId || extractedRefs.correlationIds[0] || null
  });
  const evidenceSummary = buildHermesEvidenceSummary({
    output: input.output,
    trace,
    runtimeMetadata: input.runtimeMetadata || {},
    refs: extractedRefs,
    status: input.status
  });
  const id = randomUUID();

  db.prepare(`
    INSERT INTO hermes_sessions (
      id, agent_execution_id, agent_id, agent_name, mode, input, output,
      selected_context, trace, extracted_refs, intent_summary, evidence_summary,
      correlation_id, status, created_by,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    JSON.stringify(intentSummary),
    JSON.stringify(evidenceSummary),
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
  const selectedContext = parseJsonField(row.selected_context, null);
  const trace = parseJsonField<AgentTraceEvent[]>(row.trace, []);
  const extractedRefs = parseJsonField<HermesSessionRefs>(row.extracted_refs, { approvalIds: [], taskIds: [], correlationIds: [] });
  const correlationId = nullableString(row.correlation_id);
  const input = String(row.input || '');
  const output = nullableString(row.output);
  const mode = nullableString(row.mode);
  return {
    id: String(row.id),
    agent_execution_id: nullableString(row.agent_execution_id),
    agent_id: nullableString(row.agent_id),
    agent_name: nullableString(row.agent_name),
    mode,
    input,
    output,
    selected_context: selectedContext,
    trace,
    extracted_refs: extractedRefs,
    intent_summary: parseJsonField(row.intent_summary, buildHermesIntentSummary({
      input,
      output,
      mode,
      selectedContext,
      refs: extractedRefs,
      correlationId
    })),
    evidence_summary: parseJsonField(row.evidence_summary, buildHermesEvidenceSummary({
      output,
      trace,
      runtimeMetadata: {},
      refs: extractedRefs,
      status: String(row.status || 'success')
    })),
    correlation_id: correlationId,
    status: String(row.status || 'success'),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function buildHermesIntentSummary(input: {
  input: string;
  output?: string | null;
  mode?: string | null;
  selectedContext: unknown;
  refs: HermesSessionRefs;
  correlationId?: string | null;
}): HermesIntentSummary {
  const contextRefs = collectContextRefs(input.selectedContext);
  const entities = uniqueStrings([
    ...contextRefs.entities,
    ...extractEntityHints(input.input),
    ...input.refs.correlationIds.map(id => `correlation:${id}`)
  ]).slice(0, 20);
  const assetRefs = uniqueStrings([
    ...contextRefs.assetRefs,
    ...input.refs.taskIds.map(id => `task:${id}`),
    ...input.refs.approvalIds.map(id => `approval:${id}`)
  ]).slice(0, 20);

  return {
    entities,
    action: inferIntentAction(input.mode, input.input),
    timeWindow: contextRefs.timeWindow,
    environment: contextRefs.environment,
    assetRefs,
    expectedOutput: inferExpectedOutput(input.mode, input.input, input.output)
  };
}

function buildHermesEvidenceSummary(input: {
  output?: string | null;
  trace: AgentTraceEvent[];
  runtimeMetadata: Record<string, unknown>;
  refs: HermesSessionRefs;
  status: string;
}): HermesEvidenceSummary {
  const toolsUsed = collectToolCalls(input.trace);
  const skillsUsed = collectRuntimeNames(input.runtimeMetadata.skills);
  const mcpServersUsed = collectRuntimeNames(input.runtimeMetadata.mcpServers);
  const missingEvidence = inferMissingEvidence({
    toolsUsed,
    refs: input.refs,
    output: input.output,
    status: input.status
  });

  return {
    toolsUsed,
    skillsUsed,
    mcpServersUsed,
    confidence: inferConfidence({ toolsUsed, refs: input.refs, status: input.status, missingEvidence }),
    missingEvidence,
    suggestedNextAction: inferSuggestedNextAction({
      output: input.output,
      status: input.status,
      refs: input.refs,
      missingEvidence
    })
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

function collectContextRefs(value: unknown): {
  entities: string[];
  assetRefs: string[];
  environment: string | null;
  timeWindow: string | null;
} {
  const entities = new Set<string>();
  const assetRefs = new Set<string>();
  let environment: string | null = null;
  let timeWindow: string | null = null;

  const visit = (item: unknown, keyHint = '') => {
    if (item === null || item === undefined) return;
    if (typeof item === 'string' || typeof item === 'number') {
      const text = String(item).trim();
      if (!text) return;
      if (/server|host|node|cluster|asset|workflow|alert|task|approval|correlation/i.test(keyHint)) {
        assetRefs.add(`${keyHint}:${text}`);
      }
      if (/environment|env|namespace|cluster/i.test(keyHint) && !environment) {
        environment = text;
      }
      if (/time|window|range/i.test(keyHint) && !timeWindow) {
        timeWindow = text;
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(entry => visit(entry, keyHint));
      return;
    }
    if (typeof item === 'object') {
      Object.entries(item as Record<string, unknown>).forEach(([key, entry]) => {
        if (/name|title|hostname|host|node|cluster|server/i.test(key) && typeof entry === 'string') {
          entities.add(entry);
        }
        visit(entry, key);
      });
    }
  };

  visit(value);
  return {
    entities: Array.from(entities),
    assetRefs: Array.from(assetRefs),
    environment,
    timeWindow
  };
}

function extractEntityHints(text: string): string[] {
  const matches = text.match(/\b(?:k8s-[a-zA-Z0-9-]+|[a-zA-Z0-9._-]+(?:node|server|cluster)[a-zA-Z0-9._-]*)\b/g) || [];
  return uniqueStrings(matches).slice(0, 10);
}

function inferIntentAction(mode: string | null | undefined, input: string): string {
  const text = `${mode || ''} ${input}`.toLowerCase();
  if (/复盘|review|evolve|proposal|进化|优化/.test(text)) return 'review_and_improve';
  if (/修复|remediate|repair|审批|approval|执行/.test(text)) return 'plan_remediation';
  if (/巡检|inspect|health|检查/.test(text)) return 'inspect_status';
  if (/诊断|diagnose|分析|告警|root cause|根因/.test(text)) return 'diagnose_issue';
  return 'answer_ops_request';
}

function inferExpectedOutput(mode: string | null | undefined, input: string, output?: string | null): string {
  const text = `${mode || ''} ${input}`.toLowerCase();
  if (/复盘|review|evolve|proposal|进化|优化/.test(text)) return 'facts_judgement_and_improvement_proposal';
  if (/修复|remediate|repair|审批|approval/.test(text)) return 'remediation_plan_risk_approval_and_verification';
  if (/诊断|diagnose|分析|告警|root cause|根因/.test(text)) return 'evidence_risk_and_recommended_action';
  if (output && output.length > 0) return 'operator_response';
  return 'structured_ops_answer';
}

function collectToolCalls(trace: AgentTraceEvent[]): string[] {
  const tools = new Set<string>();
  trace.forEach((event) => {
    const metadata = event.metadata || {};
    addString(metadata.tool, tools);
    addString(metadata.toolName, tools);
    addString(metadata.tool_name, tools);
    normalizeStringList(metadata.toolCalls).forEach(tool => tools.add(tool));
    try {
      const content = JSON.parse(event.content) as Record<string, unknown>;
      addString(content.tool, tools);
      addString(content.toolName, tools);
      normalizeStringList(content.toolCalls).forEach(tool => tools.add(tool));
    } catch {
      // Trace content may be plain assistant text.
    }
  });
  return Array.from(tools);
}

function collectRuntimeNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      return String(record.name || record.id || '').trim();
    }
    return '';
  }).filter(Boolean));
}

function inferMissingEvidence(input: {
  toolsUsed: string[];
  refs: HermesSessionRefs;
  output?: string | null;
  status: string;
}): string[] {
  const missing: string[] = [];
  if (input.toolsUsed.length === 0) missing.push('tool_evidence');
  if (!input.refs.correlationIds.length) missing.push('correlation_id');
  if (input.status !== 'success') missing.push('successful_runtime_result');
  if (!input.output || input.output.trim().length < 30) missing.push('substantive_output');
  return missing;
}

function inferConfidence(input: {
  toolsUsed: string[];
  refs: HermesSessionRefs;
  status: string;
  missingEvidence: string[];
}): 'low' | 'medium' | 'high' {
  if (input.status !== 'success') return 'low';
  if (input.missingEvidence.length === 0 && input.toolsUsed.length >= 2 && input.refs.correlationIds.length > 0) return 'high';
  if (input.toolsUsed.length > 0 || input.refs.correlationIds.length > 0) return 'medium';
  return 'low';
}

function inferSuggestedNextAction(input: {
  output?: string | null;
  status: string;
  refs: HermesSessionRefs;
  missingEvidence: string[];
}): string {
  const text = input.output || '';
  if (input.status !== 'success') return 'review_error_and_create_bad_case';
  if (input.refs.approvalIds.length > 0) return 'review_pending_or_completed_approval';
  if (input.refs.taskIds.length > 0) return 'track_task_and_verify_result';
  if (/审批|approval|提交修复|submit/i.test(text)) return 'submit_or_review_approval_before_execution';
  if (input.missingEvidence.length > 0) return 'collect_missing_evidence_before_action';
  return 'review_trace_and_choose_next_action';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
