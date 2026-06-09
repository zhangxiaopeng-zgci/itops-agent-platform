import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../../models/database';
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

  it('queues medium-risk workflow execution for approval before touching workflows', async () => {
    const result = await invokeTool(
      'run_workflow',
      { workflowId: 'missing-workflow-for-approval-test' },
      { userId: 'test-operator', userRole: 'operator', source: 'api' }
    );

    expect(result.success).toBe(false);
    expect(result.decision.status).toBe('approval_required');
    expect(result.approvalId).toBeTruthy();

    const approval = db.prepare('SELECT tool_name, status FROM tool_approvals WHERE id = ?').get(result.approvalId) as
      | { tool_name: string; status: string }
      | undefined;
    expect(approval).toEqual({
      tool_name: 'run_workflow',
      status: 'pending'
    });
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
});
