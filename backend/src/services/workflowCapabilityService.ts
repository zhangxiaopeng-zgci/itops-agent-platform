import db from '../models/database';
import { WorkflowNode } from '../types';
import { listHermesChannels } from './hermesChannelService';

export interface WorkflowCapabilitySummary {
  hermesEnhanced: boolean;
  runbookDriven: boolean;
  collaborationMode: string | null;
  runbookPattern: string | null;
  agentTeams: Array<{
    id: string;
    name: string;
    team_type: string;
  }>;
  agents: Array<{
    id: string;
    name: string;
    runtime: string | null;
    channel_id: string | null;
    channel_name: string | null;
    channel_type: string | null;
  }>;
  skills: {
    count: number;
    ids: string[];
    names: string[];
  };
  mcpServers: {
    count: number;
    unhealthy: number;
    ids: string[];
    names: string[];
  };
  channelBundles: {
    count: number;
    ready: number;
    needsReview: number;
    releaseOverlays: number;
    warnings: string[];
    channels: Array<{
      id: string;
      name: string;
      type: string;
      ready: boolean;
      warnings: string[];
      agents: number;
      tools: number;
      highRiskTools: number;
      skills: number;
      mcpServers: number;
      releaseOverlays: number;
      successRate: number | null;
    }>;
  };
  gates: {
    approvalRequired: boolean;
    approvalCount: number;
    verificationRequired: boolean;
    verificationCount: number;
  };
  executionQuality: {
    recentTotal: number;
    recentSuccess: number;
    recentFailure: number;
    recentRunning: number;
    successRate: number | null;
    lastStatus: string | null;
    lastExecutedAt: string | null;
    averageDurationMs: number | null;
  };
}

export type WorkflowExecutionPreflightDecision = 'allow' | 'warn' | 'block';

export interface WorkflowExecutionPreflight {
  schemaVersion: 'workflow.executionPreflight.v1';
  workflowId: string;
  workflowName: string;
  decision: WorkflowExecutionPreflightDecision;
  mode: 'direct' | 'warning' | 'blocked';
  requiresApproval: boolean;
  reasons: string[];
  actions: string[];
  role: string;
  generatedAt: string;
  capabilitySummary: WorkflowCapabilitySummary;
}

export interface WorkflowExecutionPreflightSnapshot {
  schemaVersion: WorkflowExecutionPreflight['schemaVersion'];
  decision: WorkflowExecutionPreflightDecision;
  mode: WorkflowExecutionPreflight['mode'];
  requiresApproval: boolean;
  reasons: string[];
  actions: string[];
  role: string;
  generatedAt: string;
  summary: {
    hermesEnhanced: boolean;
    channelBundles: WorkflowCapabilitySummary['channelBundles'];
    gates: WorkflowCapabilitySummary['gates'];
    mcpServers: WorkflowCapabilitySummary['mcpServers'];
  };
}

export interface WorkflowCapabilityInput {
  id?: unknown;
  name?: string;
  nodes?: unknown;
  edges?: unknown;
  agent_configs?: unknown;
}

interface AgentBinding {
  id: string;
  name: string;
  runtime: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_type: string | null;
}

export function summarizeWorkflowCapability(workflow: WorkflowCapabilityInput): WorkflowCapabilitySummary {
  const workflowId = String(workflow.id || '');
  const nodes = normalizeNodes(workflow.nodes);
  const config = objectOrEmpty(workflow.agent_configs);
  const agents = listWorkflowAgents(nodes);
  const channels = listHermesChannels();
  const agentChannelIds = new Set(agents.map((agent) => agent.channel_id).filter((id): id is string => Boolean(id)));
  const boundChannels = channels.filter((channel) => agentChannelIds.has(channel.id));
  const explicitSkillIds = collectConfiguredIds(nodes, config, ['recommendedSkillId', 'recommendedSkillIds', 'requiredSkillId', 'requiredSkillIds']);
  const explicitMcpIds = collectConfiguredIds(nodes, config, ['recommendedMcpServerId', 'recommendedMcpServerIds', 'requiredMcpServerId', 'requiredMcpServerIds']);
  const channelSkillIds = boundChannels.flatMap((channel) => (
    channel.skills
      .filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1)
      .map((skill) => skill.id)
  ));
  const channelMcpIds = boundChannels.flatMap((channel) => (
    channel.mcpServers
      .filter((server) => server.enabled === 1 && server.binding_enabled === 1)
      .map((server) => server.id)
  ));
  const skillIds = uniqueStrings([...explicitSkillIds, ...channelSkillIds]);
  const mcpIds = uniqueStrings([...explicitMcpIds, ...channelMcpIds]);
  const mcpRecords = listMcpServerRecords(mcpIds);
  const gates = summarizeGates(nodes, config);

  return {
    hermesEnhanced: Boolean(
      config.hermesEnhanced ||
      config.runbookDriven ||
      nodes.some((node) => Boolean(objectOrEmpty(node.data).runbookPhase)) ||
      agents.some((agent) => agent.runtime === 'hermes' || Boolean(agent.channel_id))
    ),
    runbookDriven: Boolean(config.runbookDriven || nodes.some((node) => Boolean(objectOrEmpty(node.data).runbookPhase))),
    collaborationMode: stringOrNull(config.collaborationMode),
    runbookPattern: stringOrNull(config.runbookPattern),
    agentTeams: listWorkflowTeams(agents),
    agents,
    skills: {
      count: skillIds.length,
      ids: skillIds,
      names: listSkillNames(skillIds)
    },
    mcpServers: {
      count: mcpIds.length,
      unhealthy: mcpRecords.filter((server) => !['healthy', 'unknown'].includes(server.health_status)).length,
      ids: mcpIds,
      names: mcpRecords.map((server) => server.name)
    },
    channelBundles: summarizeChannelBundles(boundChannels),
    gates,
    executionQuality: summarizeExecutionQuality(workflowId)
  };
}

export function attachWorkflowCapabilitySummaries<T extends WorkflowCapabilityInput>(workflows: T[]): Array<T & { capability_summary: WorkflowCapabilitySummary }> {
  return workflows.map((workflow) => ({
    ...workflow,
    capability_summary: summarizeWorkflowCapability(workflow)
  }));
}

export function buildWorkflowExecutionPreflight(workflow: WorkflowCapabilityInput, role = 'viewer'): WorkflowExecutionPreflight {
  const summary = summarizeWorkflowCapability(workflow);
  const reasons = new Set<string>();
  const actions = new Set<string>();
  let decision: WorkflowExecutionPreflightDecision = 'allow';
  let requiresApproval = false;
  const normalizedRole = role || 'viewer';
  const highRiskTools = summary.channelBundles.channels.reduce((sum, channel) => sum + channel.highRiskTools, 0);
  const technicalBlockWarnings = new Set([
    'channel_disabled',
    'no_bound_agent',
    'no_enabled_tool',
    'high_risk_tools_without_policy',
    'unhealthy_mcp_server'
  ]);
  const hasTechnicalBlockWarning = summary.channelBundles.warnings.some((warning) => technicalBlockWarnings.has(warning));

  if (normalizedRole === 'viewer') {
    decision = escalateDecision(decision, 'block');
    reasons.add('role_viewer_cannot_execute');
    actions.add('switch_operator_or_admin');
  }

  if (summary.channelBundles.needsReview > 0) {
    decision = escalateDecision(decision, normalizedRole === 'admin' ? 'warn' : 'block');
    reasons.add('capability_bundle_needs_review');
    actions.add('review_capability_bundle');
  }

  if (hasTechnicalBlockWarning) {
    decision = escalateDecision(decision, normalizedRole === 'admin' ? 'warn' : 'block');
    reasons.add('capability_bundle_policy_risk');
    actions.add('review_channel_policy');
  }

  if (summary.mcpServers.unhealthy > 0) {
    decision = escalateDecision(decision, 'warn');
    reasons.add('mcp_server_unhealthy');
    actions.add('check_mcp_server_health');
  }

  if (summary.gates.approvalRequired || highRiskTools > 0) {
    decision = escalateDecision(decision, 'warn');
    requiresApproval = true;
    reasons.add(summary.gates.approvalRequired ? 'workflow_requires_approval' : 'high_risk_tools_require_approval');
    actions.add('prepare_tool_approval');
  }

  if (summary.gates.verificationRequired) {
    decision = escalateDecision(decision, 'warn');
    reasons.add('workflow_requires_verification');
    actions.add('prepare_verification_plan');
  }

  if (summary.executionQuality.recentFailure > 0) {
    decision = escalateDecision(decision, 'warn');
    reasons.add('recent_workflow_failures');
    actions.add('review_recent_failures');
  }

  return {
    schemaVersion: 'workflow.executionPreflight.v1',
    workflowId: String(workflow.id || ''),
    workflowName: workflow.name || '',
    decision,
    mode: decision === 'allow' ? 'direct' : decision === 'warn' ? 'warning' : 'blocked',
    requiresApproval,
    reasons: Array.from(reasons),
    actions: Array.from(actions),
    role: normalizedRole,
    generatedAt: new Date().toISOString(),
    capabilitySummary: summary
  };
}

export function createWorkflowExecutionPreflightSnapshot(preflight: WorkflowExecutionPreflight): WorkflowExecutionPreflightSnapshot {
  return {
    schemaVersion: preflight.schemaVersion,
    decision: preflight.decision,
    mode: preflight.mode,
    requiresApproval: preflight.requiresApproval,
    reasons: preflight.reasons,
    actions: preflight.actions,
    role: preflight.role,
    generatedAt: preflight.generatedAt,
    summary: {
      hermesEnhanced: preflight.capabilitySummary.hermesEnhanced,
      channelBundles: preflight.capabilitySummary.channelBundles,
      gates: preflight.capabilitySummary.gates,
      mcpServers: preflight.capabilitySummary.mcpServers
    }
  };
}

function escalateDecision(current: WorkflowExecutionPreflightDecision, next: WorkflowExecutionPreflightDecision): WorkflowExecutionPreflightDecision {
  const order: Record<WorkflowExecutionPreflightDecision, number> = { allow: 0, warn: 1, block: 2 };
  return order[next] > order[current] ? next : current;
}

function normalizeNodes(value: unknown): WorkflowNode[] {
  if (Array.isArray(value)) return value as WorkflowNode[];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as WorkflowNode[] : [];
  } catch {
    return [];
  }
}

function listWorkflowAgents(nodes: WorkflowNode[]): AgentBinding[] {
  const agentIds = uniqueStrings(nodes.map((node) => stringOrNull(objectOrEmpty(node.data).agentId)).filter((id): id is string => Boolean(id)));
  if (agentIds.length === 0) return [];

  const placeholders = agentIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.runtime,
      a.channel_id,
      hc.name AS channel_name,
      hc.type AS channel_type
    FROM agents a
    LEFT JOIN hermes_channels hc ON hc.id = a.channel_id
    WHERE a.id IN (${placeholders})
    ORDER BY a.name ASC
  `).all(...agentIds) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    runtime: stringOrNull(row.runtime),
    channel_id: stringOrNull(row.channel_id),
    channel_name: stringOrNull(row.channel_name),
    channel_type: stringOrNull(row.channel_type)
  }));
}

function listWorkflowTeams(agents: AgentBinding[]): WorkflowCapabilitySummary['agentTeams'] {
  const agentIds = agents.map((agent) => agent.id);
  const channelTypes = uniqueStrings(agents.map((agent) => agent.channel_type).filter((value): value is string => Boolean(value)));
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (agentIds.length > 0) {
    conditions.push(`m.agent_id IN (${agentIds.map(() => '?').join(',')})`);
    params.push(...agentIds);
  }

  if (channelTypes.length > 0) {
    conditions.push(`(m.agent_id IS NULL AND m.channel_type IN (${channelTypes.map(() => '?').join(',')}))`);
    params.push(...channelTypes);
  }

  if (conditions.length === 0) return [];

  const rows = db.prepare(`
    SELECT DISTINCT t.id, t.name, t.team_type
    FROM agent_team_members m
    JOIN agent_teams t ON t.id = m.team_id
    WHERE m.enabled = 1 AND (${conditions.join(' OR ')})
    ORDER BY t.name ASC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    team_type: String(row.team_type || '')
  }));
}

function collectConfiguredIds(nodes: WorkflowNode[], config: Record<string, unknown>, keys: string[]): string[] {
  const ids = new Set<string>();
  collectIdsFromRecord(config, keys, ids);
  const stages = Array.isArray(config.stages) ? config.stages : [];
  stages.forEach((stage) => collectIdsFromRecord(objectOrEmpty(stage), keys, ids));
  nodes.forEach((node) => collectIdsFromRecord(objectOrEmpty(node.data), keys, ids));
  return Array.from(ids);
}

function collectIdsFromRecord(record: Record<string, unknown>, keys: string[], ids: Set<string>): void {
  keys.forEach((key) => {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      ids.add(value.trim());
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string' && item.trim()) ids.add(item.trim());
      });
    }
  });
}

function listSkillNames(skillIds: string[]): string[] {
  if (skillIds.length === 0) return [];
  const placeholders = skillIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, name FROM skills WHERE id IN (${placeholders}) ORDER BY name ASC`).all(...skillIds) as Array<Record<string, unknown>>;
  const byId = new Map(rows.map((row) => [String(row.id), String(row.name || row.id)]));
  return skillIds.map((id) => byId.get(id) || id);
}

function listMcpServerRecords(mcpIds: string[]): Array<{ id: string; name: string; health_status: string }> {
  if (mcpIds.length === 0) return [];
  const placeholders = mcpIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, name, health_status FROM mcp_servers WHERE id IN (${placeholders}) ORDER BY name ASC`).all(...mcpIds) as Array<Record<string, unknown>>;
  const byId = new Map(rows.map((row) => [String(row.id), {
    id: String(row.id),
    name: String(row.name || row.id),
    health_status: String(row.health_status || 'unknown')
  }]));
  return mcpIds.map((id) => byId.get(id) || { id, name: id, health_status: 'unknown' });
}

function summarizeChannelBundles(channels: ReturnType<typeof listHermesChannels>): WorkflowCapabilitySummary['channelBundles'] {
  const bundleChannels = channels.map((channel) => {
    const summary = channel.effectiveBundle.summary;
    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      ready: summary.ready,
      warnings: summary.warnings,
      agents: summary.agents,
      tools: summary.tools,
      highRiskTools: summary.highRiskTools,
      skills: summary.skills,
      mcpServers: summary.mcpServers,
      releaseOverlays: summary.releaseOverlays,
      successRate: channel.effectiveBundle.quality.successRate
    };
  });
  const warnings = uniqueStrings(bundleChannels.flatMap((channel) => channel.warnings));

  return {
    count: bundleChannels.length,
    ready: bundleChannels.filter((channel) => channel.ready).length,
    needsReview: bundleChannels.filter((channel) => !channel.ready).length,
    releaseOverlays: bundleChannels.reduce((sum, channel) => sum + channel.releaseOverlays, 0),
    warnings,
    channels: bundleChannels
  };
}

function summarizeGates(nodes: WorkflowNode[], config: Record<string, unknown>): WorkflowCapabilitySummary['gates'] {
  const stages = Array.isArray(config.stages) ? config.stages.map((stage) => objectOrEmpty(stage)) : [];
  const approvalCount = [
    ...stages.map((stage) => stage.approvalRequired),
    ...nodes.map((node) => objectOrEmpty(node.data).approvalRequired)
  ].filter(Boolean).length;
  const verificationCount = [
    ...stages.map((stage) => stage.verificationRequired),
    ...nodes.map((node) => objectOrEmpty(node.data).verificationRequired)
  ].filter(Boolean).length;

  return {
    approvalRequired: approvalCount > 0,
    approvalCount,
    verificationRequired: verificationCount > 0,
    verificationCount
  };
}

function summarizeExecutionQuality(workflowId: string): WorkflowCapabilitySummary['executionQuality'] {
  const rows = db.prepare(`
    SELECT status, start_time, end_time, created_at
    FROM tasks
    WHERE workflow_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(workflowId) as Array<Record<string, unknown>>;

  const successCount = rows.filter((row) => ['completed', 'success'].includes(String(row.status))).length;
  const failureCount = rows.filter((row) => ['failed', 'error', 'cancelled'].includes(String(row.status))).length;
  const runningCount = rows.filter((row) => ['pending', 'running'].includes(String(row.status))).length;
  const durations = rows
    .map((row) => {
      const start = Date.parse(String(row.start_time || ''));
      const end = Date.parse(String(row.end_time || ''));
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : 0;
    })
    .filter((duration) => duration > 0);

  return {
    recentTotal: rows.length,
    recentSuccess: successCount,
    recentFailure: failureCount,
    recentRunning: runningCount,
    successRate: rows.length > 0 ? Math.round((successCount / rows.length) * 100) : null,
    lastStatus: rows.length > 0 ? String(rows[0].status || 'unknown') : null,
    lastExecutedAt: rows.length > 0 ? String(rows[0].created_at || '') : null,
    averageDurationMs: durations.length > 0
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : null
  };
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
