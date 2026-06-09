import axios from 'axios';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import db, { initializeDatabase } from '../../models/database';
import { HermesAgentRuntime } from './hermesRuntime';

describe('HermesAgentRuntime', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HERMES_API_BASE;
    delete process.env.HERMES_API_KEY;
  });

  it('persists approval ids and approval data in tool trace content', async () => {
    process.env.HERMES_API_BASE = 'https://hermes.example.test/v1';
    process.env.HERMES_API_KEY = 'test-key';

    const agent = db.prepare(`
      SELECT id
      FROM agents
      WHERE name = ?
    `).get('Hermes 诊断修复 Agent') as { id: string } | undefined;

    expect(agent).toBeTruthy();

    vi.spyOn(axios, 'post')
      .mockResolvedValueOnce({
        data: {
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call-run-workflow',
                type: 'function',
                function: {
                  name: 'run_workflow',
                  arguments: JSON.stringify({ workflowId: 'workflow-requires-approval' })
                }
              }]
            }
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          choices: [{
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Workflow execution requires approval.'
            }
          }]
        }
      });

    const runtime = new HermesAgentRuntime();
    const result = await runtime.run({
      agentId: agent!.id,
      input: 'Run the remediation workflow.',
      context: { userId: 'agent-user', userRole: 'operator', correlationId: 'corr-hermes-test' }
    });

    const toolTrace = result.trace?.find((event) => event.type === 'tool_call_result');
    expect(toolTrace).toBeTruthy();

    const content = JSON.parse(toolTrace!.content) as {
      approvalId?: string;
      correlationId?: string;
      data?: { approval?: { id?: string } };
    };

    expect(content.approvalId).toEqual(expect.any(String));
    expect(content.correlationId).toBe('corr-hermes-test');
    expect(content.data?.approval?.id).toBe(content.approvalId);
    expect(toolTrace?.metadata?.approvalId).toBe(content.approvalId);
    expect(toolTrace?.metadata?.correlationId).toBe('corr-hermes-test');
  });
});
