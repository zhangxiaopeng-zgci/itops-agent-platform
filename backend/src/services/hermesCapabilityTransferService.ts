import db from '../models/database';
import { logger } from '../utils/logger';

interface SkillBundleItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: string;
  content: string;
  required_tools: string[];
  risk_notes: string | null;
  enabled: number;
}

interface McpServerBundleItem {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  command: string | null;
  args: string[];
  url: string | null;
  secret_ref: string | null;
  timeout_ms: number;
  enabled: number;
  capabilities_summary: Record<string, unknown> | null;
}

interface ChannelSkillBindingItem {
  channel_id: string;
  skill_id: string;
  enabled: number;
  config: Record<string, unknown> | null;
}

interface ChannelMcpBindingItem {
  channel_id: string;
  mcp_server_id: string;
  enabled: number;
  tool_import_mode: string;
}

export interface HermesCapabilityBundle {
  kind: 'itops-agent-platform.hermes-capabilities';
  version: 1;
  exportedAt: string;
  skills: SkillBundleItem[];
  mcpServers: McpServerBundleItem[];
  channelSkillBindings: ChannelSkillBindingItem[];
  channelMcpServerBindings: ChannelMcpBindingItem[];
}

export interface HermesCapabilityImportResult {
  success: boolean;
  imported: {
    skills: number;
    mcpServers: number;
    channelSkillBindings: number;
    channelMcpServerBindings: number;
  };
  skipped: string[];
  errors: string[];
}

const MAX_BUNDLE_SIZE_BYTES = 2 * 1024 * 1024;

export function exportHermesCapabilityBundle(): { content: string; filename: string; mimeType: string; bundle: HermesCapabilityBundle } {
  const bundle: HermesCapabilityBundle = {
    kind: 'itops-agent-platform.hermes-capabilities',
    version: 1,
    exportedAt: new Date().toISOString(),
    skills: listSkillsForBundle(),
    mcpServers: listMcpServersForBundle(),
    channelSkillBindings: listChannelSkillBindingsForBundle(),
    channelMcpServerBindings: listChannelMcpBindingsForBundle()
  };

  return {
    content: JSON.stringify(bundle, null, 2),
    filename: `hermes-capabilities-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    mimeType: 'application/json',
    bundle
  };
}

export function importHermesCapabilityBundle(rawBundle: unknown): HermesCapabilityImportResult {
  const result: HermesCapabilityImportResult = {
    success: false,
    imported: {
      skills: 0,
      mcpServers: 0,
      channelSkillBindings: 0,
      channelMcpServerBindings: 0
    },
    skipped: [],
    errors: []
  };

  const serialized = JSON.stringify(rawBundle);
  if (!serialized || serialized.length > MAX_BUNDLE_SIZE_BYTES) {
    result.errors.push('Hermes capability bundle is empty or too large');
    return result;
  }

  const bundle = validateBundle(rawBundle, result);
  if (!bundle) {
    return result;
  }

  const existingChannels = new Set((db.prepare('SELECT id FROM hermes_channels').all() as Array<{ id: string }>).map(row => row.id));

  const transaction = db.transaction(() => {
    const upsertSkill = db.prepare(`
      INSERT INTO skills (
        id, name, description, category, version, content, required_tools, risk_notes, enabled, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        category = excluded.category,
        version = excluded.version,
        content = excluded.content,
        required_tools = excluded.required_tools,
        risk_notes = excluded.risk_notes,
        enabled = excluded.enabled,
        updated_at = CURRENT_TIMESTAMP
    `);

    const upsertMcpServer = db.prepare(`
      INSERT INTO mcp_servers (
        id, name, description, transport, command, args, url, secret_ref,
        timeout_ms, enabled, capabilities_summary, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        transport = excluded.transport,
        command = excluded.command,
        args = excluded.args,
        url = excluded.url,
        secret_ref = excluded.secret_ref,
        timeout_ms = excluded.timeout_ms,
        enabled = excluded.enabled,
        capabilities_summary = excluded.capabilities_summary,
        updated_at = CURRENT_TIMESTAMP
    `);

    const upsertChannelSkill = db.prepare(`
      INSERT INTO hermes_channel_skills (id, channel_id, skill_id, enabled, config)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel_id, skill_id) DO UPDATE SET
        enabled = excluded.enabled,
        config = excluded.config
    `);

    const upsertChannelMcp = db.prepare(`
      INSERT INTO hermes_channel_mcp_servers (id, channel_id, mcp_server_id, enabled, tool_import_mode)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel_id, mcp_server_id) DO UPDATE SET
        enabled = excluded.enabled,
        tool_import_mode = excluded.tool_import_mode
    `);

    bundle.skills.forEach((skill) => {
      upsertSkill.run(
        skill.id,
        skill.name,
        skill.description,
        skill.category,
        skill.version,
        skill.content,
        JSON.stringify(skill.required_tools || []),
        skill.risk_notes,
        normalizeEnabled(skill.enabled)
      );
      result.imported.skills++;
    });

    bundle.mcpServers.forEach((server) => {
      upsertMcpServer.run(
        server.id,
        server.name,
        server.description,
        server.transport,
        server.command,
        JSON.stringify(server.args || []),
        server.url,
        server.secret_ref,
        clampNumber(server.timeout_ms, 1000, 120000, 30000),
        normalizeEnabled(server.enabled),
        server.capabilities_summary ? JSON.stringify(server.capabilities_summary) : null
      );
      result.imported.mcpServers++;
    });

    bundle.channelSkillBindings.forEach((binding) => {
      if (!existingChannels.has(binding.channel_id)) {
        result.skipped.push(`Channel not found for skill binding: ${binding.channel_id}`);
        return;
      }
      upsertChannelSkill.run(
        `${binding.channel_id}:${binding.skill_id}`,
        binding.channel_id,
        binding.skill_id,
        normalizeEnabled(binding.enabled),
        binding.config ? JSON.stringify(binding.config) : null
      );
      result.imported.channelSkillBindings++;
    });

    bundle.channelMcpServerBindings.forEach((binding) => {
      if (!existingChannels.has(binding.channel_id)) {
        result.skipped.push(`Channel not found for MCP binding: ${binding.channel_id}`);
        return;
      }
      upsertChannelMcp.run(
        `${binding.channel_id}:${binding.mcp_server_id}`,
        binding.channel_id,
        binding.mcp_server_id,
        normalizeEnabled(binding.enabled),
        binding.tool_import_mode || 'disabled'
      );
      result.imported.channelMcpServerBindings++;
    });
  });

  try {
    transaction();
    result.success = result.errors.length === 0;
    logger.info('Hermes capability bundle imported', result.imported);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    logger.error('Hermes capability bundle import failed', error as Error);
  }

  return result;
}

function listSkillsForBundle(): SkillBundleItem[] {
  return (db.prepare(`
    SELECT id, name, description, category, version, content, required_tools, risk_notes, enabled
    FROM skills
    ORDER BY category ASC, name ASC
  `).all() as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    category: String(row.category || 'general'),
    version: String(row.version || '1.0.0'),
    content: String(row.content || ''),
    required_tools: parseStringArray(row.required_tools),
    risk_notes: nullableString(row.risk_notes),
    enabled: Number(row.enabled ?? 1)
  }));
}

function listMcpServersForBundle(): McpServerBundleItem[] {
  return (db.prepare(`
    SELECT id, name, description, transport, command, args, url, secret_ref,
           timeout_ms, enabled, capabilities_summary
    FROM mcp_servers
    ORDER BY name ASC
  `).all() as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name),
    description: nullableString(row.description),
    transport: String(row.transport || 'http'),
    command: nullableString(row.command),
    args: parseStringArray(row.args),
    url: nullableString(row.url),
    secret_ref: nullableString(row.secret_ref),
    timeout_ms: Number(row.timeout_ms || 30000),
    enabled: Number(row.enabled ?? 1),
    capabilities_summary: parseJsonObject(row.capabilities_summary)
  }));
}

function listChannelSkillBindingsForBundle(): ChannelSkillBindingItem[] {
  return (db.prepare(`
    SELECT channel_id, skill_id, enabled, config
    FROM hermes_channel_skills
    ORDER BY channel_id ASC, skill_id ASC
  `).all() as Array<Record<string, unknown>>).map(row => ({
    channel_id: String(row.channel_id),
    skill_id: String(row.skill_id),
    enabled: Number(row.enabled ?? 1),
    config: parseJsonObject(row.config)
  }));
}

function listChannelMcpBindingsForBundle(): ChannelMcpBindingItem[] {
  return (db.prepare(`
    SELECT channel_id, mcp_server_id, enabled, tool_import_mode
    FROM hermes_channel_mcp_servers
    ORDER BY channel_id ASC, mcp_server_id ASC
  `).all() as Array<Record<string, unknown>>).map(row => ({
    channel_id: String(row.channel_id),
    mcp_server_id: String(row.mcp_server_id),
    enabled: Number(row.enabled ?? 1),
    tool_import_mode: String(row.tool_import_mode || 'disabled')
  }));
}

function validateBundle(raw: unknown, result: HermesCapabilityImportResult): HermesCapabilityBundle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    result.errors.push('Hermes capability bundle must be a JSON object');
    return null;
  }

  const bundle = raw as Partial<HermesCapabilityBundle>;
  if (bundle.kind !== 'itops-agent-platform.hermes-capabilities' || bundle.version !== 1) {
    result.errors.push('Unsupported Hermes capability bundle kind or version');
    return null;
  }

  const skills = Array.isArray(bundle.skills) ? bundle.skills.filter(isValidSkill) : [];
  const mcpServers = Array.isArray(bundle.mcpServers) ? bundle.mcpServers.filter(isValidMcpServer) : [];
  const channelSkillBindings = Array.isArray(bundle.channelSkillBindings) ? bundle.channelSkillBindings.filter(isValidChannelSkillBinding) : [];
  const channelMcpServerBindings = Array.isArray(bundle.channelMcpServerBindings) ? bundle.channelMcpServerBindings.filter(isValidChannelMcpBinding) : [];

  const invalidCount =
    (Array.isArray(bundle.skills) ? bundle.skills.length : 0) - skills.length +
    (Array.isArray(bundle.mcpServers) ? bundle.mcpServers.length : 0) - mcpServers.length +
    (Array.isArray(bundle.channelSkillBindings) ? bundle.channelSkillBindings.length : 0) - channelSkillBindings.length +
    (Array.isArray(bundle.channelMcpServerBindings) ? bundle.channelMcpServerBindings.length : 0) - channelMcpServerBindings.length;

  if (invalidCount > 0) {
    result.skipped.push(`${invalidCount} invalid bundle item(s) skipped`);
  }

  return {
    kind: 'itops-agent-platform.hermes-capabilities',
    version: 1,
    exportedAt: typeof bundle.exportedAt === 'string' ? bundle.exportedAt : new Date().toISOString(),
    skills,
    mcpServers,
    channelSkillBindings,
    channelMcpServerBindings
  };
}

function isValidSkill(value: unknown): value is SkillBundleItem {
  const item = value as SkillBundleItem;
  return Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.content === 'string');
}

function isValidMcpServer(value: unknown): value is McpServerBundleItem {
  const item = value as McpServerBundleItem;
  return Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.transport === 'string');
}

function isValidChannelSkillBinding(value: unknown): value is ChannelSkillBindingItem {
  const item = value as ChannelSkillBindingItem;
  return Boolean(item && typeof item.channel_id === 'string' && typeof item.skill_id === 'string');
}

function isValidChannelMcpBinding(value: unknown): value is ChannelMcpBindingItem {
  const item = value as ChannelMcpBindingItem;
  return Boolean(item && typeof item.channel_id === 'string' && typeof item.mcp_server_id === 'string');
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeEnabled(value: unknown): number {
  return value === false || value === 0 ? 0 : 1;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
