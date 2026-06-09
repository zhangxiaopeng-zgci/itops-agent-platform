import db from '../../models/database';
import { executeCommand } from '../sshService';
import { evaluateReadOnlyCommand } from './policyGuard';
import { ToolContext, ToolDefinition, ToolInvocationResult } from './types';

const VALID_ALERT_STATUSES = new Set(['new', 'acknowledged', 'resolved']);
const VALID_ALERT_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export const listServersTool: ToolDefinition = {
  name: 'list_servers',
  description: 'List managed servers without returning secrets such as passwords or private keys.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      limit: { type: 'number', minimum: 1, maximum: 200 }
    }
  },
  execute(input: Record<string, unknown>) {
    const limit = clampLimit(input.limit, 50, 200);
    let query = `
      SELECT id, name, hostname, port, username, description, tags, os, os_type, enabled,
             last_connected, ip_address, private_ip, cloud_provider, cloud_instance_id,
             created_at, updated_at
      FROM servers
    `;
    const params: unknown[] = [];

    if (typeof input.enabled === 'boolean') {
      query += ' WHERE enabled = ?';
      params.push(input.enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const servers = db.prepare(query).all(...params) as Array<{ tags?: string; [key: string]: unknown }>;
    return servers.map((server) => ({
      ...server,
      tags: parseJsonField(server.tags, [])
    }));
  }
};

export const queryAlertsTool: ToolDefinition = {
  name: 'query_alerts',
  description: 'Query recent alerts by status and severity.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: Array.from(VALID_ALERT_STATUSES) },
      severity: { type: 'string', enum: Array.from(VALID_ALERT_SEVERITIES) },
      limit: { type: 'number', minimum: 1, maximum: 100 }
    }
  },
  execute(input: Record<string, unknown>) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (typeof input.status === 'string' && VALID_ALERT_STATUSES.has(input.status)) {
      conditions.push('status = ?');
      params.push(input.status);
    }

    if (typeof input.severity === 'string' && VALID_ALERT_SEVERITIES.has(input.severity)) {
      conditions.push('severity = ?');
      params.push(input.severity);
    }

    let query = 'SELECT * FROM alerts';
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(clampLimit(input.limit, 50, 100));

    const alerts = db.prepare(query).all(...params) as Array<{ metadata?: string; [key: string]: unknown }>;
    return alerts.map((alert) => ({
      ...alert,
      metadata: parseJsonField(alert.metadata, {})
    }));
  }
};

export const searchKnowledgeBaseTool: ToolDefinition = {
  name: 'search_knowledge_base',
  description: 'Search operational knowledge base entries by query text and optional category.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      category: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 50 }
    }
  },
  execute(input: Record<string, unknown>) {
    const queryText = requireString(input, 'query');
    const params: unknown[] = [`%${queryText}%`, `%${queryText}%`];
    const conditions = ['(title LIKE ? OR content LIKE ?)'];

    if (typeof input.category === 'string' && input.category.trim().length > 0) {
      conditions.push('category = ?');
      params.push(input.category.trim());
    }

    const limit = clampLimit(input.limit, 20, 50);
    params.push(limit);

    const rows = db.prepare(`
      SELECT *
      FROM knowledge_base
      WHERE ${conditions.join(' AND ')}
      ORDER BY usage_count DESC, created_at DESC
      LIMIT ?
    `).all(...params) as Array<{ tags?: string; solutions?: string; related_alerts?: string; [key: string]: unknown }>;

    return rows.map((row) => ({
      ...row,
      tags: parseJsonField(row.tags, []),
      solutions: parseJsonField(row.solutions, []),
      related_alerts: parseJsonField(row.related_alerts, [])
    }));
  }
};

export const runReadOnlyCommandTool: ToolDefinition = {
  name: 'run_readonly_command',
  description: 'Run a command from a strict read-only allowlist against a managed server.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['serverId', 'command'],
    properties: {
      serverId: { type: 'string' },
      command: { type: 'string' },
      timeout: { type: 'number', minimum: 1000, maximum: 30000 }
    }
  },
  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolInvocationResult> {
    const serverId = requireString(input, 'serverId');
    const command = requireString(input, 'command');
    const commandDecision = evaluateReadOnlyCommand(command, context.userRole);

    if (commandDecision.status !== 'allowed') {
      return {
        success: false,
        tool: 'run_readonly_command',
        decision: commandDecision,
        error: commandDecision.reason || 'Command was not allowed'
      };
    }

    const timeout = clampLimit(input.timeout, 30000, 30000);
    const result = await executeCommand(serverId, command, {
      timeout,
      executedBy: context.userId || 'tool-api'
    });

    return {
      success: result.success,
      tool: 'run_readonly_command',
      decision: commandDecision,
      data: result,
      error: result.success ? undefined : result.error || result.stderr || 'Command failed'
    };
  }
};

export const toolDefinitions = [
  listServersTool,
  queryAlertsTool,
  searchKnowledgeBaseTool,
  runReadOnlyCommandTool
];
