import axios, { AxiosError } from 'axios';
import { randomUUID } from 'crypto';
import db from '../models/database';

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpServerRecord {
  id: string;
  name: string;
  description: string | null;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  secret_ref: string | null;
  timeout_ms: number;
  enabled: number;
  health_status: string;
  last_checked_at: string | null;
  last_error: string | null;
  capabilities_summary: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HermesChannelMcpServerRecord extends McpServerRecord {
  binding_id: string;
  channel_id: string;
  mcp_server_id: string;
  binding_enabled: number;
  tool_import_mode: string;
  binding_created_at: string;
}

export interface McpRuntimeContext {
  id: string;
  name: string;
  transport: McpTransport;
  url?: string | null;
  toolImportMode: string;
  healthStatus: string;
}

export interface McpServerInput {
  name?: string;
  description?: string | null;
  transport?: string;
  command?: string | null;
  args?: string[];
  url?: string | null;
  secret_ref?: string | null;
  timeout_ms?: number;
  enabled?: boolean | number;
  capabilities_summary?: Record<string, unknown> | null;
}

export interface McpServerTestResult {
  success: boolean;
  status: string;
  latencyMs: number;
  transport: McpTransport;
  output?: string;
  error?: string;
}

export function listMcpServers(onlyEnabled = false): McpServerRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM mcp_servers
    ${onlyEnabled ? 'WHERE enabled = 1' : ''}
    ORDER BY name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(parseMcpServer);
}

export function getMcpServer(id: string): McpServerRecord | null {
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseMcpServer(row) : null;
}

export function createMcpServer(input: McpServerInput, createdBy?: string | null): McpServerRecord {
  const id = randomUUID();
  const normalized = normalizeMcpServerInput(input, true);

  db.prepare(`
    INSERT INTO mcp_servers (
      id, name, description, transport, command, args, url, secret_ref,
      timeout_ms, enabled, capabilities_summary, created_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    normalized.name,
    normalized.description,
    normalized.transport,
    normalized.command,
    JSON.stringify(normalized.args || []),
    normalized.url,
    normalized.secret_ref,
    normalized.timeout_ms,
    normalized.enabled,
    normalized.capabilities_summary ? JSON.stringify(normalized.capabilities_summary) : null,
    createdBy || null
  );

  return getMcpServer(id)!;
}

export function updateMcpServer(id: string, input: McpServerInput): McpServerRecord {
  const current = getMcpServer(id);
  if (!current) {
    throw new Error('MCP server not found');
  }

  const normalized = normalizeMcpServerInput(input, false);
  const merged = {
    name: normalized.name ?? current.name,
    description: normalized.description !== undefined ? normalized.description : current.description,
    transport: normalized.transport ?? current.transport,
    command: normalized.command !== undefined ? normalized.command : current.command,
    args: normalized.args ?? current.args,
    url: normalized.url !== undefined ? normalized.url : current.url,
    secret_ref: normalized.secret_ref !== undefined ? normalized.secret_ref : current.secret_ref,
    timeout_ms: normalized.timeout_ms ?? current.timeout_ms,
    enabled: normalized.enabled ?? current.enabled,
    capabilities_summary: normalized.capabilities_summary !== undefined ? normalized.capabilities_summary : current.capabilities_summary
  };

  db.prepare(`
    UPDATE mcp_servers
    SET name = ?,
        description = ?,
        transport = ?,
        command = ?,
        args = ?,
        url = ?,
        secret_ref = ?,
        timeout_ms = ?,
        enabled = ?,
        capabilities_summary = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    merged.name,
    merged.description,
    merged.transport,
    merged.command,
    JSON.stringify(merged.args),
    merged.url,
    merged.secret_ref,
    merged.timeout_ms,
    merged.enabled,
    merged.capabilities_summary ? JSON.stringify(merged.capabilities_summary) : null,
    id
  );

  return getMcpServer(id)!;
}

export async function testMcpServer(id: string): Promise<McpServerTestResult> {
  const server = getMcpServer(id);
  if (!server) {
    throw new Error('MCP server not found');
  }

  const startTime = Date.now();
  let result: McpServerTestResult;

  if (server.transport === 'stdio') {
    result = testStdioConfig(server, startTime);
  } else {
    result = await testHttpLikeServer(server, startTime);
  }

  db.prepare(`
    UPDATE mcp_servers
    SET health_status = ?,
        last_checked_at = CURRENT_TIMESTAMP,
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(result.status, result.success ? null : result.error || 'MCP server test failed', id);

  return result;
}

export function listChannelMcpServers(channelId: string): HermesChannelMcpServerRecord[] {
  const rows = db.prepare(`
    SELECT
      ms.*,
      hcms.id AS binding_id,
      hcms.channel_id,
      hcms.mcp_server_id,
      hcms.enabled AS binding_enabled,
      hcms.tool_import_mode,
      hcms.created_at AS binding_created_at
    FROM hermes_channel_mcp_servers hcms
    INNER JOIN mcp_servers ms ON ms.id = hcms.mcp_server_id
    WHERE hcms.channel_id = ?
    ORDER BY ms.name ASC
  `).all(channelId) as Array<Record<string, unknown>>;

  return rows.map(parseChannelMcpServer);
}

export function replaceChannelMcpServers(channelId: string, mcpServerIds: string[]): void {
  const uniqueServerIds = Array.from(new Set(mcpServerIds.map((serverId) => serverId.trim()).filter(Boolean)));
  const existingServers = new Set(listMcpServers().map((server) => server.id));
  const unknown = uniqueServerIds.filter((serverId) => !existingServers.has(serverId));
  if (unknown.length > 0) {
    throw new Error(`Unknown MCP server: ${unknown.join(', ')}`);
  }

  const deleteServers = db.prepare('DELETE FROM hermes_channel_mcp_servers WHERE channel_id = ?');
  const insertServer = db.prepare(`
    INSERT INTO hermes_channel_mcp_servers (id, channel_id, mcp_server_id, enabled, tool_import_mode)
    VALUES (?, ?, ?, 1, 'disabled')
  `);

  const transaction = db.transaction(() => {
    deleteServers.run(channelId);
    uniqueServerIds.forEach((serverId) => {
      insertServer.run(`${channelId}:${serverId}`, channelId, serverId);
    });
  });

  transaction();
}

export function toMcpRuntimeContext(server: HermesChannelMcpServerRecord): McpRuntimeContext {
  return {
    id: server.id,
    name: server.name,
    transport: server.transport,
    url: server.url,
    toolImportMode: server.tool_import_mode,
    healthStatus: server.health_status
  };
}

function testStdioConfig(server: McpServerRecord, startTime: number): McpServerTestResult {
  if (!server.command) {
    return {
      success: false,
      status: 'failed',
      latencyMs: Date.now() - startTime,
      transport: server.transport,
      error: 'stdio MCP server requires a command'
    };
  }

  return {
    success: true,
    status: 'configured',
    latencyMs: Date.now() - startTime,
    transport: server.transport,
    output: 'stdio MCP server configuration is valid; process execution is not enabled in registry baseline'
  };
}

async function testHttpLikeServer(server: McpServerRecord, startTime: number): Promise<McpServerTestResult> {
  if (!server.url) {
    return {
      success: false,
      status: 'failed',
      latencyMs: Date.now() - startTime,
      transport: server.transport,
      error: `${server.transport} MCP server requires a URL`
    };
  }

  try {
    const url = new URL(server.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('MCP server URL must use http or https');
    }

    const response = await axios.get(url.toString(), {
      timeout: Math.min(server.timeout_ms || 30000, 30000),
      validateStatus: (status) => status < 500
    });

    return {
      success: true,
      status: 'healthy',
      latencyMs: Date.now() - startTime,
      transport: server.transport,
      output: `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      success: false,
      status: 'failed',
      latencyMs: Date.now() - startTime,
      transport: server.transport,
      error: toMcpError(error)
    };
  }
}

function parseMcpServer(row: Record<string, unknown>): McpServerRecord {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: nullableString(row.description),
    transport: parseTransport(row.transport),
    command: nullableString(row.command),
    args: parseStringArray(row.args),
    url: nullableString(row.url),
    secret_ref: nullableString(row.secret_ref),
    timeout_ms: Number(row.timeout_ms || 30000),
    enabled: Number(row.enabled ?? 1),
    health_status: String(row.health_status || 'unknown'),
    last_checked_at: nullableString(row.last_checked_at),
    last_error: nullableString(row.last_error),
    capabilities_summary: parseJsonObject(row.capabilities_summary),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function parseChannelMcpServer(row: Record<string, unknown>): HermesChannelMcpServerRecord {
  return {
    ...parseMcpServer(row),
    binding_id: String(row.binding_id || ''),
    channel_id: String(row.channel_id || ''),
    mcp_server_id: String(row.mcp_server_id || row.id || ''),
    binding_enabled: Number(row.binding_enabled ?? 1),
    tool_import_mode: String(row.tool_import_mode || 'disabled'),
    binding_created_at: String(row.binding_created_at || '')
  };
}

function normalizeMcpServerInput(input: McpServerInput, requireName: boolean): McpServerInput & { transport?: McpTransport; enabled?: number } {
  const normalized: McpServerInput & { transport?: McpTransport; enabled?: number } = {};

  if (typeof input.name === 'string' && input.name.trim()) {
    normalized.name = input.name.trim();
  } else if (requireName) {
    throw new Error('MCP server name is required');
  }

  if ('description' in input) {
    normalized.description = typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;
  }

  if (typeof input.transport === 'string' && input.transport.trim()) {
    normalized.transport = parseTransport(input.transport);
  } else if (requireName) {
    normalized.transport = 'http';
  }

  if ('command' in input) {
    normalized.command = typeof input.command === 'string' && input.command.trim()
      ? input.command.trim()
      : null;
  }

  if (Array.isArray(input.args)) {
    normalized.args = input.args.filter((arg): arg is string => typeof arg === 'string' && arg.trim().length > 0);
  } else if (requireName) {
    normalized.args = [];
  }

  if ('url' in input) {
    normalized.url = typeof input.url === 'string' && input.url.trim()
      ? input.url.trim()
      : null;
  }

  if ('secret_ref' in input) {
    normalized.secret_ref = typeof input.secret_ref === 'string' && input.secret_ref.trim()
      ? input.secret_ref.trim()
      : null;
  }

  if (input.timeout_ms !== undefined) {
    normalized.timeout_ms = clampNumber(input.timeout_ms, 1000, 120000, 30000);
  } else if (requireName) {
    normalized.timeout_ms = 30000;
  }

  if (input.enabled !== undefined) {
    normalized.enabled = input.enabled === true || input.enabled === 1 ? 1 : 0;
  } else if (requireName) {
    normalized.enabled = 1;
  }

  if ('capabilities_summary' in input) {
    normalized.capabilities_summary = input.capabilities_summary && typeof input.capabilities_summary === 'object' && !Array.isArray(input.capabilities_summary)
      ? input.capabilities_summary
      : null;
  }

  return normalized;
}

function parseTransport(value: unknown): McpTransport {
  const transport = String(value || 'http').trim();
  if (transport === 'stdio' || transport === 'http' || transport === 'sse') {
    return transport;
  }
  throw new Error('MCP transport must be one of: stdio, http, sse');
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

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toMcpError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return axiosError.response?.status
      ? `HTTP ${axiosError.response.status}: ${axiosError.message}`
      : axiosError.message;
  }

  return error instanceof Error ? error.message : String(error);
}
