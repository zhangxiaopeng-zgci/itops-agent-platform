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

    return result;
  } catch (error) {
    if (!input.retainEvidence) {
      cleanupClosedLoopSmoke(caseId, taskId, correlationId);
      cleanedUp = true;
    }
    return {
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
  }
}

function cleanupClosedLoopSmoke(caseId: string, taskId: string, correlationId: string) {
  db.prepare('DELETE FROM operation_case_events WHERE case_id = ? OR correlation_id = ?').run(caseId || '__none__', correlationId);
  db.prepare('DELETE FROM operation_cases WHERE id = ? OR correlation_id = ?').run(caseId || '__none__', correlationId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}
