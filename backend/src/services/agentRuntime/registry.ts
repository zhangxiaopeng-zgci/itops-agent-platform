import db from '../../models/database';
import { logger } from '../../utils/logger';
import { BuiltinAgentRuntime } from './builtinRuntime';
import { CustomHttpAgentRuntime } from './customHttpRuntime';
import { HermesAgentRuntime } from './hermesRuntime';
import { LLMAgentRuntime } from './llmRuntime';
import { AgentRuntime, AgentRuntimeType, RuntimeAgentRecord } from './types';

const runtimes: Partial<Record<AgentRuntimeType, AgentRuntime>> = {
  builtin: new BuiltinAgentRuntime(),
  llm: new LLMAgentRuntime(),
  custom_http: new CustomHttpAgentRuntime(),
  hermes: new HermesAgentRuntime()
};

const supportedRuntimeTypes: AgentRuntimeType[] = ['builtin', 'llm', 'custom_http', 'hermes', 'openclaw', 'mcp'];

export function registerAgentRuntime(runtime: AgentRuntime): void {
  runtimes[runtime.type] = runtime;
  logger.info(`Registered agent runtime: ${runtime.type}`);
}

export function getAgentRuntime(type: AgentRuntimeType): AgentRuntime {
  const runtime = runtimes[type];
  if (!runtime) {
    throw new Error(`Agent runtime "${type}" is not registered`);
  }
  return runtime;
}

export function resolveRuntimeType(agent: RuntimeAgentRecord): AgentRuntimeType {
  const configuredRuntime = normalizeRuntimeType(agent.runtime);
  if (configuredRuntime) {
    return configuredRuntime;
  }

  return inferLegacyRuntimeType(agent.name);
}

export function getRuntimeForAgent(agentId: string): AgentRuntime {
  const agent = db.prepare(`
    SELECT id, name, system_prompt, runtime, runtime_config, autonomy_level, tool_policy_id
    FROM agents
    WHERE id = ?
  `).get(agentId) as RuntimeAgentRecord | undefined;

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  return getAgentRuntime(resolveRuntimeType(agent));
}

function normalizeRuntimeType(runtime?: string | null): AgentRuntimeType | null {
  if (!runtime) return null;
  return supportedRuntimeTypes.includes(runtime as AgentRuntimeType)
    ? runtime as AgentRuntimeType
    : null;
}

export function inferLegacyRuntimeType(agentName: string): AgentRuntimeType {
  if (
    agentName.includes('服务器命令执行') ||
    agentName.includes('系统巡检') ||
    agentName.includes('自动巡检')
  ) {
    return 'builtin';
  }

  return 'llm';
}
