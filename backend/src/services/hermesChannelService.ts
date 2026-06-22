import { randomUUID } from 'crypto';
import db from '../models/database';
import {
  HermesChannelSkillRecord,
  SkillRuntimeContext,
  listChannelSkills,
  replaceChannelSkills,
  toSkillRuntimeContext
} from './skillService';
import {
  HermesChannelMcpServerRecord,
  McpRuntimeContext,
  listChannelMcpServers,
  replaceChannelMcpServers,
  toMcpRuntimeContext
} from './mcpServerService';

export interface HermesChannelRecord {
  id: string;
  name: string;
  description: string | null;
  type: string;
  runtime_type: string;
  base_url: string | null;
  model: string;
  api_key_ref: string;
  timeout_ms: number;
  max_tool_rounds: number;
  temperature: number | null;
  policy_id: string | null;
  delegate_allowed: number;
  max_concurrent_children: number;
  max_spawn_depth: number;
  allowed_worker_lanes: string[];
  allowed_external_cli_workers: string[];
  kanban_required_for_long_running: number;
  circuit_breaker_threshold: number;
  enabled: number;
  health_status: string;
  last_checked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  tools: HermesChannelToolRecord[];
  skills: HermesChannelSkillRecord[];
  mcpServers: HermesChannelMcpServerRecord[];
  effectiveBundle: HermesChannelEffectiveBundle;
}

export interface HermesChannelToolRecord {
  id: string;
  channel_id: string;
  tool_name: string;
  enabled: number;
  risk_level_override: string | null;
  created_at: string;
}

export interface HermesChannelEffectiveBundleAgent {
  id: string;
  name: string;
  role: string | null;
  runtime: string | null;
  enabled: number;
}

export interface HermesChannelEffectiveBundleRelease {
  id: string;
  proposal_id: string;
  object_type: string;
  target_id: string | null;
  version_label: string;
  status: string;
  published_at: string | null;
}

export interface HermesChannelEffectiveBundle {
  schemaVersion: 'hermes.channel.effectiveBundle.v1';
  channelId: string;
  channelName: string;
  channelType: string;
  runtime: {
    runtimeType: string;
    model: string;
    baseUrl: string | null;
    apiKeyRef: string;
    timeoutMs: number;
    maxToolRounds: number;
    temperature: number | null;
  };
  policy: {
    policyId: string | null;
    mode: 'policy_bound' | 'default_guardrails';
    approvalRequired: boolean;
    highRiskToolCount: number;
  };
  agents: HermesChannelEffectiveBundleAgent[];
  tools: Array<{
    name: string;
    riskLevel: string;
    enabled: boolean;
  }>;
  skills: Array<{
    id: string;
    skillId: string;
    name: string;
    category: string;
    version: string;
    riskLevel: string;
    approvalPolicy: string;
    versionStatus: string;
    enabled: boolean;
  }>;
  mcpServers: Array<{
    id: string;
    mcpServerId: string;
    name: string;
    transport: string;
    healthStatus: string;
    toolImportMode: string;
    enabled: boolean;
  }>;
  delegation: {
    delegateAllowed: boolean;
    maxConcurrentChildren: number;
    maxSpawnDepth: number;
    workerLanes: string[];
    externalCliWorkers: string[];
    kanbanRequiredForLongRunning: boolean;
    circuitBreakerThreshold: number;
  };
  releaseOverlays: HermesChannelEffectiveBundleRelease[];
  quality: {
    workerRole: string | null;
    runs24h: number;
    successRuns24h: number;
    failedRuns24h: number;
    fallbackRuns24h: number;
    avgLatencyMs: number | null;
    lastRunAt: string | null;
    successRate: number | null;
  };
  summary: {
    agents: number;
    tools: number;
    highRiskTools: number;
    skills: number;
    mcpServers: number;
    unhealthyMcpServers: number;
    releaseOverlays: number;
    ready: boolean;
    warnings: string[];
  };
}

export interface HermesChannelInput {
  name?: string;
  description?: string | null;
  type?: string;
  runtime_type?: string;
  base_url?: string | null;
  model?: string;
  api_key_ref?: string;
  timeout_ms?: number;
  max_tool_rounds?: number;
  temperature?: number | null;
  policy_id?: string | null;
  delegate_allowed?: boolean | number;
  max_concurrent_children?: number;
  max_spawn_depth?: number;
  allowed_worker_lanes?: string[];
  allowed_external_cli_workers?: string[];
  kanban_required_for_long_running?: boolean | number;
  circuit_breaker_threshold?: number;
  enabled?: boolean | number;
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
}

export interface HermesRuntimeChannelConfig {
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
  delegationPolicy?: {
    delegateAllowed: boolean;
    maxConcurrentChildren: number;
    maxSpawnDepth: number;
    allowedWorkerLanes: string[];
    allowedExternalCliWorkers: string[];
    kanbanRequiredForLongRunning: boolean;
    circuitBreakerThreshold: number;
  };
}

export function listHermesChannels(): HermesChannelRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM hermes_channels
    ORDER BY
      CASE type
        WHEN 'diagnose' THEN 1
        WHEN 'remediate' THEN 2
        WHEN 'review' THEN 3
        ELSE 4
      END,
      created_at ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(parseHermesChannel);
}

export function getHermesChannel(id: string): HermesChannelRecord | null {
  const row = db.prepare('SELECT * FROM hermes_channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseHermesChannel(row) : null;
}

export function createHermesChannel(input: HermesChannelInput, createdBy?: string | null): HermesChannelRecord {
  const id = randomUUID();
  const normalized = normalizeChannelInput(input, true);

  db.prepare(`
    INSERT INTO hermes_channels (
      id, name, description, type, runtime_type, base_url, model, api_key_ref,
      timeout_ms, max_tool_rounds, temperature, policy_id,
      delegate_allowed, max_concurrent_children, max_spawn_depth,
      allowed_worker_lanes, allowed_external_cli_workers,
      kanban_required_for_long_running, circuit_breaker_threshold,
      enabled, created_by,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    normalized.name,
    normalized.description,
    normalized.type,
    normalized.runtime_type,
    normalized.base_url,
    normalized.model,
    normalized.api_key_ref,
    normalized.timeout_ms,
    normalized.max_tool_rounds,
    normalized.temperature,
    normalized.policy_id,
    normalized.delegate_allowed,
    normalized.max_concurrent_children,
    normalized.max_spawn_depth,
    JSON.stringify(normalized.allowed_worker_lanes || []),
    JSON.stringify(normalized.allowed_external_cli_workers || []),
    normalized.kanban_required_for_long_running,
    normalized.circuit_breaker_threshold,
    normalized.enabled,
    createdBy || null
  );

  replaceHermesChannelTools(id, normalized.tools || []);
  replaceChannelSkills(id, normalized.skills || []);
  replaceChannelMcpServers(id, normalized.mcpServers || []);
  return getHermesChannel(id)!;
}

export function updateHermesChannel(id: string, input: HermesChannelInput): HermesChannelRecord {
  const current = getHermesChannel(id);
  if (!current) {
    throw new Error('Hermes channel not found');
  }

  const normalized = normalizeChannelInput(input, false);
  const merged = {
    name: normalized.name ?? current.name,
    description: normalized.description !== undefined ? normalized.description : current.description,
    type: normalized.type ?? current.type,
    runtime_type: normalized.runtime_type ?? current.runtime_type,
    base_url: normalized.base_url !== undefined ? normalized.base_url : current.base_url,
    model: normalized.model ?? current.model,
    api_key_ref: normalized.api_key_ref ?? current.api_key_ref,
    timeout_ms: normalized.timeout_ms ?? current.timeout_ms,
    max_tool_rounds: normalized.max_tool_rounds ?? current.max_tool_rounds,
    temperature: normalized.temperature !== undefined ? normalized.temperature : current.temperature,
    policy_id: normalized.policy_id !== undefined ? normalized.policy_id : current.policy_id,
    delegate_allowed: normalized.delegate_allowed ?? current.delegate_allowed,
    max_concurrent_children: normalized.max_concurrent_children ?? current.max_concurrent_children,
    max_spawn_depth: normalized.max_spawn_depth ?? current.max_spawn_depth,
    allowed_worker_lanes: normalized.allowed_worker_lanes ?? current.allowed_worker_lanes,
    allowed_external_cli_workers: normalized.allowed_external_cli_workers ?? current.allowed_external_cli_workers,
    kanban_required_for_long_running: normalized.kanban_required_for_long_running ?? current.kanban_required_for_long_running,
    circuit_breaker_threshold: normalized.circuit_breaker_threshold ?? current.circuit_breaker_threshold,
    enabled: normalized.enabled ?? current.enabled
  };

  db.prepare(`
    UPDATE hermes_channels
    SET name = ?,
        description = ?,
        type = ?,
        runtime_type = ?,
        base_url = ?,
        model = ?,
        api_key_ref = ?,
        timeout_ms = ?,
        max_tool_rounds = ?,
        temperature = ?,
        policy_id = ?,
        delegate_allowed = ?,
        max_concurrent_children = ?,
        max_spawn_depth = ?,
        allowed_worker_lanes = ?,
        allowed_external_cli_workers = ?,
        kanban_required_for_long_running = ?,
        circuit_breaker_threshold = ?,
        enabled = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    merged.name,
    merged.description,
    merged.type,
    merged.runtime_type,
    merged.base_url,
    merged.model,
    merged.api_key_ref,
    merged.timeout_ms,
    merged.max_tool_rounds,
    merged.temperature,
    merged.policy_id,
    merged.delegate_allowed,
    merged.max_concurrent_children,
    merged.max_spawn_depth,
    JSON.stringify(merged.allowed_worker_lanes || []),
    JSON.stringify(merged.allowed_external_cli_workers || []),
    merged.kanban_required_for_long_running,
    merged.circuit_breaker_threshold,
    merged.enabled,
    id
  );

  if (normalized.tools) {
    replaceHermesChannelTools(id, normalized.tools);
  }

  if (normalized.skills) {
    replaceChannelSkills(id, normalized.skills);
  }

  if (normalized.mcpServers) {
    replaceChannelMcpServers(id, normalized.mcpServers);
  }

  return getHermesChannel(id)!;
}

export function updateHermesChannelHealth(id: string, success: boolean): void {
  db.prepare(`
    UPDATE hermes_channels
    SET health_status = ?,
        last_checked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(success ? 'healthy' : 'failed', id);
}

export function resolveHermesRuntimeConfigForAgent(agentId: string, fallbackRawConfig?: string | null): HermesRuntimeChannelConfig {
  const row = db.prepare(`
    SELECT
      a.channel_id,
      c.*
    FROM agents a
    LEFT JOIN hermes_channels c ON c.id = a.channel_id AND c.enabled = 1
    WHERE a.id = ?
  `).get(agentId) as (Record<string, unknown> & { channel_id?: string | null }) | undefined;

  if (row?.id) {
    const channel = parseHermesChannel(row);
    return channelToRuntimeConfig(channel);
  }

  return parseLegacyRuntimeConfig(fallbackRawConfig);
}

export function channelToRuntimeConfig(channel: HermesChannelRecord): HermesRuntimeChannelConfig {
  const tools = channel.tools
    .filter((tool) => tool.enabled === 1)
    .map((tool) => tool.tool_name);
  const skills = channel.skills
    .filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1)
    .map(toSkillRuntimeContext);
  const mcpServers = channel.mcpServers
    .filter((server) => server.enabled === 1 && server.binding_enabled === 1)
    .map(toMcpRuntimeContext);

  return {
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    baseUrl: channel.base_url || undefined,
    model: channel.model,
    apiKeyEnv: channel.api_key_ref,
    timeoutMs: channel.timeout_ms,
    maxToolRounds: channel.max_tool_rounds,
    allowedTools: tools,
    skills,
    mcpServers,
    temperature: channel.temperature ?? undefined,
    policyId: channel.policy_id,
    delegationPolicy: {
      delegateAllowed: channel.delegate_allowed === 1,
      maxConcurrentChildren: channel.max_concurrent_children,
      maxSpawnDepth: channel.max_spawn_depth,
      allowedWorkerLanes: channel.allowed_worker_lanes,
      allowedExternalCliWorkers: channel.allowed_external_cli_workers,
      kanbanRequiredForLongRunning: channel.kanban_required_for_long_running === 1,
      circuitBreakerThreshold: channel.circuit_breaker_threshold
    }
  };
}

function replaceHermesChannelTools(channelId: string, tools: string[]): void {
  const uniqueTools = Array.from(new Set(tools.map((tool) => tool.trim()).filter(Boolean)));
  const deleteTools = db.prepare('DELETE FROM hermes_channel_tools WHERE channel_id = ?');
  const insertTool = db.prepare(`
    INSERT INTO hermes_channel_tools (id, channel_id, tool_name, enabled)
    VALUES (?, ?, ?, 1)
  `);

  const transaction = db.transaction(() => {
    deleteTools.run(channelId);
    uniqueTools.forEach((toolName) => {
      insertTool.run(`${channelId}:${toolName}`, channelId, toolName);
    });
  });

  transaction();
}

function parseHermesChannel(row: Record<string, unknown>): HermesChannelRecord {
  const channelId = String(row.id);
  const channel = {
    id: channelId,
    name: String(row.name || ''),
    description: nullableString(row.description),
    type: String(row.type || 'custom'),
    runtime_type: String(row.runtime_type || 'external_openai_compatible'),
    base_url: nullableString(row.base_url),
    model: String(row.model || 'smart-router'),
    api_key_ref: String(row.api_key_ref || 'HERMES_API_KEY'),
    timeout_ms: Number(row.timeout_ms || 300000),
    max_tool_rounds: Number(row.max_tool_rounds || 3),
    temperature: nullableNumber(row.temperature),
    policy_id: nullableString(row.policy_id),
    delegate_allowed: Number(row.delegate_allowed ?? 0),
    max_concurrent_children: Number(row.max_concurrent_children || 3),
    max_spawn_depth: Number(row.max_spawn_depth ?? 1),
    allowed_worker_lanes: parseStringArray(row.allowed_worker_lanes),
    allowed_external_cli_workers: parseStringArray(row.allowed_external_cli_workers),
    kanban_required_for_long_running: Number(row.kanban_required_for_long_running ?? 1),
    circuit_breaker_threshold: Number(row.circuit_breaker_threshold || 3),
    enabled: Number(row.enabled ?? 1),
    health_status: String(row.health_status || 'unknown'),
    last_checked_at: nullableString(row.last_checked_at),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    tools: listHermesChannelTools(channelId),
    skills: listChannelSkills(channelId),
    mcpServers: listChannelMcpServers(channelId)
  };

  return {
    ...channel,
    effectiveBundle: buildEffectiveBundle(channel)
  };
}

function listHermesChannelTools(channelId: string): HermesChannelToolRecord[] {
  return (db.prepare(`
    SELECT *
    FROM hermes_channel_tools
    WHERE channel_id = ?
    ORDER BY tool_name ASC
  `).all(channelId) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    channel_id: String(row.channel_id),
    tool_name: String(row.tool_name),
    enabled: Number(row.enabled ?? 1),
    risk_level_override: nullableString(row.risk_level_override),
    created_at: String(row.created_at || '')
  }));
}

function buildEffectiveBundle(channel: Omit<HermesChannelRecord, 'effectiveBundle'>): HermesChannelEffectiveBundle {
  const agents = listChannelAgents(channel.id);
  const enabledTools = channel.tools.filter((tool) => tool.enabled === 1).map((tool) => ({
    name: tool.tool_name,
    riskLevel: normalizeRiskLevel(tool.risk_level_override || inferToolRiskLevel(tool.tool_name)),
    enabled: true
  }));
  const enabledSkills = channel.skills
    .filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1)
    .map((skill) => ({
      id: skill.id,
      skillId: skill.skill_id,
      name: skill.name,
      category: skill.category,
      version: skill.version,
      riskLevel: skill.risk_level,
      approvalPolicy: skill.approval_policy,
      versionStatus: skill.version_status,
      enabled: true
    }));
  const enabledMcpServers = channel.mcpServers
    .filter((server) => server.enabled === 1 && server.binding_enabled === 1)
    .map((server) => ({
      id: server.id,
      mcpServerId: server.mcp_server_id,
      name: server.name,
      transport: server.transport,
      healthStatus: server.health_status,
      toolImportMode: server.tool_import_mode,
      enabled: true
    }));
  const highRiskTools = enabledTools.filter((tool) => isHighRisk(tool.riskLevel));
  const releaseOverlays = listEffectiveReleaseOverlays(channel, agents);
  const quality = buildChannelQuality(channel.type);
  const unhealthyMcpServers = enabledMcpServers.filter((server) => ['failed', 'unhealthy'].includes(server.healthStatus)).length;
  const warnings: string[] = [];

  if (channel.enabled !== 1) warnings.push('channel_disabled');
  if (agents.length === 0) warnings.push('no_bound_agent');
  if (enabledTools.length === 0) warnings.push('no_enabled_tool');
  if (highRiskTools.length > 0 && !channel.policy_id) warnings.push('high_risk_tools_without_policy');
  if (unhealthyMcpServers > 0) warnings.push('unhealthy_mcp_server');
  if (quality.failedRuns24h > 0) warnings.push('recent_failed_runs');
  if (quality.fallbackRuns24h > 0) warnings.push('recent_fallback_runs');

  const ready = warnings.filter((warning) => warning !== 'recent_failed_runs' && warning !== 'recent_fallback_runs').length === 0;

  return {
    schemaVersion: 'hermes.channel.effectiveBundle.v1',
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    runtime: {
      runtimeType: channel.runtime_type,
      model: channel.model,
      baseUrl: channel.base_url,
      apiKeyRef: channel.api_key_ref,
      timeoutMs: channel.timeout_ms,
      maxToolRounds: channel.max_tool_rounds,
      temperature: channel.temperature
    },
    policy: {
      policyId: channel.policy_id,
      mode: channel.policy_id ? 'policy_bound' : 'default_guardrails',
      approvalRequired: Boolean(channel.policy_id || highRiskTools.length > 0),
      highRiskToolCount: highRiskTools.length
    },
    agents,
    tools: enabledTools,
    skills: enabledSkills,
    mcpServers: enabledMcpServers,
    delegation: {
      delegateAllowed: channel.delegate_allowed === 1,
      maxConcurrentChildren: channel.max_concurrent_children,
      maxSpawnDepth: channel.max_spawn_depth,
      workerLanes: channel.allowed_worker_lanes,
      externalCliWorkers: channel.allowed_external_cli_workers,
      kanbanRequiredForLongRunning: channel.kanban_required_for_long_running === 1,
      circuitBreakerThreshold: channel.circuit_breaker_threshold
    },
    releaseOverlays,
    quality,
    summary: {
      agents: agents.length,
      tools: enabledTools.length,
      highRiskTools: highRiskTools.length,
      skills: enabledSkills.length,
      mcpServers: enabledMcpServers.length,
      unhealthyMcpServers,
      releaseOverlays: releaseOverlays.length,
      ready,
      warnings
    }
  };
}

function listChannelAgents(channelId: string): HermesChannelEffectiveBundleAgent[] {
  const rows = db.prepare(`
    SELECT id, name, role, runtime, enabled
    FROM agents
    WHERE channel_id = ?
    ORDER BY enabled DESC, name ASC
  `).all(channelId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    role: nullableString(row.role),
    runtime: nullableString(row.runtime),
    enabled: Number(row.enabled ?? 0)
  }));
}

function listEffectiveReleaseOverlays(
  channel: Omit<HermesChannelRecord, 'effectiveBundle'>,
  agents: HermesChannelEffectiveBundleAgent[]
): HermesChannelEffectiveBundleRelease[] {
  const skillIds = new Set(channel.skills.map((skill) => skill.skill_id));
  const mcpServerIds = new Set(channel.mcpServers.map((server) => server.mcp_server_id));
  const agentIds = new Set(agents.map((agent) => agent.id));
  const candidateTargets = new Set<string>([
    channel.id,
    channel.type,
    ...(channel.policy_id ? [channel.policy_id] : [])
  ]);

  const rows = db.prepare(`
    SELECT id, proposal_id, object_type, target_id, version_label, status, published_at
    FROM evolution_release_versions
    WHERE status = 'active'
    ORDER BY published_at DESC, created_at DESC
    LIMIT 100
  `).all() as Array<Record<string, unknown>>;

  return rows
    .filter((row) => {
      const objectType = String(row.object_type || '');
      const targetId = nullableString(row.target_id);
      if (!targetId) return objectType === 'global';
      if (candidateTargets.has(targetId)) return true;
      if (objectType === 'skill') return skillIds.has(targetId);
      if (objectType === 'mcp_binding') return mcpServerIds.has(targetId);
      if (objectType === 'agent_prompt') return agentIds.has(targetId);
      if (objectType === 'tool_policy') return targetId === channel.policy_id || targetId === channel.id;
      return false;
    })
    .slice(0, 8)
    .map((row) => ({
      id: String(row.id),
      proposal_id: String(row.proposal_id || ''),
      object_type: String(row.object_type || ''),
      target_id: nullableString(row.target_id),
      version_label: String(row.version_label || ''),
      status: String(row.status || ''),
      published_at: nullableString(row.published_at)
    }));
}

function buildChannelQuality(channelType: string): HermesChannelEffectiveBundle['quality'] {
  const workerRole = channelTypeToWorkerRole(channelType);
  if (!workerRole) {
    return {
      workerRole: null,
      runs24h: 0,
      successRuns24h: 0,
      failedRuns24h: 0,
      fallbackRuns24h: 0,
      avgLatencyMs: null,
      lastRunAt: null,
      successRate: null
    };
  }

  const row = db.prepare(`
    SELECT
      COUNT(*) AS runs24h,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successRuns24h,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedRuns24h,
      SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallbackRuns24h,
      AVG(latency_ms) AS avgLatencyMs,
      MAX(created_at) AS lastRunAt
    FROM hermes_worker_runs
    WHERE worker_role = ?
      AND created_at >= datetime('now', '-24 hours')
  `).get(workerRole) as Record<string, unknown> | undefined;

  const runs24h = Number(row?.runs24h || 0);
  const successRuns24h = Number(row?.successRuns24h || 0);
  return {
    workerRole,
    runs24h,
    successRuns24h,
    failedRuns24h: Number(row?.failedRuns24h || 0),
    fallbackRuns24h: Number(row?.fallbackRuns24h || 0),
    avgLatencyMs: nullableNumber(row?.avgLatencyMs),
    lastRunAt: nullableString(row?.lastRunAt),
    successRate: runs24h > 0 ? Math.round((successRuns24h / runs24h) * 100) : null
  };
}

function channelTypeToWorkerRole(channelType: string): string | null {
  if (channelType === 'diagnose') return 'diagnose';
  if (channelType === 'remediate') return 'remediate';
  if (channelType === 'review') return 'evolve';
  return null;
}

function inferToolRiskLevel(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('execute') || normalized.includes('run_workflow') || normalized.includes('restart')) {
    return 'high';
  }
  if (normalized.includes('approval') || normalized.includes('task') || normalized.includes('workflow')) {
    return 'medium';
  }
  return 'inherit';
}

function normalizeRiskLevel(value: string): string {
  const normalized = value.toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'inherit'].includes(normalized)) {
    return normalized;
  }
  return 'inherit';
}

function isHighRisk(riskLevel: string): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}

function normalizeChannelInput(input: HermesChannelInput, requireName: boolean): HermesChannelInput & { enabled?: number } {
  const normalized: HermesChannelInput & { enabled?: number } = {};

  if (typeof input.name === 'string' && input.name.trim()) {
    normalized.name = input.name.trim();
  } else if (requireName) {
    throw new Error('Channel name is required');
  }

  if ('description' in input) {
    normalized.description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;
  }

  if (typeof input.type === 'string' && input.type.trim()) {
    normalized.type = input.type.trim();
  } else if (requireName) {
    normalized.type = 'custom';
  }

  if (typeof input.runtime_type === 'string' && input.runtime_type.trim()) {
    normalized.runtime_type = input.runtime_type.trim();
  } else if (requireName) {
    normalized.runtime_type = 'external_openai_compatible';
  }

  if ('base_url' in input) {
    normalized.base_url = typeof input.base_url === 'string' && input.base_url.trim()
      ? input.base_url.trim()
      : null;
  }

  if (typeof input.model === 'string' && input.model.trim()) {
    normalized.model = input.model.trim();
  } else if (requireName) {
    normalized.model = 'smart-router';
  }

  if (typeof input.api_key_ref === 'string' && input.api_key_ref.trim()) {
    normalized.api_key_ref = input.api_key_ref.trim();
  } else if (requireName) {
    normalized.api_key_ref = 'HERMES_API_KEY';
  }

  if (input.timeout_ms !== undefined) {
    normalized.timeout_ms = clampNumber(input.timeout_ms, 1000, 600000, 300000);
  } else if (requireName) {
    normalized.timeout_ms = 300000;
  }

  if (input.max_tool_rounds !== undefined) {
    normalized.max_tool_rounds = clampNumber(input.max_tool_rounds, 0, 12, 3);
  } else if (requireName) {
    normalized.max_tool_rounds = 3;
  }

  if ('temperature' in input) {
    normalized.temperature = input.temperature === null || input.temperature === undefined
      ? null
      : clampNumber(input.temperature, 0, 2, 0.2);
  }

  if ('policy_id' in input) {
    normalized.policy_id = typeof input.policy_id === 'string' && input.policy_id.trim()
      ? input.policy_id.trim()
      : null;
  }

  if (input.delegate_allowed !== undefined) {
    normalized.delegate_allowed = input.delegate_allowed === true || input.delegate_allowed === 1 ? 1 : 0;
  } else if (requireName) {
    normalized.delegate_allowed = 0;
  }

  if (input.max_concurrent_children !== undefined) {
    normalized.max_concurrent_children = clampNumber(input.max_concurrent_children, 0, 10, 3);
  } else if (requireName) {
    normalized.max_concurrent_children = 3;
  }

  if (input.max_spawn_depth !== undefined) {
    normalized.max_spawn_depth = clampNumber(input.max_spawn_depth, 0, 5, 1);
  } else if (requireName) {
    normalized.max_spawn_depth = 1;
  }

  if (Array.isArray(input.allowed_worker_lanes)) {
    normalized.allowed_worker_lanes = normalizeStringArray(input.allowed_worker_lanes);
  } else if (requireName) {
    normalized.allowed_worker_lanes = [];
  }

  if (Array.isArray(input.allowed_external_cli_workers)) {
    normalized.allowed_external_cli_workers = normalizeStringArray(input.allowed_external_cli_workers);
  } else if (requireName) {
    normalized.allowed_external_cli_workers = [];
  }

  if (input.kanban_required_for_long_running !== undefined) {
    normalized.kanban_required_for_long_running = input.kanban_required_for_long_running === false || input.kanban_required_for_long_running === 0 ? 0 : 1;
  } else if (requireName) {
    normalized.kanban_required_for_long_running = 1;
  }

  if (input.circuit_breaker_threshold !== undefined) {
    normalized.circuit_breaker_threshold = clampNumber(input.circuit_breaker_threshold, 1, 20, 3);
  } else if (requireName) {
    normalized.circuit_breaker_threshold = 3;
  }

  if (input.enabled !== undefined) {
    normalized.enabled = input.enabled === true || input.enabled === 1 ? 1 : 0;
  } else if (requireName) {
    normalized.enabled = 1;
  }

  if (Array.isArray(input.tools)) {
    normalized.tools = input.tools.filter((tool): tool is string => typeof tool === 'string');
  }

  if (Array.isArray(input.skills)) {
    normalized.skills = input.skills.filter((skill): skill is string => typeof skill === 'string');
  }

  if (Array.isArray(input.mcpServers)) {
    normalized.mcpServers = input.mcpServers.filter((server): server is string => typeof server === 'string');
  }

  return normalized;
}

function parseLegacyRuntimeConfig(rawConfig?: string | null): HermesRuntimeChannelConfig {
  if (!rawConfig) return {};
  try {
    const parsed = JSON.parse(rawConfig) as Record<string, unknown>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
      channelType: typeof parsed.channelType === 'string' ? parsed.channelType : undefined,
      model: typeof parsed.model === 'string' ? parsed.model : undefined,
      apiKeyEnv: typeof parsed.apiKeyEnv === 'string' ? parsed.apiKeyEnv : undefined,
      timeoutMs: typeof parsed.timeoutMs === 'number' ? parsed.timeoutMs : undefined,
      maxToolRounds: typeof parsed.maxToolRounds === 'number' ? parsed.maxToolRounds : undefined,
      allowedTools: Array.isArray(parsed.allowedTools) ? parsed.allowedTools.filter((tool): tool is string => typeof tool === 'string') : undefined,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : undefined
    };
  } catch {
    throw new Error('hermes runtime_config must be valid JSON');
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? normalizeStringArray(parsed) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function normalizeStringArray(values: unknown[]): string[] {
  return Array.from(new Set(values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
