import { randomUUID } from 'crypto';
import db from '../models/database';
import { listHermesChannels } from './hermesChannelService';
import { getHermesWorkerStatuses, HermesWorkerStatus } from './hermesWorkerService';
import { listEvolutionReleaseVersions } from './evolutionReleaseService';
import { resolveEvolutionRuntimeOverlay } from './evolutionOverlayService';

export interface AgentTeamRecord {
  id: string;
  name: string;
  description: string | null;
  team_type: string;
  collaboration_mode: string;
  mode: string;
  status: string;
  leader_agent_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members: AgentTeamMemberRecord[];
  readiness: AgentTeamReadiness;
  capabilitySummary: AgentTeamCapabilitySummary;
  recentRuns?: AgentTeamRunRecord[];
}

export interface AgentTeamMemberRecord {
  id: string;
  team_id: string;
  role: string;
  display_name: string;
  agent_id: string | null;
  agent_name: string | null;
  channel_type: string | null;
  channel_id: string | null;
  channel_name: string | null;
  worker_role: string | null;
  worker_healthy: boolean;
  step_order: number;
  required: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface AgentTeamReadiness {
  ready: boolean;
  missing: string[];
  warnings: string[];
}

export interface AgentTeamCapabilitySummary {
  channels: number;
  agents: number;
  workers: number;
  skills: number;
  mcpServers: number;
  tools: number;
  activeReleases: number;
}

export interface AgentTeamRunRecord {
  id: string;
  team_id: string;
  team_name?: string;
  mode: string;
  input: string;
  context: Record<string, unknown>;
  status: string;
  correlation_id: string | null;
  leader_plan: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps?: AgentTeamRunStepRecord[];
}

export interface AgentTeamRunStepRecord {
  id: string;
  run_id: string;
  team_member_id: string | null;
  step_order: number;
  role: string;
  agent_id: string | null;
  agent_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  worker_role: string | null;
  status: string;
  input: string | null;
  output: string | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateAgentTeamRunInput {
  input?: string;
  mode?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  createdBy?: string | null;
}

interface AgentBinding {
  id: string;
  name: string;
  enabled: number;
  channel_id: string | null;
  channel_type: string | null;
}

export async function listAgentTeams(): Promise<AgentTeamRecord[]> {
  const workers = await getHermesWorkerStatuses();
  const teams = (db.prepare(`
    SELECT *
    FROM agent_teams
    ORDER BY
      CASE team_type
        WHEN 'alert_remediation' THEN 1
        WHEN 'inspection_review' THEN 2
        WHEN 'change_risk' THEN 3
        ELSE 4
      END,
      created_at ASC
  `).all() as Array<Record<string, unknown>>).map((row) => parseTeam(row, workers));

  return teams.map((team) => ({
    ...team,
    recentRuns: listAgentTeamRuns({ teamId: team.id, limit: 3 })
  }));
}

export async function getAgentTeam(id: string): Promise<AgentTeamRecord | null> {
  const workers = await getHermesWorkerStatuses();
  const row = db.prepare('SELECT * FROM agent_teams WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseTeam(row, workers) : null;
}

export function listAgentTeamRuns(options: { teamId?: string; limit?: number } = {}): AgentTeamRunRecord[] {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const rows = options.teamId
    ? db.prepare(`
        SELECT r.*, t.name AS team_name
        FROM agent_team_runs r
        JOIN agent_teams t ON t.id = r.team_id
        WHERE r.team_id = ?
        ORDER BY r.created_at DESC
        LIMIT ?
      `).all(options.teamId, limit)
    : db.prepare(`
        SELECT r.*, t.name AS team_name
        FROM agent_team_runs r
        JOIN agent_teams t ON t.id = r.team_id
        ORDER BY r.created_at DESC
        LIMIT ?
      `).all(limit);

  return (rows as Array<Record<string, unknown>>).map((row) => parseRun(row, true));
}

export function getAgentTeamRun(id: string): AgentTeamRunRecord | null {
  const row = db.prepare(`
    SELECT r.*, t.name AS team_name
    FROM agent_team_runs r
    JOIN agent_teams t ON t.id = r.team_id
    WHERE r.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!row) return null;
  return parseRun(row, true);
}

export async function createAgentTeamRun(teamId: string, input: CreateAgentTeamRunInput): Promise<AgentTeamRunRecord> {
  const team = await getAgentTeam(teamId);
  if (!team) {
    throw new Error('Agent team not found');
  }

  const request = String(input.input || '').trim();
  if (!request) {
    throw new Error('Team run input is required');
  }

  const mode = input.mode || team.collaboration_mode;
  const correlationId = input.correlationId || `team-${randomUUID()}`;
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const context = input.context || {};
  const leaderPlan = buildLeaderPlan(team, mode, request, context);
  const evidenceChain = buildTeamRunEvidenceChain(team, correlationId);

  db.prepare(`
    INSERT INTO agent_team_runs (
      id, team_id, mode, input, context, status, correlation_id,
      leader_plan, created_by, created_at, started_at
    )
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `).run(
    runId,
    team.id,
    mode,
    request,
    JSON.stringify(context),
    correlationId,
    JSON.stringify(leaderPlan),
    input.createdBy || null,
    startedAt
  );

  const insertStep = db.prepare(`
    INSERT INTO agent_team_run_steps (
      id, run_id, team_member_id, step_order, role, agent_id, channel_id,
      worker_role, status, input, output, metadata, started_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  team.members
    .filter((member) => member.enabled === 1)
    .sort((a, b) => a.step_order - b.step_order)
    .forEach((member) => {
      const stepId = randomUUID();
      const output = buildStepOutput(member, mode);
      const stepEvidenceChain = buildStepEvidenceChain(team, member, correlationId);
      const metadata = {
        teamType: team.team_type,
        collaborationMode: mode,
        channelType: member.channel_type,
        workerHealthy: member.worker_healthy,
        dryRun: true,
        executionBoundary: 'P2 baseline records orchestration steps without invoking production tools',
        evidenceChain: stepEvidenceChain
      };
      insertStep.run(
        stepId,
        runId,
        member.id,
        member.step_order,
        member.role,
        member.agent_id,
        member.channel_id,
        member.worker_role,
        member.role === 'leader' || member.channel_id ? 'completed' : 'skipped',
        member.role === 'leader' ? request : `Team run ${runId} / ${member.display_name}`,
        output,
        JSON.stringify(metadata),
        startedAt,
        new Date().toISOString()
      );
    });

  const output = {
    summary: `${team.name} run created in ${mode} mode`,
    boundary: 'This P2 baseline records Leader-Worker orchestration and evidence links; worker execution integration comes next.',
    teamId: team.id,
    correlationId,
    readiness: team.readiness,
    evidenceChain
  };

  db.prepare(`
    UPDATE agent_team_runs
    SET status = 'completed',
        output = ?,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(output), runId);

  const run = getAgentTeamRun(runId);
  if (!run) {
    throw new Error('Failed to create Agent Team run');
  }
  return run;
}

function parseTeam(row: Record<string, unknown>, workers: HermesWorkerStatus[]): AgentTeamRecord {
  const id = String(row.id);
  const members = listTeamMembers(id, workers);
  const readiness = buildReadiness(members);
  const mode = String(row.collaboration_mode || 'pipeline');
  return {
    id,
    name: String(row.name || ''),
    description: nullableString(row.description),
    team_type: String(row.team_type || ''),
    collaboration_mode: mode,
    mode,
    status: String(row.status || 'enabled'),
    leader_agent_id: nullableString(row.leader_agent_id),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    members,
    readiness,
    capabilitySummary: buildCapabilitySummary(members)
  };
}

function listTeamMembers(teamId: string, workers: HermesWorkerStatus[]): AgentTeamMemberRecord[] {
  const agents = listHermesAgentBindings();
  const channels = listHermesChannels();
  const rows = db.prepare(`
    SELECT *
    FROM agent_team_members
    WHERE team_id = ?
    ORDER BY step_order ASC, role ASC
  `).all(teamId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const explicitAgentId = nullableString(row.agent_id);
    const channelType = nullableString(row.channel_type);
    const channel = channelType ? channels.find((item) => item.type === channelType && item.enabled === 1) : null;
    const agent = explicitAgentId
      ? agents.find((item) => item.id === explicitAgentId)
      : agents.find((item) => item.channel_type === channelType && item.enabled === 1);
    const workerRole = nullableString(row.worker_role);
    const worker = workerRole ? workers.find((item) => item.role === workerRole) : null;

    return {
      id: String(row.id),
      team_id: String(row.team_id),
      role: String(row.role || ''),
      display_name: String(row.display_name || row.role || ''),
      agent_id: explicitAgentId || agent?.id || null,
      agent_name: agent?.name || null,
      channel_type: channelType,
      channel_id: channel?.id || null,
      channel_name: channel?.name || null,
      worker_role: workerRole,
      worker_healthy: Boolean(worker?.healthy),
      step_order: Number(row.step_order || 0),
      required: Number(row.required ?? 1),
      enabled: Number(row.enabled ?? 1),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || '')
    };
  });
}

function parseRun(row: Record<string, unknown>, includeSteps: boolean): AgentTeamRunRecord {
  const id = String(row.id);
  const output = parseJson<Record<string, unknown> | null>(row.output, null);
  return {
    id,
    team_id: String(row.team_id || ''),
    team_name: nullableString(row.team_name) || undefined,
    mode: String(row.mode || 'pipeline'),
    input: String(row.input || ''),
    context: parseJson(row.context, {}),
    status: String(row.status || 'unknown'),
    correlation_id: nullableString(row.correlation_id),
    leader_plan: parseJson(row.leader_plan, null),
    output,
    metadata: {
      dryRun: true,
      executionBoundary: typeof output?.boundary === 'string'
        ? output.boundary
        : 'P2 baseline records orchestration steps without invoking production tools',
      evidenceChain: output?.evidenceChain || null
    },
    error: nullableString(row.error),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    started_at: nullableString(row.started_at),
    completed_at: nullableString(row.completed_at),
    steps: includeSteps ? listRunSteps(id) : undefined
  };
}

function listRunSteps(runId: string): AgentTeamRunStepRecord[] {
  const rows = db.prepare(`
    SELECT
      s.*,
      a.name AS agent_name,
      c.name AS channel_name
    FROM agent_team_run_steps s
    LEFT JOIN agents a ON a.id = s.agent_id
    LEFT JOIN hermes_channels c ON c.id = s.channel_id
    WHERE s.run_id = ?
    ORDER BY s.step_order ASC
  `).all(runId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    run_id: String(row.run_id),
    team_member_id: nullableString(row.team_member_id),
    step_order: Number(row.step_order || 0),
    role: String(row.role || ''),
    agent_id: nullableString(row.agent_id),
    agent_name: nullableString(row.agent_name),
    channel_id: nullableString(row.channel_id),
    channel_name: nullableString(row.channel_name),
    worker_role: nullableString(row.worker_role),
    status: String(row.status || 'unknown'),
    input: nullableString(row.input),
    output: nullableString(row.output),
    metadata: parseJson(row.metadata, {}),
    started_at: nullableString(row.started_at),
    completed_at: nullableString(row.completed_at)
  }));
}

function buildReadiness(members: AgentTeamMemberRecord[]): AgentTeamReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];

  members
    .filter((member) => member.enabled === 1 && member.required === 1)
    .forEach((member) => {
      if (member.role !== 'leader' && !member.channel_id) {
        missing.push(`${member.display_name}: channel`);
      }
      if (member.role !== 'leader' && !member.agent_id) {
        warnings.push(`${member.display_name}: agent binding`);
      }
      if (member.worker_role && !member.worker_healthy) {
        missing.push(`${member.display_name}: worker`);
      }
    });

  return {
    ready: missing.length === 0,
    missing,
    warnings
  };
}

function buildCapabilitySummary(members: AgentTeamMemberRecord[]): AgentTeamCapabilitySummary {
  const channelIds = new Set(members.map((member) => member.channel_id).filter(Boolean));
  const agentIds = new Set(members.map((member) => member.agent_id).filter(Boolean));
  const workerRoles = new Set(members.map((member) => member.worker_role).filter(Boolean));
  const channels = listHermesChannels().filter((channel) => channelIds.has(channel.id));
  const activeReleases = listEvolutionReleaseVersions({ status: 'active', limit: 200 });

  return {
    channels: channelIds.size,
    agents: agentIds.size,
    workers: workerRoles.size,
    skills: channels.reduce((sum, channel) => sum + channel.skills.filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1).length, 0),
    mcpServers: channels.reduce((sum, channel) => sum + channel.mcpServers.filter((server) => server.enabled === 1 && server.binding_enabled === 1).length, 0),
    tools: channels.reduce((sum, channel) => sum + channel.tools.filter((tool) => tool.enabled === 1).length, 0),
    activeReleases: activeReleases.length
  };
}

function buildLeaderPlan(team: AgentTeamRecord, mode: string, input: string, context: Record<string, unknown>) {
  return {
    team: team.name,
    mode,
    input,
    context,
    steps: team.members
      .filter((member) => member.enabled === 1)
      .sort((a, b) => a.step_order - b.step_order)
      .map((member) => ({
        role: member.role,
        displayName: member.display_name,
        agentId: member.agent_id,
        channelId: member.channel_id,
        workerRole: member.worker_role
      })),
    safety: 'P2 baseline records orchestration only; production tools still require existing approval and workflow paths.'
  };
}

function buildStepOutput(member: AgentTeamMemberRecord, mode: string): string {
  if (member.role === 'leader') {
    return `Leader selected ${mode} collaboration and assigned ${member.display_name}.`;
  }
  if (!member.channel_id) {
    return `${member.display_name} skipped because no channel is bound yet.`;
  }
  return `${member.display_name} bound to channel ${member.channel_name || member.channel_id}; execution handoff is recorded for the next P2 slice.`;
}

function buildTeamRunEvidenceChain(team: AgentTeamRecord, correlationId: string): Record<string, unknown> {
  const stepEvidence = team.members
    .filter((member) => member.enabled === 1)
    .sort((a, b) => a.step_order - b.step_order)
    .map((member) => buildStepEvidenceChain(team, member, correlationId));

  return {
    schemaVersion: 'team.executionEvidenceChain.v1',
    teamId: team.id,
    teamName: team.name,
    teamType: team.team_type,
    correlationId,
    generatedAt: new Date().toISOString(),
    counts: {
      steps: stepEvidence.length,
      channels: new Set(stepEvidence.map((item) => item.channelId).filter(Boolean)).size,
      workers: new Set(stepEvidence.map((item) => item.workerRole).filter(Boolean)).size,
      skills: sumNestedCounts(stepEvidence, 'skills'),
      mcpServers: sumNestedCounts(stepEvidence, 'mcpServers'),
      tools: sumNestedCounts(stepEvidence, 'tools'),
      releaseOverlays: sumNestedCounts(stepEvidence, 'releaseOverlays')
    },
    steps: stepEvidence
  };
}

function buildStepEvidenceChain(
  team: AgentTeamRecord,
  member: AgentTeamMemberRecord,
  correlationId: string
): Record<string, unknown> {
  const channel = member.channel_id
    ? listHermesChannels().find((item) => item.id === member.channel_id) || null
    : null;
  const skills = channel
    ? channel.skills
      .filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1)
      .map((skill) => ({
        id: skill.skill_id || skill.id,
        name: skill.name,
        category: skill.category,
        version: skill.version,
        riskLevel: skill.risk_level,
        approvalPolicy: skill.approval_policy,
        evidenceRequirements: skill.evidence_requirements
      }))
    : [];
  const mcpServers = channel
    ? channel.mcpServers
      .filter((server) => server.enabled === 1 && server.binding_enabled === 1)
      .map((server) => ({
        id: server.mcp_server_id || server.id,
        name: server.name,
        transport: server.transport,
        healthStatus: server.health_status,
        toolImportMode: server.tool_import_mode
      }))
    : [];
  const tools = channel
    ? channel.tools
      .filter((tool) => tool.enabled === 1)
      .map((tool) => ({
        name: tool.tool_name,
        riskLevel: tool.risk_level_override || 'default'
      }))
    : [];
  const releaseOverlays = channel
    ? resolveEvolutionRuntimeOverlay({
      agentId: member.agent_id || '',
      agentName: member.agent_name || member.display_name,
      channelId: channel.id,
      channelType: channel.type,
      policyId: channel.policy_id,
      skillIds: skills.map((skill) => String(skill.id)),
      mcpServerIds: mcpServers.map((server) => String(server.id))
    }).map((overlay) => ({
      versionId: overlay.versionId,
      proposalId: overlay.proposalId,
      versionLabel: overlay.versionLabel,
      objectType: overlay.objectType,
      targetId: overlay.targetId,
      patchKind: overlay.patchKind,
      operationCount: overlay.operationCount,
      publishedAt: overlay.publishedAt
    }))
    : [];

  return {
    schemaVersion: 'team.stepEvidence.v1',
    teamId: team.id,
    teamType: team.team_type,
    correlationId,
    role: member.role,
    displayName: member.display_name,
    agentId: member.agent_id,
    agentName: member.agent_name,
    channelId: member.channel_id,
    channelName: member.channel_name,
    channelType: member.channel_type,
    workerRole: member.worker_role,
    workerHealthy: member.worker_healthy,
    workerLastRun: member.worker_role ? getLastWorkerRun(member.worker_role) : null,
    skills,
    mcpServers,
    tools,
    releaseOverlays,
    evidenceRequirements: Array.from(new Set(skills.flatMap((skill) => skill.evidenceRequirements || [])))
  };
}

function getLastWorkerRun(workerRole: string): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT id, status, latency_ms, fallback_used, error, created_at
    FROM hermes_worker_runs
    WHERE worker_role = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(workerRole) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    id: String(row.id),
    status: String(row.status || 'unknown'),
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    fallbackUsed: Number(row.fallback_used || 0),
    error: nullableString(row.error),
    createdAt: String(row.created_at || '')
  };
}

function sumNestedCounts(items: Array<Record<string, unknown>>, key: string): number {
  return items.reduce((sum, item) => sum + (Array.isArray(item[key]) ? item[key].length : 0), 0);
}

function listHermesAgentBindings(): AgentBinding[] {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.enabled,
      a.channel_id,
      hc.type AS channel_type
    FROM agents a
    LEFT JOIN hermes_channels hc ON hc.id = a.channel_id
    WHERE a.enabled = 1
      AND (a.runtime = 'hermes' OR a.channel_id IS NOT NULL OR a.name LIKE 'Hermes %')
    ORDER BY a.name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    enabled: Number(row.enabled ?? 0),
    channel_id: nullableString(row.channel_id),
    channel_type: nullableString(row.channel_type)
  }));
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
