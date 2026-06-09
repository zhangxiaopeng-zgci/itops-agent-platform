import axios, { AxiosError } from 'axios';
import db from '../../models/database';
import { logger } from '../../utils/logger';
import { AgentRunRequest, AgentRunResult, AgentRuntime, AgentTraceEvent, RuntimeAgentRecord } from './types';

const DEFAULT_TIMEOUT_MS = 300000;

interface CustomHttpRuntimeConfig {
  endpoint: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  allowedTools?: string[];
}

interface CustomHttpRuntimeResponse {
  output?: string;
  summary?: string;
  status?: 'success' | 'error';
  error?: string;
  trace?: AgentTraceEvent[];
  metadata?: Record<string, unknown>;
}

export class CustomHttpAgentRuntime implements AgentRuntime {
  type = 'custom_http' as const;

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = db.prepare(`
      SELECT id, name, runtime_config, autonomy_level, tool_policy_id
      FROM agents
      WHERE id = ?
    `).get(request.agentId) as RuntimeAgentRecord | undefined;

    if (!agent) {
      throw new Error(`Agent not found: ${request.agentId}`);
    }

    const config = parseRuntimeConfig(agent.runtime_config);

    logger.info(`🌐 Calling custom HTTP runtime for agent ${agent.name}`, {
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS
    });

    try {
      const response = await axios.post<CustomHttpRuntimeResponse>(
        config.endpoint,
        {
          agent_id: request.agentId,
          agent_name: agent.name,
          input: request.input,
          context: request.context || {},
          task_id: request.taskId,
          node_id: request.nodeId,
          autonomy_level: agent.autonomy_level || 'suggest',
          tool_policy_id: agent.tool_policy_id || null,
          allowed_tools: config.allowedTools || []
        },
        {
          timeout: config.timeoutMs || DEFAULT_TIMEOUT_MS,
          headers: {
            'content-type': 'application/json',
            ...(config.headers || {})
          }
        }
      );

      const body = response.data || {};
      const output = body.output || body.summary;
      if (!output) {
        throw new Error('Custom HTTP runtime response must include output or summary');
      }

      if (body.status === 'error') {
        throw new Error(body.error || output);
      }

      return {
        status: 'success',
        output,
        trace: body.trace || [],
        metadata: {
          ...(body.metadata || {}),
          runtime: this.type,
          endpoint: config.endpoint,
          agentName: agent.name
        }
      };
    } catch (error) {
      throw toRuntimeError(error, config.endpoint);
    }
  }
}

function parseRuntimeConfig(rawConfig?: string | null): CustomHttpRuntimeConfig {
  if (!rawConfig) {
    throw new Error('custom_http runtime requires runtime_config.endpoint');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error('custom_http runtime_config must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('custom_http runtime_config must be a JSON object');
  }

  const config = parsed as Partial<CustomHttpRuntimeConfig>;
  if (!config.endpoint || typeof config.endpoint !== 'string') {
    throw new Error('custom_http runtime_config.endpoint is required');
  }

  if (config.timeoutMs !== undefined && typeof config.timeoutMs !== 'number') {
    throw new Error('custom_http runtime_config.timeoutMs must be a number');
  }

  if (config.headers !== undefined && !isStringRecord(config.headers)) {
    throw new Error('custom_http runtime_config.headers must be an object of string values');
  }

  if (config.allowedTools !== undefined && !Array.isArray(config.allowedTools)) {
    throw new Error('custom_http runtime_config.allowedTools must be an array');
  }

  return {
    endpoint: config.endpoint,
    timeoutMs: config.timeoutMs,
    headers: config.headers,
    allowedTools: config.allowedTools
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(item => typeof item === 'string');
}

function toRuntimeError(error: unknown, endpoint: string): Error {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    const status = axiosError.response?.status;
    const responseError = axiosError.response?.data?.error || axiosError.response?.data?.message;
    const detail = responseError || axiosError.message;
    return new Error(`Custom HTTP runtime failed${status ? ` (${status})` : ''} at ${endpoint}: ${detail}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Custom HTTP runtime failed at ${endpoint}: ${String(error)}`);
}
