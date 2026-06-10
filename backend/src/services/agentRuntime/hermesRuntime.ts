import axios, { AxiosError } from 'axios';
import db from '../../models/database';
import { logger } from '../../utils/logger';
import { resolveHermesRuntimeConfigForAgent } from '../hermesChannelService';
import { ToolContext, ToolDescriptor } from '../toolApi/types';
import { AgentRunRequest, AgentRunResult, AgentRuntime, AgentTraceEvent, RuntimeAgentRecord } from './types';

const DEFAULT_MODEL = 'smart-router';
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_TOOL_ROUNDS = 3;

interface HermesRuntimeConfig {
  channelId?: string;
  channelName?: string;
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  maxToolRounds?: number;
  allowedTools?: string[];
  temperature?: number;
}

interface HermesConnectionTestResult {
  success: boolean;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  latencyMs: number;
  output?: string;
  error?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: Record<string, unknown>;
}

export class HermesAgentRuntime implements AgentRuntime {
  type = 'hermes' as const;

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const agent = db.prepare(`
      SELECT id, name, system_prompt, runtime_config, autonomy_level, tool_policy_id
      FROM agents
      WHERE id = ?
    `).get(request.agentId) as RuntimeAgentRecord | undefined;

    if (!agent) {
      throw new Error(`Agent not found: ${request.agentId}`);
    }

    const config = resolveHermesRuntimeConfigForAgent(agent.id, agent.runtime_config);
    const configuredBaseUrl = config.baseUrl || process.env.HERMES_API_BASE;
    if (!configuredBaseUrl) {
      throw new Error('Hermes runtime requires runtime_config.baseUrl or HERMES_API_BASE');
    }

    const baseUrl = trimTrailingSlash(configuredBaseUrl);
    const model = config.model || process.env.HERMES_MODEL || DEFAULT_MODEL;
    const apiKeyEnv = config.apiKeyEnv || 'HERMES_API_KEY';
    const apiKey = process.env[apiKeyEnv];

    if (!apiKey) {
      throw new Error(`Hermes runtime requires API key environment variable: ${apiKeyEnv}`);
    }

    const trace: AgentTraceEvent[] = [];
    const { invokeTool, listTools } = await import('../toolApi/toolRegistry');
    const tools = getHermesTools(listTools, config.allowedTools);
    const messages = buildInitialMessages(agent, request);
    const maxToolRounds = config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const correlationId = typeof request.context?.correlationId === 'string' ? request.context.correlationId : undefined;

    logger.info(`🧠 Calling Hermes runtime for agent ${agent.name}`, {
      baseUrl,
      model,
      tools: tools.map(tool => tool.function.name)
    });

    let lastUsage: Record<string, unknown> | undefined;

    for (let round = 0; round <= maxToolRounds; round++) {
      const response = await callChatCompletions(baseUrl, apiKey, {
        model,
        messages,
        tools,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: config.temperature
      }, config.timeoutMs || DEFAULT_TIMEOUT_MS);

      const choice = response.choices?.[0];
      const message = choice?.message;
      lastUsage = response.usage;

      if (!message) {
        throw new Error('Hermes runtime returned no message');
      }

      const toolCalls = message.tool_calls || [];
      messages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      });

      trace.push({
        type: toolCalls.length > 0 ? 'tool_call_requested' : 'assistant_message',
        content: message.content || '',
        timestamp: new Date().toISOString(),
        metadata: {
          correlationId,
          finishReason: choice?.finish_reason,
          toolCalls: toolCalls.map(call => call.function.name),
          toolCallIds: toolCalls.map(call => call.id)
        }
      });

      if (toolCalls.length === 0) {
        return {
          status: 'success',
          output: message.content || '',
          trace,
          metadata: {
            runtime: this.type,
            model,
            channelId: config.channelId,
            channelName: config.channelName,
            agentName: agent.name,
            correlationId,
            usage: lastUsage,
            toolRounds: round
          }
        };
      }

      if (round === maxToolRounds) {
        throw new Error(`Hermes runtime exceeded max tool rounds: ${maxToolRounds}`);
      }

      for (const toolCall of toolCalls) {
        const input = parseToolArguments(toolCall.function.arguments);
        const toolContext = buildToolContext(request.context);
        const result = await invokeTool(toolCall.function.name, input, toolContext);

        trace.push({
          type: 'tool_call_result',
          content: JSON.stringify({
            tool: toolCall.function.name,
            success: result.success,
            decision: result.decision,
            correlationId,
            toolCallId: toolCall.id,
            approvalId: result.approvalId,
            data: result.data,
            error: result.error
          }),
          timestamp: new Date().toISOString(),
          metadata: {
            tool: toolCall.function.name,
            correlationId,
            toolCallId: toolCall.id,
            approvalId: result.approvalId,
            auditId: result.auditId
          }
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
    }

    throw new Error('Hermes runtime ended unexpectedly');
  }
}

function parseRuntimeConfig(rawConfig?: string | null): HermesRuntimeConfig {
  if (!rawConfig) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch {
    throw new Error('hermes runtime_config must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('hermes runtime_config must be a JSON object');
  }

  const config = parsed as Partial<HermesRuntimeConfig>;

  if (config.baseUrl !== undefined && typeof config.baseUrl !== 'string') {
    throw new Error('hermes runtime_config.baseUrl must be a string');
  }
  if (config.model !== undefined && typeof config.model !== 'string') {
    throw new Error('hermes runtime_config.model must be a string');
  }
  if (config.apiKeyEnv !== undefined && typeof config.apiKeyEnv !== 'string') {
    throw new Error('hermes runtime_config.apiKeyEnv must be a string');
  }
  if (config.timeoutMs !== undefined && typeof config.timeoutMs !== 'number') {
    throw new Error('hermes runtime_config.timeoutMs must be a number');
  }
  if (config.maxToolRounds !== undefined && typeof config.maxToolRounds !== 'number') {
    throw new Error('hermes runtime_config.maxToolRounds must be a number');
  }
  if (config.allowedTools !== undefined && !Array.isArray(config.allowedTools)) {
    throw new Error('hermes runtime_config.allowedTools must be an array');
  }
  if (config.temperature !== undefined && typeof config.temperature !== 'number') {
    throw new Error('hermes runtime_config.temperature must be a number');
  }

  return {
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyEnv: config.apiKeyEnv,
    timeoutMs: config.timeoutMs,
    maxToolRounds: config.maxToolRounds,
    allowedTools: config.allowedTools,
    temperature: config.temperature
  };
}

export async function testHermesConnection(rawConfig?: unknown): Promise<HermesConnectionTestResult> {
  const config = parseRuntimeConfig(serializeRawConfig(rawConfig));
  const configuredBaseUrl = config.baseUrl || process.env.HERMES_API_BASE;
  const model = config.model || process.env.HERMES_MODEL || DEFAULT_MODEL;
  const apiKeyEnv = config.apiKeyEnv || 'HERMES_API_KEY';
  const apiKey = process.env[apiKeyEnv];

  if (!configuredBaseUrl) {
    return {
      success: false,
      baseUrl: '',
      model,
      apiKeyEnv,
      latencyMs: 0,
      error: 'Hermes runtime requires runtime_config.baseUrl or HERMES_API_BASE'
    };
  }

  if (!apiKey) {
    return {
      success: false,
      baseUrl: configuredBaseUrl,
      model,
      apiKeyEnv,
      latencyMs: 0,
      error: `Missing API key environment variable: ${apiKeyEnv}`
    };
  }

  const baseUrl = trimTrailingSlash(configuredBaseUrl);
  const startTime = Date.now();

  try {
    const response = await callChatCompletions(baseUrl, apiKey, {
      model,
      messages: [
        { role: 'system', content: 'You are a connection health checker. Reply with a short confirmation.' },
        { role: 'user', content: 'Return OK if this Hermes-compatible endpoint is reachable.' }
      ],
      max_tokens: 32,
      temperature: 0
    }, Math.min(config.timeoutMs || 30000, 30000));

    return {
      success: true,
      baseUrl,
      model,
      apiKeyEnv,
      latencyMs: Date.now() - startTime,
      output: response.choices?.[0]?.message?.content || ''
    };
  } catch (error) {
    return {
      success: false,
      baseUrl,
      model,
      apiKeyEnv,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function serializeRawConfig(rawConfig?: unknown): string | null {
  if (!rawConfig) return null;
  return typeof rawConfig === 'string' ? rawConfig : JSON.stringify(rawConfig);
}

function buildInitialMessages(agent: RuntimeAgentRecord, request: AgentRunRequest): ChatMessage[] {
  const systemPrompt = [
    agent.system_prompt || `You are ${agent.name}, an ITOps operations assistant.`,
    'Use tools only when they help with observation, diagnosis, or read-only verification.',
    'Never claim that an action was executed unless a tool result confirms it.',
    'When tool execution is denied or requires approval, explain the policy decision and provide a safe next step.'
  ].join('\n\n');

  const context = request.context && Object.keys(request.context).length > 0
    ? `\n\nContext:\n${JSON.stringify(request.context)}`
    : '';

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${request.input}${context}` }
  ];
}

function getHermesTools(listAvailableTools: () => ToolDescriptor[], allowedTools?: string[]): ChatTool[] {
  const allowed = allowedTools && allowedTools.length > 0 ? new Set(allowedTools) : null;
  return listAvailableTools()
    .filter(tool => allowed ? allowed.has(tool.name) && tool.riskLevel !== 'destructive' : tool.riskLevel === 'read_only')
    .map(toChatTool);
}

function toChatTool(tool: ToolDescriptor): ChatTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: `${tool.description} Risk level: ${tool.riskLevel}.`,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }
  };
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments || rawArguments.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    throw new Error('Hermes tool call arguments must be valid JSON');
  }

  throw new Error('Hermes tool call arguments must be a JSON object');
}

function buildToolContext(context?: Record<string, unknown>): ToolContext {
  return {
    userId: typeof context?.userId === 'string' ? context.userId : undefined,
    userRole: typeof context?.userRole === 'string' ? context.userRole : 'viewer',
    ipAddress: typeof context?.ipAddress === 'string' ? context.ipAddress : undefined,
    correlationId: typeof context?.correlationId === 'string' ? context.correlationId : undefined,
    agentExecutionId: typeof context?.agentExecutionId === 'string' ? context.agentExecutionId : undefined,
    source: 'agent_runtime'
  };
}

async function callChatCompletions(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<ChatCompletionResponse> {
  try {
    const response = await axios.post<ChatCompletionResponse>(
      `${baseUrl}/chat/completions`,
      body,
      {
        timeout: timeoutMs,
        headers: {
          authorization: apiKey,
          'content-type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    throw toHermesError(error, baseUrl);
  }
}

function toHermesError(error: unknown, baseUrl: string): Error {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    const status = axiosError.response?.status;
    const responseError = axiosError.response?.data?.error || axiosError.response?.data?.message;
    return new Error(`Hermes runtime failed${status ? ` (${status})` : ''} at ${baseUrl}: ${responseError || axiosError.message}`);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(`Hermes runtime failed at ${baseUrl}: ${String(error)}`);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
