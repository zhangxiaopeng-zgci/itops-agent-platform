import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../../models/database';
import { invokeTool } from './toolRegistry';

describe('toolRegistry', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
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
