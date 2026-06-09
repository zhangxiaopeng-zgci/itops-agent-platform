import db from '../../models/database';
import { logger } from '../../utils/logger';
import { executeAgentWithLLM } from '../llmService';
import { AgentRunRequest, AgentRunResult, AgentRuntime } from './types';

const AGENT_EXECUTION_TIMEOUT = 300000;

export class LLMAgentRuntime implements AgentRuntime {
  type = 'llm' as const;

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(request.agentId) as { id: string; name: string } | undefined;
    if (!agent) {
      throw new Error(`Agent not found: ${request.agentId}`);
    }

    logger.info(`🤖 Calling LLM runtime for agent ${agent.name}`);

    const output = await Promise.race([
      executeAgentWithLLM(request.agentId, request.input),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent 执行超时（${AGENT_EXECUTION_TIMEOUT / 1000}s）`)), AGENT_EXECUTION_TIMEOUT)
      )
    ]);

    return {
      status: 'success',
      output,
      metadata: {
        runtime: this.type,
        agentName: agent.name
      }
    };
  }
}
