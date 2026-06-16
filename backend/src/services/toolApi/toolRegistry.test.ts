import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../../models/database';
import { createHermesSession } from '../hermesSessionService';
import { createToolApproval, markToolApprovalApproved } from './approvalService';
import { invokeTool } from './toolRegistry';

describe('toolRegistry', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  it('lists workflow ids for approved execution planning', async () => {
    const result = await invokeTool(
      'list_workflows',
      { isTemplate: true, limit: 5 },
      { userId: 'test-viewer', userRole: 'viewer', source: 'api' }
    );

    expect(result.success).toBe(true);
    expect(result.decision.status).toBe('allowed');
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Array<{ id?: string; name?: string }>)[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String)
      })
    );
  });

  it('seeds Hermes-enhanced workflow templates without replacing legacy templates', () => {
    const workflows = db.prepare(`
      SELECT name, nodes, is_template
      FROM workflows
      WHERE is_template = 1
    `).all() as Array<{ name: string; nodes: string; is_template: number }>;

    const names = workflows.map(workflow => workflow.name);
    expect(names).toContain('日常健康检查');
    expect(names).toContain('告警处理');
    expect(names).toContain('Hermes 告警诊断与修复闭环');
    expect(names).toContain('Hermes 故障诊断与审批修复');
    expect(names).toContain('Hermes 巡检复盘与优化建议');

    const alertWorkflow = workflows.find(workflow => workflow.name === 'Hermes 告警诊断与修复闭环');
    expect(alertWorkflow).toBeTruthy();

    const nodes = JSON.parse(alertWorkflow?.nodes || '[]') as Array<{ type?: string; data?: { label?: string; agentId?: string | null } }>;
    expect(nodes.map(node => node.data?.label)).toEqual([
      'Hermes 诊断修复 Agent',
      '日志分析 Agent',
      '服务器命令执行 Agent',
      'Hermes 修复编排 Agent',
      '文档生成 Agent'
    ]);
    expect(nodes.every(node => node.type === 'agent')).toBe(true);
    expect(nodes.every(node => typeof node.data?.agentId === 'string' && node.data.agentId.length > 0)).toBe(true);
  });

  it('seeds a Hermes diagnosis and remediation agent with approval-loop tools', async () => {
    const agent = db.prepare(`
      SELECT name, runtime, runtime_config, autonomy_level
      FROM agents
      WHERE name = ?
    `).get('Hermes 诊断修复 Agent') as
      | { name: string; runtime: string; runtime_config: string; autonomy_level: string }
      | undefined;

    expect(agent).toBeTruthy();
    expect(agent?.runtime).toBe('hermes');
    expect(agent?.autonomy_level).toBe('approval_required');

    const runtimeConfig = JSON.parse(agent?.runtime_config || '{}') as { allowedTools?: string[] };
    expect(runtimeConfig.allowedTools).toContain('list_workflows');
    expect(runtimeConfig.allowedTools).toContain('run_workflow');
    expect(runtimeConfig.allowedTools).toContain('verify_remediation');
  });

  it('seeds a dedicated Hermes remediation orchestrator agent', async () => {
    const agent = db.prepare(`
      SELECT name, runtime, runtime_config, autonomy_level, category
      FROM agents
      WHERE name = ?
    `).get('Hermes 修复编排 Agent') as
      | { name: string; runtime: string; runtime_config: string; autonomy_level: string; category: string }
      | undefined;

    expect(agent).toBeTruthy();
    expect(agent?.runtime).toBe('hermes');
    expect(agent?.category).toBe('修复编排');
    expect(agent?.autonomy_level).toBe('approval_required');

    const runtimeConfig = JSON.parse(agent?.runtime_config || '{}') as { allowedTools?: string[]; temperature?: number };
    expect(runtimeConfig.temperature).toBe(0.1);
    expect(runtimeConfig.allowedTools).toContain('list_workflows');
    expect(runtimeConfig.allowedTools).toContain('run_workflow');
    expect(runtimeConfig.allowedTools).toContain('get_task_status');
    expect(runtimeConfig.allowedTools).toContain('verify_remediation');
  });

  it('seeds a read-only Hermes evolution reviewer agent', async () => {
    const agent = db.prepare(`
      SELECT name, runtime, runtime_config, autonomy_level, category, tool_policy_id
      FROM agents
      WHERE name = ?
    `).get('Hermes 复盘进化 Agent') as
      | {
        name: string;
        runtime: string;
        runtime_config: string;
        autonomy_level: string;
        category: string;
        tool_policy_id: string | null;
      }
      | undefined;

    expect(agent).toBeTruthy();
    expect(agent?.runtime).toBe('hermes');
    expect(agent?.category).toBe('复盘进化');
    expect(agent?.autonomy_level).toBe('read_only');
    expect(agent?.tool_policy_id).toBeNull();

    const runtimeConfig = JSON.parse(agent?.runtime_config || '{}') as { allowedTools?: string[]; temperature?: number };
    expect(runtimeConfig.temperature).toBe(0.15);
    expect(runtimeConfig.allowedTools).toContain('get_correlation_trace');
    expect(runtimeConfig.allowedTools).toContain('list_tool_approvals');
    expect(runtimeConfig.allowedTools).toContain('list_agent_executions');
    expect(runtimeConfig.allowedTools).not.toContain('run_workflow');
    expect(runtimeConfig.allowedTools).not.toContain('submit_remediation_for_approval');
  });

  it('reads correlated execution evidence for retrospective review', async () => {
    const agent = db.prepare('SELECT id FROM agents WHERE name = ?').get('Hermes 诊断修复 Agent') as { id: string } | undefined;
    expect(agent).toBeTruthy();

    db.prepare(`
      INSERT OR REPLACE INTO agent_executions (
        id, agent_id, agent_name, input_text, output_text, status, execution_time_ms, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      'agent-execution-corr-review-test',
      agent!.id,
      'Hermes 诊断修复 Agent',
      'diagnose',
      'needs approval',
      'success',
      123,
      JSON.stringify({ correlationId: 'corr-review-test-1234', trace: [{ type: 'tool_call_result' }] })
    );

    const session = createHermesSession({
      agentExecutionId: 'agent-execution-corr-review-test',
      agentId: agent!.id,
      agentName: 'Hermes 诊断修复 Agent',
      mode: 'diagnose',
      input: 'diagnose with Bearer fake-token-for-redaction',
      output: 'needs approval',
      selectedContext: { serverIds: ['server-1'], password: 'secret-password' },
      trace: [{
        type: 'tool_call_result',
        content: JSON.stringify({
          approvalId: 'approval-from-session-trace',
          taskId: 'job-from-session-trace',
          correlationId: 'corr-review-test-1234'
        }),
        timestamp: new Date().toISOString(),
        metadata: { correlationId: 'corr-review-test-1234' }
      }],
      correlationId: 'corr-review-test-1234',
      status: 'success',
      createdBy: 'test-operator'
    });
    expect(session.input).toContain('[REDACTED]');
    expect(session.selected_context).toEqual(expect.objectContaining({ password: '[REDACTED]' }));
    expect(session.extracted_refs).toEqual(expect.objectContaining({
      approvalIds: expect.arrayContaining(['approval-from-session-trace']),
      taskIds: expect.arrayContaining(['job-from-session-trace']),
      correlationIds: expect.arrayContaining(['corr-review-test-1234'])
    }));

    const queued = await invokeTool(
      'run_workflow',
      { workflowId: 'workflow-for-correlation-review-test' },
      { userId: 'test-operator', userRole: 'operator', source: 'api', correlationId: 'corr-review-test-1234' }
    );
    expect(queued.decision.status).toBe('approval_required');

    const result = await invokeTool(
      'get_correlation_trace',
      { correlationId: 'corr-review-test-1234' },
      { userId: 'test-viewer', userRole: 'viewer', source: 'api' }
    );

    expect(result.success).toBe(true);
    expect(result.decision.status).toBe('allowed');

    const data = result.data as {
      hermesSessions: Array<{ id: string; correlation_id: string | null; extracted_refs: { approvalIds: string[] } }>;
      agentExecutions: Array<{ id: string; metadata: { correlationId?: string } }>;
      approvals: Array<{ id: string; correlation_id: string | null }>;
    };
    expect(data.hermesSessions.some((item) => item.id === session.id && item.correlation_id === 'corr-review-test-1234')).toBe(true);
    expect(data.hermesSessions[0].extracted_refs.approvalIds).toEqual(expect.arrayContaining(['approval-from-session-trace']));
    expect(data.agentExecutions.some((item) => item.id === 'agent-execution-corr-review-test')).toBe(true);
    expect(data.agentExecutions[0].metadata).toEqual(expect.objectContaining({ correlationId: expect.any(String) }));
    expect(data.approvals.some((item) => item.id === queued.approvalId && item.correlation_id === 'corr-review-test-1234')).toBe(true);
  });

  it('queues medium-risk workflow execution for approval before touching workflows', async () => {
    const result = await invokeTool(
      'run_workflow',
      { workflowId: 'missing-workflow-for-approval-test' },
      { userId: 'test-operator', userRole: 'operator', source: 'api', correlationId: 'corr-approval-test' }
    );

    expect(result.success).toBe(false);
    expect(result.decision.status).toBe('approval_required');
    expect(result.approvalId).toBeTruthy();

    const approval = db.prepare('SELECT tool_name, status, correlation_id FROM tool_approvals WHERE id = ?').get(result.approvalId) as
      | { tool_name: string; status: string; correlation_id: string | null }
      | undefined;
    expect(approval).toEqual({
      tool_name: 'run_workflow',
      status: 'pending',
      correlation_id: 'corr-approval-test'
    });
  });

  it('does not let viewers submit medium-risk workflow tools for approval', async () => {
    const result = await invokeTool(
      'run_workflow',
      { workflowId: 'viewer-cannot-queue-workflow' },
      { userId: 'test-viewer', userRole: 'viewer', source: 'api', correlationId: 'corr-viewer-denied' }
    );

    expect(result.success).toBe(false);
    expect(result.decision.status).toBe('denied');
    expect(result.approvalId).toBeUndefined();
    expect(result.error).toContain('Role cannot submit medium/high-risk tools for approval');

    const approvalCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM tool_approvals
      WHERE correlation_id = ?
    `).get('corr-viewer-denied') as { count: number }).count;
    expect(approvalCount).toBe(0);
  });

  it('creates one retrospective proposal candidate when remediation verification fails', async () => {
    db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, workflow_id, name, status, node_results, logs, context, execution_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      'task-verification-failure-test',
      'workflow-verification-failure-test',
      'Verification Failure Test',
      'failed',
      JSON.stringify({
        node_1: { status: 'success' },
        node_2: { status: 'failed', error: 'service still unhealthy after remediation' }
      }),
      JSON.stringify([{ message: 'verification failed', correlationId: 'corr-verification-failure-test' }]),
      JSON.stringify({ correlationId: 'corr-verification-failure-test' }),
      JSON.stringify(['node_1', 'node_2'])
    );

    const first = await invokeTool(
      'verify_remediation',
      { taskId: 'task-verification-failure-test', expectedStatus: 'completed' },
      { userId: 'test-operator', userRole: 'operator', source: 'api', correlationId: 'corr-verification-failure-test' }
    );
    const second = await invokeTool(
      'verify_remediation',
      { taskId: 'task-verification-failure-test', expectedStatus: 'completed' },
      { userId: 'test-operator', userRole: 'operator', source: 'api', correlationId: 'corr-verification-failure-test' }
    );

    expect(first.success).toBe(true);
    const firstData = first.data as {
      verified: boolean;
      retrospectiveCandidate?: { proposalId?: string; route?: string };
    };
    const secondData = second.data as {
      retrospectiveCandidate?: { proposalId?: string };
    };
    expect(firstData.verified).toBe(false);
    expect(firstData.retrospectiveCandidate?.proposalId).toBeTruthy();
    expect(firstData.retrospectiveCandidate?.route).toContain('/evolution-proposals?proposalId=');
    expect(secondData.retrospectiveCandidate?.proposalId).toBe(firstData.retrospectiveCandidate?.proposalId);

    const proposal = db.prepare(`
      SELECT source, source_ref, status, type, priority, evidence_refs
      FROM evolution_proposals
      WHERE id = ?
    `).get(firstData.retrospectiveCandidate?.proposalId) as
      | { source: string; source_ref: string; status: string; type: string; priority: string; evidence_refs: string }
      | undefined;

    expect(proposal).toEqual(expect.objectContaining({
      source: 'verification_failure',
      source_ref: 'verify_remediation:task-verification-failure-test',
      status: 'draft',
      type: 'workflow_template_update',
      priority: 'P1'
    }));
    const evidence = JSON.parse(proposal?.evidence_refs || '{}') as { schemaVersion?: string; verificationResult?: { failedNodes?: unknown[] } };
    expect(evidence.schemaVersion).toBe('verification.failure.evidence.v1');
    expect(evidence.verificationResult?.failedNodes).toHaveLength(1);
  });

  it('does not let skipApproval bypass denied policy decisions', async () => {
    const result = await invokeTool(
      'run_readonly_command',
      { serverId: 'server-1', command: 'uptime' },
      { userId: 'test-guest', userRole: 'guest', source: 'api' },
      { skipApproval: true }
    );

    expect(result.success).toBe(false);
    expect(result.decision.status).toBe('denied');
    expect(result.error).toContain('Role cannot invoke read-only tools');
  });

  it('claims a pending approval only once before execution', () => {
    const approval = createToolApproval({
      toolName: 'run_workflow',
      input: { workflowId: 'workflow-for-claim-test' },
      context: { userId: 'test-operator', userRole: 'operator', source: 'api' },
      decision: {
        status: 'approval_required',
        riskLevel: 'medium_risk',
        reason: 'Tool requires human approval before execution'
      }
    });

    const claimed = markToolApprovalApproved(approval.id, 'reviewer-1', 'approved');

    expect(claimed.status).toBe('approved');
    expect(() => markToolApprovalApproved(approval.id, 'reviewer-2')).toThrow(/already approved/);
  });
});
