import { randomUUID } from 'crypto';
import db from '../models/database';
import { createOperationCase, getOperationCase, listOperationCaseEvents } from './operationCaseService';
import { getCorrelationTrace } from './correlationTraceService';
import { invokeTool } from './toolApi/toolRegistry';

export interface ClosedLoopSmokeResult {
  success: boolean;
  correlationId: string;
  caseId: string;
  taskId: string;
  finalCaseStatus: string | null;
  verificationPassed: boolean;
  eventTypes: string[];
  traceCounts: Record<string, number>;
  cleanedUp: boolean;
  error?: string;
}

export type ClosedLoopSmokeDrillStatus = 'passed' | 'failed' | 'warning';

export interface ClosedLoopSmokeDrillRecord {
  id: string;
  status: ClosedLoopSmokeDrillStatus;
  verification_status: string;
  correlation_id: string;
  case_id: string | null;
  task_id: string | null;
  final_case_status: string | null;
  verification_passed: boolean;
  cleaned_up: boolean;
  trace_counts: Record<string, number>;
  event_types: string[];
  evidence: ClosedLoopSmokeResult;
  error: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function runClosedLoopSmoke(input: {
  createdBy?: string | null;
  retainEvidence?: boolean;
} = {}): Promise<ClosedLoopSmokeResult> {
  const suffix = randomUUID();
  const correlationId = `closed-loop-smoke-${suffix}`;
  const taskId = `task-smoke-${suffix}`;
  let caseId = '';
  let cleanedUp = false;

  try {
    const operationCase = createOperationCase({
      title: 'Closed loop smoke test',
      caseType: 'smoke',
      status: 'diagnosis_ready',
      source: 'ops_readiness_smoke',
      correlationId,
      context: {
        smoke: true,
        purpose: 'Validate Case -> Task -> verify_remediation -> Case timeline closure'
      },
      createdBy: input.createdBy || null
    });
    caseId = operationCase.id;

    db.prepare(`
      INSERT INTO tasks (id, workflow_id, name, status, context, node_results, logs, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      taskId,
      'closed-loop-smoke-workflow',
      'Closed loop smoke verification task',
      'completed',
      JSON.stringify({
        operationCaseId: caseId,
        correlationId,
        smoke: true
      }),
      JSON.stringify({}),
      JSON.stringify([])
    );

    const verification = await invokeTool(
      'verify_remediation',
      { taskId, expectedStatus: 'completed' },
      {
        userId: input.createdBy || 'ops-readiness-smoke',
        userRole: 'admin',
        source: 'api',
        correlationId
      }
    );

    const finalCase = getOperationCase(caseId);
    const events = listOperationCaseEvents(caseId);
    const trace = getCorrelationTrace(correlationId);
    const result: ClosedLoopSmokeResult = {
      success: verification.success === true && finalCase?.status === 'reviewing',
      correlationId,
      caseId,
      taskId,
      finalCaseStatus: finalCase?.status || null,
      verificationPassed: verification.success === true,
      eventTypes: events.map((event) => event.event_type),
      traceCounts: {
        operationCases: trace.operationCases.length,
        tasks: trace.tasks.length,
        approvals: trace.approvals.length,
        hermesSessions: trace.hermesSessions.length,
        proposals: trace.proposals.length,
        auditLogs: trace.auditLogs.length,
        executionEvidence: trace.executionEvidence.length
      },
      cleanedUp: false
    };

    if (!input.retainEvidence) {
      cleanupClosedLoopSmoke(caseId, taskId, correlationId);
      cleanedUp = true;
      result.cleanedUp = true;
    }

    recordClosedLoopSmokeDrill(result, input.createdBy || null);
    return result;
  } catch (error) {
    if (!input.retainEvidence) {
      cleanupClosedLoopSmoke(caseId, taskId, correlationId);
      cleanedUp = true;
    }
    const result: ClosedLoopSmokeResult = {
      success: false,
      correlationId,
      caseId,
      taskId,
      finalCaseStatus: caseId ? getOperationCase(caseId)?.status || null : null,
      verificationPassed: false,
      eventTypes: caseId ? listOperationCaseEvents(caseId).map((event) => event.event_type) : [],
      traceCounts: {},
      cleanedUp,
      error: error instanceof Error ? error.message : String(error)
    };
    recordClosedLoopSmokeDrill(result, input.createdBy || null);
    return result;
  }
}

export function listClosedLoopSmokeDrills(limit = 20): ClosedLoopSmokeDrillRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM closed_loop_smoke_drills
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clampLimit(limit, 20, 100)) as Array<Record<string, unknown>>;

  return rows.map(parseClosedLoopSmokeDrill);
}

function recordClosedLoopSmokeDrill(result: ClosedLoopSmokeResult, createdBy: string | null): ClosedLoopSmokeDrillRecord {
  const id = randomUUID();
  const status: ClosedLoopSmokeDrillStatus = result.success && result.verificationPassed && result.finalCaseStatus === 'reviewing'
    ? 'passed'
    : result.error
      ? 'failed'
      : 'warning';
  const verificationStatus = status === 'passed'
    ? 'closed_loop_ready'
    : status === 'warning'
      ? 'closed_loop_warning'
      : 'closed_loop_failed';

  db.prepare(`
    INSERT INTO closed_loop_smoke_drills (
      id, status, verification_status, correlation_id, case_id, task_id, final_case_status,
      verification_passed, cleaned_up, trace_counts, event_types, evidence, error, created_by,
      created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    status,
    verificationStatus,
    result.correlationId,
    result.caseId || null,
    result.taskId || null,
    result.finalCaseStatus || null,
    result.verificationPassed ? 1 : 0,
    result.cleanedUp ? 1 : 0,
    JSON.stringify(result.traceCounts || {}),
    JSON.stringify(result.eventTypes || []),
    JSON.stringify(result),
    result.error || null,
    createdBy
  );

  return getClosedLoopSmokeDrill(id)!;
}

function getClosedLoopSmokeDrill(id: string): ClosedLoopSmokeDrillRecord | null {
  const row = db.prepare('SELECT * FROM closed_loop_smoke_drills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseClosedLoopSmokeDrill(row) : null;
}

function cleanupClosedLoopSmoke(caseId: string, taskId: string, correlationId: string) {
  db.prepare('DELETE FROM operation_case_events WHERE case_id = ? OR correlation_id = ?').run(caseId || '__none__', correlationId);
  db.prepare('DELETE FROM operation_cases WHERE id = ? OR correlation_id = ?').run(caseId || '__none__', correlationId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

function parseClosedLoopSmokeDrill(row: Record<string, unknown>): ClosedLoopSmokeDrillRecord {
  return {
    id: String(row.id),
    status: normalizeStatus(row.status),
    verification_status: String(row.verification_status || ''),
    correlation_id: String(row.correlation_id || ''),
    case_id: nullableString(row.case_id),
    task_id: nullableString(row.task_id),
    final_case_status: nullableString(row.final_case_status),
    verification_passed: Number(row.verification_passed || 0) === 1,
    cleaned_up: Number(row.cleaned_up || 0) === 1,
    trace_counts: parseJsonField(row.trace_counts, {}),
    event_types: parseJsonField(row.event_types, []),
    evidence: parseJsonField(row.evidence, {
      success: false,
      correlationId: String(row.correlation_id || ''),
      caseId: nullableString(row.case_id) || '',
      taskId: nullableString(row.task_id) || '',
      finalCaseStatus: nullableString(row.final_case_status),
      verificationPassed: Number(row.verification_passed || 0) === 1,
      eventTypes: parseJsonField(row.event_types, []),
      traceCounts: parseJsonField(row.trace_counts, {}),
      cleanedUp: Number(row.cleaned_up || 0) === 1,
      error: nullableString(row.error) || undefined
    }),
    error: nullableString(row.error),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    completed_at: nullableString(row.completed_at)
  };
}

function normalizeStatus(value: unknown): ClosedLoopSmokeDrillStatus {
  if (value === 'passed' || value === 'failed' || value === 'warning') {
    return value;
  }
  return 'warning';
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
