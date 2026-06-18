import db from '../models/database';
import { listHermesChannels } from './hermesChannelService';

export interface AgentCapabilitySummary {
  teams: Array<{
    id: string;
    name: string;
    role: string;
  }>;
  channel: {
    id: string;
    name: string;
    type: string;
    health_status: string;
  } | null;
  skills: {
    count: number;
    names: string[];
  };
  mcpServers: {
    count: number;
    healthy: number;
    unhealthy: number;
    names: string[];
  };
  tools: {
    count: number;
    highRisk: number;
    names: string[];
  };
  risk: {
    autonomy_level: string;
    tool_policy_id: string | null;
    approval_required: boolean;
  };
  executionQuality: {
    recentTotal: number;
    recentSuccess: number;
    recentFailure: number;
    successRate: number | null;
    lastStatus: string | null;
    lastExecutedAt: string | null;
    averageLatencyMs: number | null;
  };
}

interface AgentCapabilityInput {
  id: string;
  runtime?: string | null;
  channel_id?: string | null;
  autonomy_level?: string | null;
  tool_policy_id?: string | null;
}

export function summarizeAgentCapability(agent: AgentCapabilityInput): AgentCapabilitySummary {
  const channels = listHermesChannels();
  const channel = agent.channel_id
    ? channels.find((item) => item.id === agent.channel_id) || null
    : null;
  const enabledSkills = channel?.skills.filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1) || [];
  const enabledMcpServers = channel?.mcpServers.filter((server) => server.enabled === 1 && server.binding_enabled === 1) || [];
  const enabledTools = channel?.tools.filter((tool) => tool.enabled === 1) || [];
  const autonomyLevel = agent.autonomy_level || 'suggest';

  return {
    teams: listAgentTeamsForCapability(agent.id, channel?.type || null),
    channel: channel
      ? {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        health_status: channel.health_status
      }
      : null,
    skills: {
      count: enabledSkills.length,
      names: enabledSkills.map((skill) => skill.name).slice(0, 5)
    },
    mcpServers: {
      count: enabledMcpServers.length,
      healthy: enabledMcpServers.filter((server) => ['healthy', 'unknown'].includes(String(server.health_status))).length,
      unhealthy: enabledMcpServers.filter((server) => !['healthy', 'unknown'].includes(String(server.health_status))).length,
      names: enabledMcpServers.map((server) => server.name).slice(0, 5)
    },
    tools: {
      count: enabledTools.length,
      highRisk: enabledTools.filter((tool) => ['high', 'critical'].includes(String(tool.risk_level_override || '').toLowerCase())).length,
      names: enabledTools.map((tool) => tool.tool_name).slice(0, 6)
    },
    risk: {
      autonomy_level: autonomyLevel,
      tool_policy_id: agent.tool_policy_id || channel?.policy_id || null,
      approval_required: autonomyLevel === 'approval_required' || enabledTools.some((tool) => ['high', 'critical'].includes(String(tool.risk_level_override || '').toLowerCase()))
    },
    executionQuality: summarizeExecutionQuality(agent.id)
  };
}

export function attachAgentCapabilitySummaries<T extends AgentCapabilityInput>(agents: T[]): Array<T & { capability_summary: AgentCapabilitySummary }> {
  return agents.map((agent) => ({
    ...agent,
    capability_summary: summarizeAgentCapability(agent)
  }));
}

function listAgentTeamsForCapability(agentId: string, channelType: string | null): AgentCapabilitySummary['teams'] {
  const rows = channelType
    ? db.prepare(`
        SELECT DISTINCT
          t.id,
          t.name,
          m.role
        FROM agent_team_members m
        JOIN agent_teams t ON t.id = m.team_id
        WHERE m.enabled = 1
          AND (m.agent_id = ? OR (m.agent_id IS NULL AND m.channel_type = ?))
        ORDER BY t.name ASC, m.step_order ASC
      `).all(agentId, channelType) as Array<Record<string, unknown>>
    : db.prepare(`
        SELECT DISTINCT
          t.id,
          t.name,
          m.role
        FROM agent_team_members m
        JOIN agent_teams t ON t.id = m.team_id
        WHERE m.enabled = 1
          AND m.agent_id = ?
        ORDER BY t.name ASC, m.step_order ASC
      `).all(agentId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    role: String(row.role || '')
  }));
}

function summarizeExecutionQuality(agentId: string): AgentCapabilitySummary['executionQuality'] {
  const rows = db.prepare(`
    SELECT status, execution_time_ms, created_at
    FROM agent_executions
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(agentId) as Array<Record<string, unknown>>;

  const successCount = rows.filter((row) => String(row.status) === 'success').length;
  const failureCount = rows.filter((row) => String(row.status) !== 'success').length;
  const latencies = rows
    .map((row) => Number(row.execution_time_ms || 0))
    .filter((latency) => Number.isFinite(latency) && latency > 0);

  return {
    recentTotal: rows.length,
    recentSuccess: successCount,
    recentFailure: failureCount,
    successRate: rows.length > 0 ? Math.round((successCount / rows.length) * 100) : null,
    lastStatus: rows.length > 0 ? String(rows[0].status || 'unknown') : null,
    lastExecutedAt: rows.length > 0 ? String(rows[0].created_at || '') : null,
    averageLatencyMs: latencies.length > 0
      ? Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length)
      : null
  };
}
