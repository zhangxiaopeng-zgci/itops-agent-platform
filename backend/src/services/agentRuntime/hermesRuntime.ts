import axios, { AxiosError } from 'axios';
import fs from 'fs';
import db from '../../models/database';
import { logger } from '../../utils/logger';
import { resolveHermesRuntimeConfigForAgent } from '../hermesChannelService';
import { McpRuntimeContext } from '../mcpServerService';
import { SkillRuntimeContext } from '../skillService';
import {
  buildEvolutionOverlayPrompt,
  EvolutionRuntimeOverlay,
  resolveEvolutionRuntimeOverlay
} from '../evolutionOverlayService';
import {
  HermesWorkerRunMetadata,
  HermesWorkerRunTelemetry,
  isHermesWorkerFallbackEnabled,
  recordHermesWorkerRun,
  resolveHermesWorkerForChannel,
  runHermesWorker
} from '../hermesWorkerService';
import { ToolContext, ToolDescriptor } from '../toolApi/types';
import { AgentRunRequest, AgentRunResult, AgentRuntime, AgentTraceEvent, RuntimeAgentRecord } from './types';

const DEFAULT_MODEL = 'smart-router';
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_MAX_TOOL_ROUNDS = 3;

interface HermesRuntimeConfig {
  channelId?: string;
  channelName?: string;
  channelType?: string;
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  maxToolRounds?: number;
  allowedTools?: string[];
  skills?: SkillRuntimeContext[];
  mcpServers?: McpRuntimeContext[];
  temperature?: number;
  policyId?: string | null;
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
    const apiKey = resolveSecret(apiKeyEnv);

    if (!apiKey) {
      throw new Error(`Hermes runtime requires API key environment variable or file reference: ${apiKeyEnv}`);
    }

    const trace: AgentTraceEvent[] = [];
    const { invokeTool, listTools } = await import('../toolApi/toolRegistry');
    const tools = getHermesTools(listTools, config.allowedTools);
    const maxToolRounds = config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
    const correlationId = typeof request.context?.correlationId === 'string' ? request.context.correlationId : undefined;
    const runtimeSkills = config.skills || [];
    const runtimeMcpServers = config.mcpServers || [];
    const releaseOverlays = resolveEvolutionRuntimeOverlay({
      agentId: agent.id,
      agentName: agent.name,
      channelId: config.channelId,
      channelType: config.channelType,
      policyId: config.policyId,
      skillIds: runtimeSkills.map(skill => skill.id),
      mcpServerIds: runtimeMcpServers.map(server => server.id)
    });
    const messages = buildInitialMessages(agent, request, config, releaseOverlays);
    let lastWorker: HermesWorkerRunMetadata | undefined;

    logger.info(`🧠 Calling Hermes runtime for agent ${agent.name}`, {
      baseUrl,
      model,
      channelType: config.channelType,
      tools: tools.map(tool => tool.function.name),
      skills: runtimeSkills.map(skill => skill.id),
      mcpServers: runtimeMcpServers.map(server => server.id),
      releaseOverlays: releaseOverlays.map(overlay => overlay.versionId)
    });

    let lastUsage: Record<string, unknown> | undefined;

    trace.push({
      type: 'release_overlay_resolved',
      content: JSON.stringify({
        count: releaseOverlays.length,
        overlays: releaseOverlays.map(toOverlayTraceSummary)
      }),
      timestamp: new Date().toISOString(),
      metadata: {
        correlationId,
        channelId: config.channelId,
        channelType: config.channelType,
        releaseOverlayVersionIds: releaseOverlays.map(overlay => overlay.versionId)
      }
    });

    for (let round = 0; round <= maxToolRounds; round++) {
      const completion = await callHermesCompletion({
        config,
        baseUrl,
        apiKey,
        body: {
          model,
          messages,
          tools,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: config.temperature
        },
        timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
        telemetry: {
          agentId: agent.id,
          channelId: config.channelId,
          correlationId
        }
      });
      const response = completion.response;
      lastWorker = completion.worker;

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
            channelType: config.channelType,
            policyId: config.policyId,
            agentName: agent.name,
            correlationId,
            worker: lastWorker,
            releaseOverlays: releaseOverlays.map(toOverlayTraceSummary),
            skills: runtimeSkills.map(skill => ({
              id: skill.id,
              name: skill.name,
              version: skill.version,
              category: skill.category
            })),
            mcpServers: runtimeMcpServers.map(server => ({
              id: server.id,
              name: server.name,
              transport: server.transport,
              toolImportMode: server.toolImportMode,
              healthStatus: server.healthStatus
            })),
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

async function callHermesCompletion({
  config,
  baseUrl,
  apiKey,
  body,
  timeoutMs,
  telemetry
}: {
  config: HermesRuntimeConfig;
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  telemetry?: HermesWorkerRunTelemetry;
}): Promise<{ response: ChatCompletionResponse; worker?: HermesWorkerRunMetadata }> {
  const worker = resolveHermesWorkerForChannel(config.channelType);
  if (worker?.url) {
    try {
      const workerResult = await runHermesWorker(worker, { ...body, timeoutMs }, timeoutMs, telemetry);
      return {
        response: workerResult.data as ChatCompletionResponse,
        worker: workerResult.metadata
      };
    } catch (error) {
      const workerError = error instanceof Error ? error.message : String(error);
      if (!isHermesWorkerFallbackEnabled()) {
        recordHermesWorkerRun({
          workerRole: worker.role,
          workerUrl: worker.url,
          status: 'failed',
          fallbackUsed: false,
          error: workerError,
          telemetry
        });
        throw error;
      }

      logger.warn(`Hermes worker ${worker.role} failed, falling back to backend runtime`, error as Error);
      const fallbackStart = Date.now();
      const response = await callChatCompletions(baseUrl, apiKey, body, timeoutMs);
      recordHermesWorkerRun({
        workerRole: worker.role,
        workerUrl: worker.url,
        status: 'fallback',
        latencyMs: Date.now() - fallbackStart,
        fallbackUsed: true,
        error: workerError,
        telemetry
      });
      return {
        response,
        worker: {
          attempted: true,
          used: false,
          fallbackUsed: true,
          role: worker.role,
          url: worker.url,
          error: workerError
        }
      };
    }
  }

  if (worker && !worker.url) {
    recordHermesWorkerRun({
      workerRole: worker.role,
      workerUrl: null,
      status: 'not_configured',
      fallbackUsed: false,
      error: `Hermes worker URL is not configured for role: ${worker.role}`,
      telemetry
    });
  }

  const response = await callChatCompletions(baseUrl, apiKey, body, timeoutMs);
  return {
    response,
    worker: {
      attempted: false,
      used: false,
      fallbackUsed: false
    }
  };
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
  if (config.channelType !== undefined && typeof config.channelType !== 'string') {
    throw new Error('hermes runtime_config.channelType must be a string');
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
    channelType: config.channelType,
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
  const apiKey = resolveSecret(apiKeyEnv);

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
      error: `Missing API key environment variable or file reference: ${apiKeyEnv}`
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

function buildInitialMessages(
  agent: RuntimeAgentRecord,
  request: AgentRunRequest,
  config: HermesRuntimeConfig,
  releaseOverlays: EvolutionRuntimeOverlay[]
): ChatMessage[] {
  const skillPrompt = buildSkillPrompt(config.skills || []);
  const overlayPrompt = buildEvolutionOverlayPrompt(releaseOverlays);
  const systemPrompt = [
    agent.system_prompt || `You are ${agent.name}, an ITOps operations assistant.`,
    'Use tools only when they help with observation, diagnosis, or read-only verification.',
    'Never claim that an action was executed unless a tool result confirms it.',
    'When tool execution is denied or requires approval, explain the policy decision and provide a safe next step.',
    skillPrompt,
    overlayPrompt
  ].filter(Boolean).join('\n\n');

  const context = request.context && Object.keys(request.context).length > 0
    ? `\n\nContext:\n${JSON.stringify(request.context)}`
    : '';

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${request.input}${context}` }
  ];
}

function toOverlayTraceSummary(overlay: EvolutionRuntimeOverlay): Record<string, unknown> {
  return {
    versionId: overlay.versionId,
    proposalId: overlay.proposalId,
    versionLabel: overlay.versionLabel,
    objectType: overlay.objectType,
    targetId: overlay.targetId,
    patchId: overlay.patchId,
    patchKind: overlay.patchKind,
    operationCount: overlay.operationCount,
    publishedAt: overlay.publishedAt
  };
}

function buildSkillPrompt(skills: SkillRuntimeContext[]): string {
  if (skills.length === 0) {
    return '';
  }

  const skillBlocks = skills.map((skill, index) => {
    const requiredTools = skill.requiredTools.length > 0
      ? `Required or preferred tools: ${skill.requiredTools.join(', ')}.`
      : 'No specific required tools.';
    const recommendedTools = skill.recommendedTools.length > 0
      ? `Recommended tools: ${skill.recommendedTools.join(', ')}.`
      : '';
    const recommendedMcpServers = skill.recommendedMcpServers.length > 0
      ? `Recommended MCP servers/connectors: ${skill.recommendedMcpServers.join(', ')}.`
      : '';
    const scenarios = formatSkillList('Applicable scenarios', skill.applicableScenarios);
    const inputContext = formatSkillList('Expected input context', skill.inputContext);
    const evidenceRequirements = formatSkillList('Evidence requirements', skill.evidenceRequirements);
    const outputContract = formatSkillList('Output contract', skill.outputContract);
    const riskNotes = skill.riskNotes ? `Risk notes: ${skill.riskNotes}` : '';
    const riskPolicy = `Risk level: ${skill.riskLevel || 'medium'}; approval policy: ${skill.approvalPolicy || 'inherit'}; version status: ${skill.versionStatus || 'draft'}.`;
    const verification = skill.verificationMethod ? `Verification method: ${skill.verificationMethod}` : '';
    const rollback = skill.rollbackGuidance ? `Rollback guidance: ${skill.rollbackGuidance}` : '';

    return [
      `Skill Pack ${index + 1}: ${skill.name} (${skill.version}, ${skill.category})`,
      skill.content,
      scenarios,
      inputContext,
      evidenceRequirements,
      requiredTools,
      recommendedTools,
      recommendedMcpServers,
      riskPolicy,
      riskNotes,
      verification,
      rollback,
      outputContract
    ].filter(Boolean).join('\n');
  });

  return [
    'Enabled Hermes Skill Packs:',
    ...skillBlocks,
    'Follow these Skill Packs as channel-scoped operating guidance. They do not override tool policy, role permissions, approvals, or safety constraints.'
  ].join('\n\n');
}

function formatSkillList(label: string, values: string[]): string {
  return values.length > 0 ? `${label}: ${values.join(', ')}.` : '';
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

function resolveSecret(envName: string): string | undefined {
  const direct = process.env[envName]?.trim();
  if (direct) {
    return direct;
  }

  const filePath = process.env[`${envName}_FILE`]?.trim();
  if (!filePath) {
    return undefined;
  }

  try {
    return fs.readFileSync(filePath, 'utf8').trim() || undefined;
  } catch (error) {
    logger.warn(`Failed to read Hermes secret file for ${envName}`, error as Error);
    return undefined;
  }
}
