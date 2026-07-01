import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../models/database';
import { getCorrelationTrace } from './correlationTraceService';
import { createEvolutionProposal, updateEvolutionProposalStatus } from './evolutionProposalService';
import { createHermesSession } from './hermesSessionService';
import {
  addOperationCaseEvent,
  buildOperationCasePipeline,
  createOperationCase,
  getOperationCase,
  listOperationCaseEvents,
  recordOperationCaseEvent,
  updateOperationCaseStatus
} from './operationCaseService';
import {
  createToolApproval,
  markToolApprovalApproved,
  markToolApprovalExecuted
} from './toolApi/approvalService';
import { invokeTool } from './toolApi/toolRegistry';

describe('operationCaseService', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  it('creates a closed-loop operation case linked by correlation id', () => {
    const correlationId = `case-test-${Date.now()}`;

    const operationCase = createOperationCase({
      title: 'CPU alert diagnosis',
      assetId: 'server-001',
      assetType: 'server',
      assetName: 'k8s-node01',
      alertId: 'alert-001',
      correlationId,
      serverIds: ['server-001', 'server-001'],
      context: {
        prompt: 'Diagnose current CPU alert',
        source: 'vitest'
      },
      createdBy: 'test-operator'
    });

    expect(operationCase.correlation_id).toBe(correlationId);
    expect(operationCase.server_ids).toEqual(['server-001']);
    expect(operationCase.status).toBe('diagnosing');

    const event = addOperationCaseEvent({
      caseId: operationCase.id,
      eventType: 'hermes_diagnosis_started',
      sourceType: 'hermes',
      sourceId: 'hermes-channel-diagnose',
      payload: { mode: 'diagnose' },
      createdBy: 'test-operator'
    });
    expect(event.correlation_id).toBe(correlationId);

    const updated = updateOperationCaseStatus({
      id: operationCase.id,
      status: 'diagnosis_ready',
      summary: { risk: 'medium' },
      createdBy: 'test-operator'
    });
    expect(updated.status).toBe('diagnosis_ready');
    expect(updated.summary).toEqual({ risk: 'medium' });

    const events = listOperationCaseEvents(operationCase.id);
    expect(events.map(item => item.event_type)).toEqual([
      'case_created',
      'hermes_diagnosis_started',
      'status_changed'
    ]);

    const trace = getCorrelationTrace(correlationId);
    expect(trace.operationCases.map(item => item.id)).toContain(operationCase.id);
    expect(trace.executionEvidenceSummary.caseIds).toContain(operationCase.id);

    const pipeline = buildOperationCasePipeline(operationCase, events, trace);
    expect(pipeline.map(step => step.key)).toEqual(['detect', 'diagnose', 'approval', 'execute', 'verify', 'review']);
    expect(pipeline[0].status).toBe('done');
    expect(pipeline[1].outputs).toMatchObject({ sessions: 0 });
    expect(pipeline[1].recommendedNextAction.type).toBe('continue_diagnosis');

    db.prepare('DELETE FROM operation_case_events WHERE case_id = ?').run(operationCase.id);
    db.prepare('DELETE FROM operation_cases WHERE id = ?').run(operationCase.id);
  });

  it('infers case status from downstream events when nextStatus is omitted', () => {
    const correlationId = `case-inferred-status-${Date.now()}`;
    const operationCase = createOperationCase({
      title: 'Inferred status test',
      correlationId,
      createdBy: 'test-operator'
    });

    recordOperationCaseEvent({
      correlationId,
      eventType: 'tool_approval_created',
      sourceType: 'tool_approval',
      sourceId: 'approval-inferred-status',
      payload: { toolName: 'run_workflow' }
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('approval_pending');

    recordOperationCaseEvent({
      correlationId,
      eventType: 'tool_approval_approved',
      sourceType: 'tool_approval',
      sourceId: 'approval-inferred-status'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('executing');

    recordOperationCaseEvent({
      correlationId,
      eventType: 'workflow_task_completed',
      sourceType: 'task',
      sourceId: 'task-inferred-status'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('verifying');

    recordOperationCaseEvent({
      correlationId,
      eventType: 'remediation_verification_passed',
      sourceType: 'tool',
      sourceId: 'verify_remediation'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('reviewing');

    recordOperationCaseEvent({
      correlationId,
      eventType: 'evolution_proposal_status_changed',
      sourceType: 'evolution_proposal',
      sourceId: 'proposal-inferred-status',
      payload: { status: 'published' }
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('closed');

    const eventTypes = listOperationCaseEvents(operationCase.id).map((event) => event.event_type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'tool_approval_created',
      'tool_approval_approved',
      'workflow_task_completed',
      'remediation_verification_passed',
      'evolution_proposal_status_changed'
    ]));

    db.prepare('DELETE FROM operation_case_events WHERE case_id = ?').run(operationCase.id);
    db.prepare('DELETE FROM operation_cases WHERE id = ?').run(operationCase.id);
  });

  it('records downstream approval, verification, and evolution events', async () => {
    const correlationId = `case-downstream-test-${Date.now()}`;
    const operationCase = createOperationCase({
      title: 'Downstream closure test',
      correlationId,
      context: { source: 'vitest-downstream' },
      createdBy: 'test-operator'
    });

    const approval = createToolApproval({
      toolName: 'run_workflow',
      input: { workflowId: 'workflow-downstream-test' },
      context: {
        userId: 'test-operator',
        userRole: 'operator',
        source: 'agent_runtime',
        correlationId
      },
      decision: {
        status: 'approval_required',
        riskLevel: 'medium_risk',
        reason: 'test approval'
      }
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('approval_pending');

    markToolApprovalApproved(approval.id, 'test-admin', 'approved');
    expect(getOperationCase(operationCase.id)?.status).toBe('executing');

    markToolApprovalExecuted(approval.id, 'test-admin', {
      success: true,
      tool: 'run_workflow',
      decision: { status: 'allowed', riskLevel: 'medium_risk' },
      data: { taskId: 'task-downstream-test' }
    });

    db.prepare(`
      INSERT OR REPLACE INTO tasks (id, workflow_id, name, status, context, node_results)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'task-downstream-test',
      'workflow-downstream-test',
      'Downstream verification task',
      'completed',
      JSON.stringify({ correlationId }),
      JSON.stringify({})
    );

    const verification = await invokeTool(
      'verify_remediation',
      { taskId: 'task-downstream-test', expectedStatus: 'completed' },
      { userId: 'test-operator', userRole: 'operator', source: 'api', correlationId }
    );
    expect(verification.success).toBe(true);
    expect(getOperationCase(operationCase.id)?.status).toBe('reviewing');

    const hermesAgent = db.prepare('SELECT id FROM agents WHERE name = ?').get('Hermes 复盘进化 Agent') as { id: string } | undefined;
    expect(hermesAgent).toBeTruthy();
    db.prepare(`
      INSERT OR REPLACE INTO agent_executions (
        id, agent_id, agent_name, input_text, output_text, status, execution_time_ms, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      'agent-execution-downstream-test',
      hermesAgent!.id,
      'Hermes 复盘进化 Agent',
      'Review the downstream remediation evidence.',
      'The verification passed. Create a controlled improvement proposal if the evidence supports it.',
      'success',
      123,
      JSON.stringify({ correlationId })
    );

    const hermesSession = createHermesSession({
      agentExecutionId: 'agent-execution-downstream-test',
      agentId: hermesAgent!.id,
      agentName: 'Hermes 复盘进化 Agent',
      mode: 'review',
      input: 'Review the downstream remediation evidence.',
      output: 'The verification passed. Create a controlled improvement proposal if the evidence supports it.',
      selectedContext: { operationCaseId: operationCase.id, correlationId },
      trace: [],
      runtimeMetadata: {},
      correlationId,
      status: 'success',
      createdBy: 'test-operator'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('evolving');

    const proposal = createEvolutionProposal({
      title: 'Downstream evolution proposal',
      type: 'workflow_template_update',
      proposalBody: 'Improve the workflow based on downstream test evidence.',
      correlationId,
      createdBy: 'test-operator'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('evolving');

    updateEvolutionProposalStatus({
      id: proposal.id,
      status: 'published',
      actorId: 'test-admin',
      comment: 'published in test'
    });
    expect(getOperationCase(operationCase.id)?.status).toBe('closed');

    const eventTypes = listOperationCaseEvents(operationCase.id).map((event) => event.event_type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'tool_approval_created',
      'tool_approval_approved',
      'tool_approval_executed',
      'remediation_verification_passed',
      'hermes_retrospective_completed',
      'evolution_proposal_created',
      'evolution_proposal_status_changed'
    ]));

    db.prepare('DELETE FROM evolution_proposal_events WHERE proposal_id = ?').run(proposal.id);
    db.prepare('DELETE FROM evolution_proposals WHERE id = ?').run(proposal.id);
    db.prepare('DELETE FROM hermes_sessions WHERE id = ?').run(hermesSession.id);
    db.prepare('DELETE FROM agent_executions WHERE id = ?').run('agent-execution-downstream-test');
    db.prepare('DELETE FROM tasks WHERE id = ?').run('task-downstream-test');
    db.prepare('DELETE FROM tool_approvals WHERE id = ?').run(approval.id);
    db.prepare('DELETE FROM operation_case_events WHERE case_id = ?').run(operationCase.id);
    db.prepare('DELETE FROM operation_cases WHERE id = ?').run(operationCase.id);
  });

  it('links Hermes output refs back to a case by correlation id', () => {
    const correlationId = `case-hermes-output-ref-${Date.now()}`;
    const operationCase = createOperationCase({
      title: 'Hermes output refs test',
      correlationId,
      context: { source: 'vitest-output-refs' },
      createdBy: 'test-operator'
    });
    const hermesAgent = db.prepare('SELECT id FROM agents WHERE name = ?').get('Hermes 诊断修复 Agent') as { id: string } | undefined;
    expect(hermesAgent).toBeTruthy();

    db.prepare(`
      INSERT OR REPLACE INTO agent_executions (
        id, agent_id, agent_name, input_text, output_text, status, execution_time_ms, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      'agent-execution-output-ref-test',
      hermesAgent!.id,
      'Hermes 诊断修复 Agent',
      'Diagnose and submit approval if needed.',
      `approvalId: approval-output-ref-test\n taskId: task-output-ref-test\n correlationId: ${correlationId}`,
      'success',
      123,
      JSON.stringify({ correlationId })
    );

    const hermesSession = createHermesSession({
      agentExecutionId: 'agent-execution-output-ref-test',
      agentId: hermesAgent!.id,
      agentName: 'Hermes 诊断修复 Agent',
      mode: 'diagnose',
      input: 'Diagnose and submit approval if needed.',
      output: `approvalId: approval-output-ref-test\n taskId: task-output-ref-test\n correlationId: ${correlationId}`,
      selectedContext: { source: 'vitest-output-refs' },
      trace: [],
      runtimeMetadata: {},
      correlationId,
      status: 'success',
      createdBy: 'test-operator'
    });

    expect(hermesSession.extracted_refs.approvalIds).toContain('approval-output-ref-test');
    expect(hermesSession.extracted_refs.taskIds).toContain('task-output-ref-test');
    expect(hermesSession.extracted_refs.correlationIds).toContain(correlationId);

    const events = listOperationCaseEvents(operationCase.id);
    expect(events.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      'hermes_diagnosis_completed',
      'hermes_downstream_refs_detected'
    ]));
    const downstreamEvent = events.find((event) => event.event_type === 'hermes_downstream_refs_detected');
    expect(downstreamEvent?.payload).toEqual(expect.objectContaining({
      suggestedNextAction: 'review_pending_or_completed_approval'
    }));

    db.prepare('DELETE FROM hermes_sessions WHERE id = ?').run(hermesSession.id);
    db.prepare('DELETE FROM agent_executions WHERE id = ?').run('agent-execution-output-ref-test');
    db.prepare('DELETE FROM operation_case_events WHERE case_id = ?').run(operationCase.id);
    db.prepare('DELETE FROM operation_cases WHERE id = ?').run(operationCase.id);
  });
});
