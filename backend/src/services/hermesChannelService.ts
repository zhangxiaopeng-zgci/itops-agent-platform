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
  enabled: number;
  health_status: string;
  last_checked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  tools: HermesChannelToolRecord[];
  skills: HermesChannelSkillRecord[];
  mcpServers: HermesChannelMcpServerRecord[];
}

export interface HermesChannelToolRecord {
  id: string;
  channel_id: string;
  tool_name: string;
  enabled: number;
  risk_level_override: string | null;
  created_at: string;
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
      timeout_ms, max_tool_rounds, temperature, policy_id, enabled, created_by,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    policyId: channel.policy_id
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
  return {
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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
