import db from '../models/database';
import { listHermesChannels } from './hermesChannelService';
import { getHermesWorkerStatuses, HermesWorkerStatus } from './hermesWorkerService';
import { listEvolutionReleaseVersions } from './evolutionReleaseService';

export interface HermesControlPlaneAgentBinding {
  id: string;
  name: string;
  role: string;
  runtime: string | null;
  enabled: number;
  channel_id: string | null;
  channel_name: string | null;
  channel_type: string | null;
}

export interface HermesControlPlaneCapabilityInventory {
  channelId: string;
  channelName: string;
  channelType: string;
  model: string;
  healthStatus: string;
  policyId: string | null;
  enabledTools: number;
  highRiskTools: number;
  enabledSkills: number;
  enabledMcpServers: number;
  unhealthyMcpServers: number;
  secretRef: string;
  workerRole: string | null;
  workerHealthy: boolean;
  fallbackRuns24h: number;
}

export interface HermesControlPlaneEvolutionState {
  proposalsByStatus: Record<string, number>;
  proposalsByType: Record<string, number>;
  reviewQueueByStatus: Record<string, number>;
  taskRunsByStatus24h: Record<string, number>;
  activeReleaseCount: number;
  latestProposalAt: string | null;
  latestReleaseAt: string | null;
}

export interface HermesControlPlaneGraphNode {
  id: string;
  type: 'agent' | 'channel' | 'worker' | 'tool' | 'skill' | 'mcp' | 'release';
  label: string;
  status?: string | null;
  metadata?: Record<string, unknown>;
}

export interface HermesControlPlaneGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'binds_to' | 'routes_to' | 'allows' | 'injects' | 'connects' | 'publishes';
}

export interface HermesControlPlaneCapabilityGraph {
  nodes: HermesControlPlaneGraphNode[];
  edges: HermesControlPlaneGraphEdge[];
}

export interface HermesControlPlaneRiskSummaryItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'runtime' | 'capability' | 'evolution' | 'release';
  code:
    | 'channel_without_worker'
    | 'worker_unhealthy'
    | 'fallback_runs'
    | 'legacy_agent_config'
    | 'high_risk_tools_without_policy'
    | 'mcp_unhealthy'
    | 'stale_review_queue'
    | 'no_active_release';
  action: 'check_worker' | 'bind_channel' | 'review_policy' | 'review_mcp' | 'review_evolution' | 'publish_release';
  channelId?: string | null;
  channelName?: string | null;
  workerRole?: string | null;
  count?: number;
}

export interface HermesControlPlaneRiskSummary {
  generatedAt: string;
  items: HermesControlPlaneRiskSummaryItem[];
}

export interface HermesControlPlaneOverview {
  generatedAt: string;
  channels: ReturnType<typeof listHermesChannels>;
  workers: HermesWorkerStatus[];
  agentBindings: HermesControlPlaneAgentBinding[];
  capabilityInventory: HermesControlPlaneCapabilityInventory[];
  productSummary: HermesControlPlaneProductSummary;
  evolutionState: HermesControlPlaneEvolutionState;
  releaseState: {
    active: ReturnType<typeof listEvolutionReleaseVersions>;
    recent: ReturnType<typeof listEvolutionReleaseVersions>;
  };
  capabilityGraph: HermesControlPlaneCapabilityGraph;
  riskSummary: HermesControlPlaneRiskSummary;
}

export interface HermesControlPlaneProductSummary {
  teamTopology: {
    teams: number;
    readyTeams: number;
    pendingTeams: number;
    boundAgents: number;
  };
  channelHealth: {
    channels: number;
    healthyChannels: number;
    unhealthyChannels: number;
    workers: number;
    healthyWorkers: number;
  };
  capabilityCoverage: {
    tools: number;
    highRiskTools: number;
    skills: number;
    mcpServers: number;
    unhealthyMcpServers: number;
    activeReleases: number;
  };
  executionQuality: {
    workerRuns24h: number;
    workerSuccessRate: number | null;
    failedRuns24h: number;
    fallbackRuns24h: number;
  };
  evolutionFeedback: {
    proposals: number;
    pendingProposals: number;
    reviewQueue: number;
    staleReviewQueue: number;
    activeReleases: number;
  };
  riskPosture: {
    critical: number;
    warning: number;
    info: number;
    topActions: string[];
  };
}

export async function getHermesControlPlaneOverview(): Promise<HermesControlPlaneOverview> {
  const channels = listHermesChannels();
  const workers = await getHermesWorkerStatuses();
  const agentBindings = listHermesAgentBindings();
  const activeReleases = listEvolutionReleaseVersions({ status: 'active', limit: 20 });
  const recentReleases = listEvolutionReleaseVersions({ limit: 20 });
  const capabilityInventory = buildCapabilityInventory(channels, workers);
  const evolutionState = buildEvolutionState(activeReleases.length);
  const releaseState = {
    active: activeReleases,
    recent: recentReleases
  };
  const capabilityGraph = buildCapabilityGraph(channels, workers, agentBindings, activeReleases);
  const riskSummary = buildRiskSummary(capabilityInventory, agentBindings, evolutionState);
  const productSummary = buildProductSummary(capabilityInventory, workers, agentBindings, evolutionState, riskSummary);

  return {
    generatedAt: new Date().toISOString(),
    channels,
    workers,
    agentBindings,
    capabilityInventory,
    productSummary,
    evolutionState,
    releaseState,
    capabilityGraph,
    riskSummary
  };
}

export async function getHermesCapabilityGraph(): Promise<HermesControlPlaneCapabilityGraph> {
  const channels = listHermesChannels();
  const workers = await getHermesWorkerStatuses();
  const agentBindings = listHermesAgentBindings();
  const activeReleases = listEvolutionReleaseVersions({ status: 'active', limit: 50 });
  return buildCapabilityGraph(channels, workers, agentBindings, activeReleases);
}

export async function getHermesRiskSummary(): Promise<HermesControlPlaneRiskSummary> {
  const channels = listHermesChannels();
  const workers = await getHermesWorkerStatuses();
  const agentBindings = listHermesAgentBindings();
  const activeReleaseCount = listEvolutionReleaseVersions({ status: 'active', limit: 1 }).length;
  return buildRiskSummary(
    buildCapabilityInventory(channels, workers),
    agentBindings,
    buildEvolutionState(activeReleaseCount)
  );
}

function listHermesAgentBindings(): HermesControlPlaneAgentBinding[] {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.role,
      a.runtime,
      a.enabled,
      a.channel_id,
      hc.name AS channel_name,
      hc.type AS channel_type
    FROM agents a
    LEFT JOIN hermes_channels hc ON hc.id = a.channel_id
    WHERE a.runtime = 'hermes' OR a.channel_id IS NOT NULL OR a.name LIKE 'Hermes %'
    ORDER BY
      CASE hc.type
        WHEN 'diagnose' THEN 1
        WHEN 'remediate' THEN 2
        WHEN 'review' THEN 3
        ELSE 4
      END,
      a.name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name || ''),
    role: String(row.role || ''),
    runtime: nullableString(row.runtime),
    enabled: Number(row.enabled ?? 0),
    channel_id: nullableString(row.channel_id),
    channel_name: nullableString(row.channel_name),
    channel_type: nullableString(row.channel_type)
  }));
}

function buildCapabilityInventory(
  channels: ReturnType<typeof listHermesChannels>,
  workers: HermesWorkerStatus[]
): HermesControlPlaneCapabilityInventory[] {
  return channels.map(channel => {
    const worker = workers.find(item => item.channelType === channel.type) || null;
    const enabledTools = channel.tools.filter(tool => tool.enabled === 1);
    const enabledSkills = channel.skills.filter(skill => skill.enabled === 1 && skill.binding_enabled === 1);
    const enabledMcpServers = channel.mcpServers.filter(server => server.enabled === 1 && server.binding_enabled === 1);
    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      model: channel.model,
      healthStatus: channel.health_status,
      policyId: channel.policy_id || null,
      enabledTools: enabledTools.length,
      highRiskTools: enabledTools.filter(tool => ['high', 'critical'].includes(String(tool.risk_level_override || '').toLowerCase())).length,
      enabledSkills: enabledSkills.length,
      enabledMcpServers: enabledMcpServers.length,
      unhealthyMcpServers: enabledMcpServers.filter(server => !['healthy', 'unknown'].includes(String(server.health_status))).length,
      secretRef: channel.api_key_ref,
      workerRole: worker?.role || null,
      workerHealthy: Boolean(worker?.healthy),
      fallbackRuns24h: worker?.runStats?.fallbackRuns || 0
    };
  });
}

function buildEvolutionState(activeReleaseCount: number): HermesControlPlaneEvolutionState {
  return {
    proposalsByStatus: countBy('evolution_proposals', 'status'),
    proposalsByType: countBy('evolution_proposals', 'type'),
    reviewQueueByStatus: countBy('evolution_review_queue', 'status'),
    taskRunsByStatus24h: countBy('evolution_task_runs', 'status', "started_at >= datetime('now', '-24 hours')"),
    activeReleaseCount,
    latestProposalAt: getScalarString('SELECT MAX(created_at) AS value FROM evolution_proposals'),
    latestReleaseAt: getScalarString('SELECT MAX(published_at) AS value FROM evolution_release_versions')
  };
}

function buildCapabilityGraph(
  channels: ReturnType<typeof listHermesChannels>,
  workers: HermesWorkerStatus[],
  agentBindings: HermesControlPlaneAgentBinding[],
  activeReleases: ReturnType<typeof listEvolutionReleaseVersions>
): HermesControlPlaneCapabilityGraph {
  const nodes = new Map<string, HermesControlPlaneGraphNode>();
  const edges = new Map<string, HermesControlPlaneGraphEdge>();

  const addNode = (node: HermesControlPlaneGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: HermesControlPlaneGraphEdge) => {
    if (!edges.has(edge.id)) edges.set(edge.id, edge);
  };

  channels.forEach(channel => {
    const channelNodeId = `channel:${channel.id}`;
    addNode({
      id: channelNodeId,
      type: 'channel',
      label: channel.name,
      status: channel.health_status,
      metadata: {
        channelType: channel.type,
        model: channel.model,
        policyId: channel.policy_id || null,
        maxToolRounds: channel.max_tool_rounds
      }
    });

    workers
      .filter(worker => worker.channelType === channel.type)
      .forEach(worker => {
        const workerNodeId = `worker:${worker.role}`;
        addNode({
          id: workerNodeId,
          type: 'worker',
          label: worker.name,
          status: worker.configured ? worker.status : 'unknown',
          metadata: {
            role: worker.role,
            url: worker.url || null,
            healthy: worker.healthy,
            fallbackRuns24h: worker.runStats?.fallbackRuns || 0
          }
        });
        addEdge({
          id: `${channelNodeId}->${workerNodeId}`,
          source: channelNodeId,
          target: workerNodeId,
          type: 'routes_to'
        });
      });

    channel.tools
      .filter(tool => tool.enabled === 1)
      .forEach(tool => {
        const toolNodeId = `tool:${tool.tool_name}`;
        addNode({
          id: toolNodeId,
          type: 'tool',
          label: tool.tool_name,
          status: tool.risk_level_override || null,
          metadata: { riskLevel: tool.risk_level_override || null }
        });
        addEdge({
          id: `${channelNodeId}->${toolNodeId}`,
          source: channelNodeId,
          target: toolNodeId,
          type: 'allows'
        });
      });

    channel.skills
      .filter(skill => skill.enabled === 1 && skill.binding_enabled === 1)
      .forEach(skill => {
        const skillNodeId = `skill:${skill.skill_id}`;
        addNode({
          id: skillNodeId,
          type: 'skill',
          label: skill.name,
          status: skill.version,
          metadata: {
            category: skill.category,
            version: skill.version
          }
        });
        addEdge({
          id: `${channelNodeId}->${skillNodeId}`,
          source: channelNodeId,
          target: skillNodeId,
          type: 'injects'
        });
      });

    channel.mcpServers
      .filter(server => server.enabled === 1 && server.binding_enabled === 1)
      .forEach(server => {
        const mcpNodeId = `mcp:${server.mcp_server_id}`;
        addNode({
          id: mcpNodeId,
          type: 'mcp',
          label: server.name,
          status: server.health_status,
          metadata: {
            transport: server.transport,
            toolImportMode: server.tool_import_mode
          }
        });
        addEdge({
          id: `${channelNodeId}->${mcpNodeId}`,
          source: channelNodeId,
          target: mcpNodeId,
          type: 'connects'
        });
      });
  });

  agentBindings.forEach(agent => {
    const agentNodeId = `agent:${agent.id}`;
    addNode({
      id: agentNodeId,
      type: 'agent',
      label: agent.name,
      status: agent.enabled === 1 ? 'enabled' : 'disabled',
      metadata: {
        role: agent.role,
        runtime: agent.runtime,
        channelType: agent.channel_type
      }
    });
    if (agent.channel_id) {
      addEdge({
        id: `${agentNodeId}->channel:${agent.channel_id}`,
        source: agentNodeId,
        target: `channel:${agent.channel_id}`,
        type: 'binds_to'
      });
    }
  });

  activeReleases.forEach(release => {
    const releaseNodeId = `release:${release.id}`;
    addNode({
      id: releaseNodeId,
      type: 'release',
      label: release.version_label,
      status: release.status,
      metadata: {
        objectType: release.object_type,
        targetId: release.target_id,
        publishedAt: release.published_at
      }
    });
    if (release.target_id) {
      addEdge({
        id: `${releaseNodeId}->${release.object_type}:${release.target_id}`,
        source: releaseNodeId,
        target: `${release.object_type}:${release.target_id}`,
        type: 'publishes'
      });
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values())
  };
}

function buildRiskSummary(
  inventory: HermesControlPlaneCapabilityInventory[],
  agentBindings: HermesControlPlaneAgentBinding[],
  evolutionState: HermesControlPlaneEvolutionState
): HermesControlPlaneRiskSummary {
  const items: HermesControlPlaneRiskSummaryItem[] = [];

  inventory.forEach(item => {
    if (!item.workerRole) {
      items.push({
        id: `channel_without_worker:${item.channelId}`,
        severity: 'critical',
        category: 'runtime',
        code: 'channel_without_worker',
        action: 'check_worker',
        channelId: item.channelId,
        channelName: item.channelName
      });
    } else if (!item.workerHealthy) {
      items.push({
        id: `worker_unhealthy:${item.channelId}`,
        severity: 'critical',
        category: 'runtime',
        code: 'worker_unhealthy',
        action: 'check_worker',
        channelId: item.channelId,
        channelName: item.channelName,
        workerRole: item.workerRole
      });
    }

    if (item.fallbackRuns24h > 0) {
      items.push({
        id: `fallback_runs:${item.channelId}`,
        severity: item.fallbackRuns24h >= 3 ? 'warning' : 'info',
        category: 'runtime',
        code: 'fallback_runs',
        action: 'check_worker',
        channelId: item.channelId,
        channelName: item.channelName,
        workerRole: item.workerRole,
        count: item.fallbackRuns24h
      });
    }

    if (item.highRiskTools > 0 && !item.policyId) {
      items.push({
        id: `high_risk_tools_without_policy:${item.channelId}`,
        severity: 'critical',
        category: 'capability',
        code: 'high_risk_tools_without_policy',
        action: 'review_policy',
        channelId: item.channelId,
        channelName: item.channelName,
        count: item.highRiskTools
      });
    }

    if (item.unhealthyMcpServers > 0) {
      items.push({
        id: `mcp_unhealthy:${item.channelId}`,
        severity: 'warning',
        category: 'capability',
        code: 'mcp_unhealthy',
        action: 'review_mcp',
        channelId: item.channelId,
        channelName: item.channelName,
        count: item.unhealthyMcpServers
      });
    }
  });

  const legacyAgents = agentBindings.filter(agent => agent.runtime === 'hermes' && !agent.channel_id);
  if (legacyAgents.length > 0) {
    items.push({
      id: 'legacy_agent_config',
      severity: 'warning',
      category: 'capability',
      code: 'legacy_agent_config',
      action: 'bind_channel',
      count: legacyAgents.length
    });
  }

  const staleReviewCount = countRows('evolution_review_queue', "status IN ('queued', 'reviewing') AND created_at <= datetime('now', '-7 days')");
  if (staleReviewCount > 0) {
    items.push({
      id: 'stale_review_queue',
      severity: 'warning',
      category: 'evolution',
      code: 'stale_review_queue',
      action: 'review_evolution',
      count: staleReviewCount
    });
  }

  if (evolutionState.activeReleaseCount === 0) {
    items.push({
      id: 'no_active_release',
      severity: 'info',
      category: 'release',
      code: 'no_active_release',
      action: 'publish_release'
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    items
  };
}

function buildProductSummary(
  inventory: HermesControlPlaneCapabilityInventory[],
  workers: HermesWorkerStatus[],
  agentBindings: HermesControlPlaneAgentBinding[],
  evolutionState: HermesControlPlaneEvolutionState,
  riskSummary: HermesControlPlaneRiskSummary
): HermesControlPlaneProductSummary {
  const totalWorkerRuns = workers.reduce((sum, worker) => sum + Number(worker.runStats?.totalRuns || 0), 0);
  const successWorkerRuns = workers.reduce((sum, worker) => sum + Number(worker.runStats?.successRuns || 0), 0);
  const failedWorkerRuns = workers.reduce((sum, worker) => sum + Number(worker.runStats?.failedRuns || 0), 0);
  const fallbackRuns = inventory.reduce((sum, item) => sum + item.fallbackRuns24h, 0);
  const proposals = sumRecord(evolutionState.proposalsByStatus);
  const pendingProposals = ['draft', 'generated', 'eval_pending', 'eval_failed', 'approval_pending']
    .reduce((sum, status) => sum + Number(evolutionState.proposalsByStatus[status] || 0), 0);
  const reviewQueue = sumRecord(evolutionState.reviewQueueByStatus);
  const riskCounts = riskSummary.items.reduce<Record<string, number>>((counts, item) => {
    counts[item.severity] = Number(counts[item.severity] || 0) + 1;
    return counts;
  }, {});
  const teamTopology = summarizeTeamTopology(agentBindings);

  return {
    teamTopology,
    channelHealth: {
      channels: inventory.length,
      healthyChannels: inventory.filter((item) => item.healthStatus === 'healthy').length,
      unhealthyChannels: inventory.filter((item) => item.healthStatus !== 'healthy').length,
      workers: workers.length,
      healthyWorkers: workers.filter((worker) => worker.healthy).length
    },
    capabilityCoverage: {
      tools: inventory.reduce((sum, item) => sum + item.enabledTools, 0),
      highRiskTools: inventory.reduce((sum, item) => sum + item.highRiskTools, 0),
      skills: inventory.reduce((sum, item) => sum + item.enabledSkills, 0),
      mcpServers: inventory.reduce((sum, item) => sum + item.enabledMcpServers, 0),
      unhealthyMcpServers: inventory.reduce((sum, item) => sum + item.unhealthyMcpServers, 0),
      activeReleases: evolutionState.activeReleaseCount
    },
    executionQuality: {
      workerRuns24h: totalWorkerRuns,
      workerSuccessRate: totalWorkerRuns > 0 ? Math.round((successWorkerRuns / totalWorkerRuns) * 100) : null,
      failedRuns24h: failedWorkerRuns,
      fallbackRuns24h: fallbackRuns
    },
    evolutionFeedback: {
      proposals,
      pendingProposals,
      reviewQueue,
      staleReviewQueue: countRows('evolution_review_queue', "status IN ('queued', 'reviewing') AND created_at <= datetime('now', '-7 days')"),
      activeReleases: evolutionState.activeReleaseCount
    },
    riskPosture: {
      critical: Number(riskCounts.critical || 0),
      warning: Number(riskCounts.warning || 0),
      info: Number(riskCounts.info || 0),
      topActions: Array.from(new Set(riskSummary.items.map((item) => item.action))).slice(0, 4)
    }
  };
}

function summarizeTeamTopology(agentBindings: HermesControlPlaneAgentBinding[]): HermesControlPlaneProductSummary['teamTopology'] {
  const rows = db.prepare(`
    SELECT
      t.id,
      m.role,
      m.required,
      m.enabled,
      m.agent_id,
      m.channel_type
    FROM agent_teams t
    LEFT JOIN agent_team_members m ON m.team_id = t.id
  `).all() as Array<Record<string, unknown>>;
  const teams = new Map<string, Array<Record<string, unknown>>>();
  rows.forEach((row) => {
    const teamId = String(row.id || '');
    if (!teamId) return;
    const members = teams.get(teamId) || [];
    members.push(row);
    teams.set(teamId, members);
  });

  let readyTeams = 0;
  teams.forEach((members) => {
    const requiredMembers = members.filter((member) => Number(member.required ?? 1) === 1 && Number(member.enabled ?? 1) === 1);
    const missing = requiredMembers.some((member) => {
      if (String(member.role || '') === 'leader') return false;
      return !nullableString(member.channel_type);
    });
    if (!missing) readyTeams += 1;
  });

  return {
    teams: teams.size,
    readyTeams,
    pendingTeams: Math.max(0, teams.size - readyTeams),
    boundAgents: agentBindings.filter((agent) => Boolean(agent.channel_id)).length
  };
}

function sumRecord(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, count) => sum + Number(count || 0), 0);
}

function countBy(table: string, column: string, where = '1=1'): Record<string, number> {
  const allowedTables = new Set(['evolution_proposals', 'evolution_review_queue', 'evolution_task_runs']);
  const allowedColumns = new Set(['status', 'type']);
  if (!allowedTables.has(table) || !allowedColumns.has(column)) {
    return {};
  }

  const rows = db.prepare(`
    SELECT ${column} AS key, COUNT(*) AS count
    FROM ${table}
    WHERE ${where}
    GROUP BY ${column}
  `).all() as Array<{ key: string | null; count: number }>;

  return rows.reduce<Record<string, number>>((result, row) => {
    result[String(row.key || 'unknown')] = Number(row.count || 0);
    return result;
  }, {});
}

function getScalarString(sql: string): string | null {
  const row = db.prepare(sql).get() as { value?: string | null } | undefined;
  return row?.value || null;
}

function countRows(table: string, where = '1=1'): number {
  const allowedTables = new Set(['evolution_review_queue']);
  if (!allowedTables.has(table)) {
    return 0;
  }
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as { count?: number } | undefined;
  return Number(row?.count || 0);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
