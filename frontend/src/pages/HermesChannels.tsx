import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BookOpenCheck, Bot, Cable, CheckCircle2, Clock, Download, GitBranch, Play, PlugZap, RefreshCw, Save, ShieldCheck, Upload, UsersRound, Wrench, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface HermesChannelTool {
  id: string;
  tool_name: string;
  enabled: number;
  risk_level_override?: string | null;
}

interface HermesChannelSkill {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  version: string;
  required_tools: string[];
  risk_notes?: string | null;
  applicable_scenarios?: string[];
  input_context?: string[];
  evidence_requirements?: string[];
  recommended_tools?: string[];
  recommended_mcp_servers?: string[];
  risk_level?: string;
  approval_policy?: string;
  verification_method?: string | null;
  rollback_guidance?: string | null;
  output_contract?: string[];
  version_status?: string;
  enabled: number;
  skill_id: string;
  binding_enabled: number;
}

interface HermesChannelMcpServer {
  id: string;
  name: string;
  description?: string | null;
  transport: string;
  url?: string | null;
  enabled: number;
  health_status: string;
  mcp_server_id: string;
  binding_enabled: number;
  tool_import_mode: string;
}

interface HermesChannel {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  runtime_type: string;
  base_url?: string | null;
  model: string;
  api_key_ref: string;
  timeout_ms: number;
  max_tool_rounds: number;
  temperature?: number | null;
  policy_id?: string | null;
  enabled: number;
  health_status: string;
  last_checked_at?: string | null;
  tools: HermesChannelTool[];
  skills: HermesChannelSkill[];
  mcpServers: HermesChannelMcpServer[];
}

interface ToolDescriptor {
  name: string;
  description: string;
  riskLevel: string;
}

interface SkillPack {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  version: string;
  required_tools: string[];
  risk_notes?: string | null;
  applicable_scenarios?: string[];
  input_context?: string[];
  evidence_requirements?: string[];
  recommended_tools?: string[];
  recommended_mcp_servers?: string[];
  risk_level?: string;
  approval_policy?: string;
  verification_method?: string | null;
  rollback_guidance?: string | null;
  output_contract?: string[];
  version_status?: string;
  enabled: number;
}

interface McpServer {
  id: string;
  name: string;
  description?: string | null;
  transport: string;
  url?: string | null;
  command?: string | null;
  enabled: number;
  health_status: string;
  last_checked_at?: string | null;
}

interface HermesWorkerStatus {
  role: string;
  name: string;
  channelType: string;
  url?: string;
  configured: boolean;
  healthy: boolean;
  latencyMs: number;
  status: string;
  model?: string;
  upstreamConfigured?: boolean;
  error?: string;
  runStats?: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    fallbackRuns: number;
    avgLatencyMs: number | null;
    lastRunAt: string | null;
  };
  lastRun?: {
    id: string;
    status: string;
    latency_ms: number | null;
    fallback_used: number;
    error?: string | null;
    created_at: string;
  } | null;
}

interface HermesControlPlaneOverview {
  generatedAt: string;
  channels: HermesChannel[];
  workers: HermesWorkerStatus[];
  agentBindings: Array<{
    id: string;
    name: string;
    role: string;
    runtime: string | null;
    enabled: number;
    channel_id: string | null;
    channel_name: string | null;
    channel_type: string | null;
  }>;
  capabilityInventory: Array<{
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
  }>;
  evolutionState: {
    proposalsByStatus: Record<string, number>;
    proposalsByType: Record<string, number>;
    reviewQueueByStatus: Record<string, number>;
    taskRunsByStatus24h: Record<string, number>;
    activeReleaseCount: number;
    latestProposalAt: string | null;
    latestReleaseAt: string | null;
  };
  releaseState: {
    active: Array<{ id: string; object_type: string; target_id: string | null; version_label: string; status: string }>;
    recent: Array<{ id: string; object_type: string; target_id: string | null; version_label: string; status: string }>;
  };
  capabilityGraph: {
    nodes: Array<{
      id: string;
      type: 'agent' | 'channel' | 'worker' | 'tool' | 'skill' | 'mcp' | 'release';
      label: string;
      status?: string | null;
      metadata?: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: 'binds_to' | 'routes_to' | 'allows' | 'injects' | 'connects' | 'publishes';
    }>;
  };
  riskSummary: {
    generatedAt: string;
    items: Array<{
      id: string;
      severity: 'info' | 'warning' | 'critical';
      category: 'runtime' | 'capability' | 'evolution' | 'release';
      code: string;
      action: string;
      channelId?: string | null;
      channelName?: string | null;
      workerRole?: string | null;
      count?: number;
    }>;
  };
}

interface AgentTeam {
  id: string;
  name: string;
  description?: string | null;
  team_type: string;
  collaboration_mode: string;
  status: string;
  members: Array<{
    id: string;
    role: string;
    display_name: string;
    agent_id?: string | null;
    agent_name?: string | null;
    channel_type?: string | null;
    channel_id?: string | null;
    channel_name?: string | null;
    worker_role?: string | null;
    worker_healthy: boolean;
    step_order: number;
    enabled: number;
  }>;
  readiness: {
    ready: boolean;
    missing: string[];
    warnings: string[];
  };
  capabilitySummary: {
    channels: number;
    agents: number;
    workers: number;
    skills: number;
    mcpServers: number;
    tools: number;
    activeReleases: number;
  };
  recentRuns?: AgentTeamRun[];
}

interface AgentTeamRun {
  id: string;
  team_id: string;
  team_name?: string;
  mode: string;
  input: string;
  status: string;
  correlation_id?: string | null;
  output?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  completed_at?: string | null;
  steps?: AgentTeamRunStep[];
}

interface AgentTeamRunStep {
  id: string;
  role: string;
  agent_name?: string | null;
  channel_name?: string | null;
  worker_role?: string | null;
  status: string;
  metadata?: Record<string, unknown>;
}

interface TeamEvidenceChain {
  schemaVersion?: string;
  correlationId?: string;
  counts?: Record<string, unknown>;
  steps?: TeamStepEvidence[];
}

interface TeamStepEvidence {
  role?: string;
  displayName?: string;
  agentName?: string | null;
  channelName?: string | null;
  channelType?: string | null;
  workerRole?: string | null;
  workerHealthy?: boolean;
  workerLastRun?: Record<string, unknown> | null;
  skills?: unknown[];
  mcpServers?: unknown[];
  tools?: unknown[];
  releaseOverlays?: unknown[];
}

interface ChannelFormState {
  name: string;
  description: string;
  type: string;
  base_url: string;
  model: string;
  api_key_ref: string;
  timeout_ms: number;
  max_tool_rounds: number;
  temperature: number;
  policy_id: string;
  enabled: boolean;
  tools: string[];
  skills: string[];
  mcpServers: string[];
}

interface McpServerFormState {
  name: string;
  description: string;
  transport: string;
  url: string;
  command: string;
}

interface DigitalOpsTeam {
  id: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  icon: typeof Bot;
  channelTypes: string[];
  workerRoles: string[];
  channelNames: string[];
  agentNames: string[];
  skills: number;
  mcpServers: number;
  tools: number;
  ready: boolean;
  source: 'derived' | 'api';
  mode: string;
  recentRunStatus?: string | null;
  recentRun?: AgentTeamRun | null;
}

const panelClass = 'bg-surface/95 rounded-xl border border-border shadow-sm';
const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all';

const channelTypeLabels: Record<string, string> = {
  diagnose: 'Diagnose',
  remediate: 'Remediate',
  review: 'Review',
  custom: 'Custom'
};

export default function HermesChannels() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const canManage = user?.role === 'admin';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const capabilityImportRef = useRef<HTMLInputElement | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['hermes-channels'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels');
      return res.data.data as HermesChannel[];
    }
  });

  const { data: tools } = useQuery({
    queryKey: ['hermes-channel-tools'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels/tools');
      return res.data.data as ToolDescriptor[];
    }
  });

  const { data: skills } = useQuery({
    queryKey: ['skill-packs'],
    queryFn: async () => {
      const res = await api.get('/api/skills?enabled=true');
      return res.data.data as SkillPack[];
    }
  });

  const { data: mcpServers } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: async () => {
      const res = await api.get('/api/mcp-servers?enabled=true');
      return res.data.data as McpServer[];
    }
  });

  const { data: workers } = useQuery({
    queryKey: ['hermes-workers'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-workers');
      return res.data.data as HermesWorkerStatus[];
    },
    refetchInterval: 30000
  });

  const { data: overview } = useQuery({
    queryKey: ['hermes-control-plane-overview'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-control-plane/overview');
      return res.data.data as HermesControlPlaneOverview;
    },
    refetchInterval: 30000
  });

  const { data: agentTeams } = useQuery({
    queryKey: ['agent-teams'],
    queryFn: async () => {
      const res = await api.get('/api/agent-teams');
      return res.data.data as AgentTeam[];
    },
    retry: 1,
    refetchInterval: 30000
  });

  const selectedChannel = useMemo(() => {
    if (!channels || channels.length === 0) return null;
    return channels.find((channel) => channel.id === selectedId) || channels[0];
  }, [channels, selectedId]);

  useEffect(() => {
    if (!selectedId && channels && channels.length > 0) {
      setSelectedId(channels[0].id);
    }
  }, [channels, selectedId]);

  const updateMutation = useMutation({
    mutationFn: async (form: ChannelFormState) => {
      if (!selectedChannel) return null;
      const payload = {
        name: form.name,
        description: form.description,
        type: form.type,
        base_url: form.base_url || null,
        model: form.model,
        api_key_ref: form.api_key_ref,
        timeout_ms: form.timeout_ms,
        max_tool_rounds: form.max_tool_rounds,
        temperature: form.temperature,
        policy_id: form.policy_id || null,
        enabled: form.enabled,
        tools: form.tools,
        skills: form.skills,
        mcpServers: form.mcpServers
      };
      const res = await api.put(`/api/hermes-channels/${selectedChannel.id}`, payload);
      return res.data.data as HermesChannel;
    },
    onSuccess: () => {
      toast.success(t('hermesChannels.toast.saved'));
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.saveFailed'));
    }
  });

  const testMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await api.post(`/api/hermes-channels/${channelId}/test`);
      return res.data.data as { success: boolean; latencyMs: number; output?: string; error?: string };
    },
    onSuccess: (result) => {
      toast.success(result.success ? t('hermesChannels.toast.testPassed') : t('hermesChannels.toast.testFailed'));
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.testFailed'));
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    }
  });

  const createMcpMutation = useMutation({
    mutationFn: async (form: McpServerFormState) => {
      const payload = {
        name: form.name,
        description: form.description || null,
        transport: form.transport,
        url: form.transport === 'stdio' ? null : form.url,
        command: form.transport === 'stdio' ? form.command : null,
        args: [],
        enabled: true
      };
      const res = await api.post('/api/mcp-servers', payload);
      return res.data.data as McpServer;
    },
    onSuccess: () => {
      toast.success(t('hermesChannels.toast.mcpCreated'));
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.mcpCreateFailed'));
    }
  });

  const createTeamRunMutation = useMutation({
    mutationFn: async ({ teamId, input, mode }: { teamId: string; input: string; mode: string }) => {
      const res = await api.post(`/api/agent-teams/${teamId}/runs`, {
        input,
        mode,
        context: {
          source: 'digital_ops_team_console',
          phase: 'P2'
        }
      });
      return res.data.data as AgentTeamRun;
    },
    onSuccess: () => {
      toast.success(t('hermesChannels.team.runCreated'));
      queryClient.invalidateQueries({ queryKey: ['agent-teams'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.team.runFailed'));
    }
  });

  const testMcpMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const res = await api.post(`/api/mcp-servers/${serverId}/test`);
      return res.data.data as { success: boolean; latencyMs: number; output?: string; error?: string };
    },
    onSuccess: (result) => {
      toast.success(result.success ? t('hermesChannels.toast.mcpTestPassed') : t('hermesChannels.toast.mcpTestFailed'));
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.mcpTestFailed'));
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    }
  });

  const exportCapabilities = async () => {
    try {
      const response = await api.get('/api/import-export/hermes-capabilities/export', {
        responseType: 'blob'
      });
      const contentDisposition = response.headers['content-disposition'];
      let filename = `hermes-capabilities-${new Date().toISOString()}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+?)"?$/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('hermesChannels.toast.capabilityExported'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.capabilityExportFailed'));
    }
  };

  const importCapabilities = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as unknown;
      const response = await api.post('/api/import-export/hermes-capabilities/import', { bundle });
      const imported = response.data.data?.imported;
      toast.success(t('hermesChannels.toast.capabilityImported', {
        skills: imported?.skills || 0,
        mcp: imported?.mcpServers || 0
      }));
      queryClient.invalidateQueries({ queryKey: ['skill-packs'] });
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('hermesChannels.toast.capabilityImportFailed'));
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('hermesChannels.title')}</h1>
            <p className="text-text-secondary">{t('hermesChannels.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['hermes-channels'] });
                queryClient.invalidateQueries({ queryKey: ['hermes-workers'] });
                queryClient.invalidateQueries({ queryKey: ['hermes-control-plane-overview'] });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('common.refresh')}
            </button>
            {canManage && (
              <>
              <button
                onClick={exportCapabilities}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <Download className="w-4 h-4" />
                {t('hermesChannels.exportCapabilities')}
              </button>
              <button
                onClick={() => capabilityImportRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <Upload className="w-4 h-4" />
                {t('hermesChannels.importCapabilities')}
              </button>
              <input
                ref={capabilityImportRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={importCapabilities}
              />
              </>
            )}
          </div>
        </div>

        {overview && (
          <DigitalOpsTeamOverview
            overview={overview}
            agentTeams={agentTeams || []}
            canRun={user?.role === 'admin' || user?.role === 'operator'}
            runningTeamId={createTeamRunMutation.variables?.teamId || null}
            onRun={(teamId, input, mode) => createTeamRunMutation.mutate({ teamId, input, mode })}
          />
        )}

        {overview && <ControlPlaneOverview overview={overview} />}

        <WorkerStatusPanel workers={workers || []} />

        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <div className={`${panelClass} overflow-hidden`}>
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{t('hermesChannels.channels')}</h2>
                  <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.channelCount', { count: channels?.length || 0 })}</p>
                </div>
                <Cable className="w-5 h-5 text-primary" />
              </div>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-text-secondary">{t('common.loading')}</div>
            ) : !channels || channels.length === 0 ? (
              <div className="p-8 text-center text-text-secondary">{t('hermesChannels.empty')}</div>
            ) : (
              <div className="divide-y divide-border">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedId(channel.id)}
                    className={clsx(
                      'w-full text-left p-4 transition-colors',
                      selectedChannel?.id === channel.id ? 'bg-primary/10' : 'hover:bg-background/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary truncate">{channel.name}</div>
                        <div className="text-xs text-text-tertiary mt-1">{channelTypeLabels[channel.type] || channel.type}</div>
                      </div>
                      <HealthBadge status={channel.health_status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-md bg-background border border-border text-text-secondary">{channel.model}</span>
                      <span className="px-2 py-1 rounded-md bg-background border border-border text-text-secondary">
                        {channel.tools.filter((tool) => tool.enabled === 1).length} tools
                      </span>
                      <span className="px-2 py-1 rounded-md bg-background border border-border text-text-secondary">
                        {(channel.skills || []).filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1).length} skills
                      </span>
                      <span className="px-2 py-1 rounded-md bg-background border border-border text-text-secondary">
                        {(channel.mcpServers || []).filter((server) => server.enabled === 1 && server.binding_enabled === 1).length} MCP
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedChannel && (
            <ChannelDetails
              channel={selectedChannel}
              tools={tools || []}
              skills={skills || []}
              mcpServers={mcpServers || []}
              canManage={canManage}
              isSaving={updateMutation.isPending}
              isTesting={testMutation.isPending}
              isCreatingMcp={createMcpMutation.isPending}
              testingMcpId={testMcpMutation.variables || null}
              onSave={(form) => updateMutation.mutate(form)}
              onTest={() => testMutation.mutate(selectedChannel.id)}
              onCreateMcp={(form) => createMcpMutation.mutate(form)}
              onTestMcp={(serverId) => testMcpMutation.mutate(serverId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DigitalOpsTeamOverview({
  overview,
  agentTeams,
  canRun,
  runningTeamId,
  onRun
}: {
  overview: HermesControlPlaneOverview;
  agentTeams: AgentTeam[];
  canRun: boolean;
  runningTeamId: string | null;
  onRun: (teamId: string, input: string, mode: string) => void;
}) {
  const { t } = useLocale();
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const teams = useMemo(() => buildDigitalOpsTeams(overview, agentTeams), [overview, agentTeams]);
  const enabledSkills = overview.capabilityInventory.reduce((sum, item) => sum + item.enabledSkills, 0);
  const enabledMcpServers = overview.capabilityInventory.reduce((sum, item) => sum + item.enabledMcpServers, 0);
  const activeReleases = overview.evolutionState.activeReleaseCount;

  const handleRun = (team: DigitalOpsTeam) => {
    const input = (runInputs[team.id] || '').trim();
    if (!input) return;
    onRun(team.id, input, team.mode);
  };

  return (
    <div className={`${panelClass} p-5`}>
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-semibold text-primary">
            <UsersRound className="w-4 h-4" />
            {t('hermesChannels.team.badge')}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-text-primary">{t('hermesChannels.team.title')}</h2>
          <p className="mt-2 text-sm text-text-secondary leading-6">{t('hermesChannels.team.subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 xl:min-w-[520px]">
          <OverviewMetric label={t('hermesChannels.team.metric.teams')} value={String(teams.length)} />
          <OverviewMetric label={t('hermesChannels.team.metric.agents')} value={String(overview.agentBindings.length)} />
          <OverviewMetric label={t('hermesChannels.team.metric.skills')} value={String(enabledSkills)} />
          <OverviewMetric label={t('hermesChannels.team.metric.mcp')} value={String(enabledMcpServers)} />
          <OverviewMetric label={t('hermesChannels.team.metric.channels')} value={String(overview.channels.length)} />
          <OverviewMetric label={t('hermesChannels.team.metric.workers')} value={`${overview.workers.filter((worker) => worker.healthy).length}/${overview.workers.length}`} />
          <OverviewMetric label={t('hermesChannels.team.metric.releases')} value={String(activeReleases)} />
          <OverviewMetric label={t('hermesChannels.team.metric.mode')} value={t('hermesChannels.team.mode.controlled')} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-3">
        {teams.map((team) => (
          <div key={team.id} className="rounded-lg bg-background border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <team.icon className="w-4 h-4 text-primary shrink-0" />
                  <h3 className="font-semibold text-text-primary truncate">{t(team.titleKey)}</h3>
                </div>
                <p className="mt-2 text-xs text-text-tertiary leading-5">{t(team.descKey)}</p>
              </div>
              <TeamReadinessBadge ready={team.ready} />
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <TopologyRow label={t('hermesChannels.team.leader')} value={t('hermesChannels.team.leaderValue')} />
              <TopologyRow label={t('hermesChannels.team.workers')} value={team.workerRoles.join(', ')} />
              <TopologyRow label={t('hermesChannels.team.channels')} value={team.channelNames.length > 0 ? team.channelNames.join(', ') : t('hermesChannels.team.noChannels')} />
              <TopologyRow label={t('hermesChannels.team.agents')} value={team.agentNames.length > 0 ? team.agentNames.join(', ') : t('hermesChannels.overview.noAgentBinding')} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <MetricChip label={t('hermesChannels.overview.skills')} value={String(team.skills)} />
              <MetricChip label={t('hermesChannels.overview.mcp')} value={String(team.mcpServers)} />
              <MetricChip label={t('hermesChannels.overview.tools')} value={String(team.tools)} />
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between gap-2 text-xs text-text-tertiary mb-2">
                <span>{team.source === 'api' ? t('hermesChannels.team.firstClass') : t('hermesChannels.team.derived')}</span>
                <span>{t('hermesChannels.team.modeLabel', { mode: team.mode })}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  disabled={!canRun || team.source !== 'api'}
                  className={inputClass}
                  value={runInputs[team.id] || ''}
                  onChange={(event) => setRunInputs({ ...runInputs, [team.id]: event.target.value })}
                  placeholder={team.source === 'api' ? t('hermesChannels.team.runPlaceholder') : t('hermesChannels.team.runUnavailable')}
                />
                <button
                  type="button"
                  disabled={!canRun || team.source !== 'api' || !runInputs[team.id]?.trim() || runningTeamId === team.id}
                  onClick={() => handleRun(team)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  {runningTeamId === team.id ? t('hermesChannels.team.running') : t('hermesChannels.team.run')}
                </button>
              </div>
              {team.recentRunStatus && (
                <div className="mt-2 text-xs text-text-tertiary">
                  {t('hermesChannels.team.lastRun', { status: team.recentRunStatus })}
                </div>
              )}
              {team.recentRun && <TeamRunEvidenceSummary run={team.recentRun} />}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-background border border-border p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 text-xs text-text-tertiary">
          <div>{t('hermesChannels.team.note')}</div>
          <div>{t('hermesChannels.team.next')}</div>
        </div>
      </div>
    </div>
  );
}

function ControlPlaneOverview({ overview }: { overview: HermesControlPlaneOverview }) {
  const { t } = useLocale();
  const channelCount = overview.capabilityInventory.length;
  const workerHealthyCount = overview.workers.filter((worker) => worker.healthy).length;
  const proposalCount = sumRecord(overview.evolutionState.proposalsByStatus);
  const reviewQueueCount = sumRecord(overview.evolutionState.reviewQueueByStatus);
  const fallbackCount = overview.capabilityInventory.reduce((sum, item) => sum + item.fallbackRuns24h, 0);
  const riskItems = overview.riskSummary.items;

  return (
    <div className={`${panelClass} p-5`}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('hermesChannels.overview.title')}</h2>
          </div>
          <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.overview.subtitle')}</p>
        </div>
        <div className="text-xs text-text-tertiary">
          {t('hermesChannels.overview.generatedAt')}: {formatDateTime(overview.generatedAt)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <OverviewMetric label={t('hermesChannels.overview.channels')} value={String(channelCount)} />
        <OverviewMetric label={t('hermesChannels.overview.workers')} value={`${workerHealthyCount}/${overview.workers.length}`} />
        <OverviewMetric label={t('hermesChannels.overview.proposals')} value={String(proposalCount)} />
        <OverviewMetric label={t('hermesChannels.overview.reviewQueue')} value={String(reviewQueueCount)} />
        <OverviewMetric label={t('hermesChannels.overview.fallbacks')} value={String(fallbackCount)} tone={fallbackCount > 0 ? 'warning' : 'normal'} />
        <OverviewMetric label={t('hermesChannels.overview.activeReleases')} value={String(overview.evolutionState.activeReleaseCount)} />
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{t('hermesChannels.overview.runtimeTopology')}</h3>
            <span className="text-xs text-text-tertiary">
              {overview.capabilityGraph.nodes.length} {t('hermesChannels.overview.nodes')} / {overview.capabilityGraph.edges.length} {t('hermesChannels.overview.edges')}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {overview.capabilityInventory.map((item) => {
              const boundAgents = overview.agentBindings.filter((agent) => agent.channel_id === item.channelId);
              const channel = overview.channels.find((entry) => entry.id === item.channelId);
              return (
                <div key={item.channelId} className="rounded-lg bg-background border border-border p-3 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary truncate">{item.channelName}</div>
                      <div className="text-xs text-text-tertiary mt-1 truncate">{item.channelType} / {item.model}</div>
                    </div>
                    <HealthBadge status={item.healthStatus} />
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <TopologyRow
                      label={t('hermesChannels.overview.agents')}
                      value={boundAgents.length > 0 ? boundAgents.map((agent) => agent.name).join(', ') : t('hermesChannels.overview.noAgentBinding')}
                    />
                    <TopologyRow
                      label={t('hermesChannels.overview.worker')}
                      value={item.workerRole || t('hermesChannels.workerNotConfigured')}
                      status={item.workerRole ? (item.workerHealthy ? 'healthy' : 'failed') : 'unknown'}
                    />
                    <TopologyRow label={t('hermesChannels.policy')} value={item.policyId || '-'} />
                    <TopologyRow label="Base URL" value={channel?.base_url || 'HERMES_API_BASE'} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <MetricChip label={t('hermesChannels.overview.tools')} value={String(item.enabledTools)} />
                    <MetricChip label={t('hermesChannels.overview.riskTools')} value={String(item.highRiskTools)} />
                    <MetricChip label={t('hermesChannels.overview.skills')} value={String(item.enabledSkills)} />
                    <MetricChip label={t('hermesChannels.overview.mcp')} value={`${item.enabledMcpServers}/${item.unhealthyMcpServers}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-3">{t('hermesChannels.overview.riskSurface')}</h3>
            <div className="space-y-2">
              {riskItems.length === 0 ? (
                <div className="rounded-lg bg-background border border-border p-3 text-sm text-text-secondary">
                  {t('hermesChannels.overview.noRisks')}
                </div>
              ) : (
                riskItems.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-lg bg-background border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{riskText(item, t)}</div>
                        <div className="text-xs text-text-tertiary mt-1">{riskActionText(item.action, t)}</div>
                      </div>
                      <RiskBadge severity={item.severity} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-3">{t('hermesChannels.overview.evolutionState')}</h3>
            <div className="rounded-lg bg-background border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <MetricChip label={t('hermesChannels.overview.proposals')} value={String(proposalCount)} />
                <MetricChip label={t('hermesChannels.overview.reviewQueue')} value={String(reviewQueueCount)} />
                <MetricChip label={t('hermesChannels.overview.activeReleases')} value={String(overview.evolutionState.activeReleaseCount)} />
                <MetricChip label={t('hermesChannels.overview.recentReleases')} value={String(overview.releaseState.recent.length)} />
              </div>
              <div className="mt-3 text-xs text-text-tertiary">
                {t('hermesChannels.overview.safety')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  tone = 'normal'
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warning';
}) {
  return (
    <div className={clsx(
      'rounded-lg bg-background border p-3 min-w-0',
      tone === 'warning' ? 'border-amber-500/35' : 'border-border'
    )}>
      <div className="text-xs text-text-tertiary truncate">{label}</div>
      <div className={clsx(
        'mt-1 text-xl font-semibold truncate',
        tone === 'warning' ? 'text-amber-300' : 'text-text-primary'
      )}>
        {value}
      </div>
    </div>
  );
}

function TopologyRow({ label, value, status }: { label: string; value: string; status?: string }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
      <span className="text-text-tertiary">{label}</span>
      <span className="flex items-center gap-2 min-w-0 text-text-secondary">
        <span className="truncate">{value}</span>
        {status && <HealthDot status={status} />}
      </span>
    </div>
  );
}

function HealthDot({ status }: { status: string }) {
  return (
    <span className={clsx(
      'w-2 h-2 rounded-full shrink-0',
      status === 'healthy' && 'bg-green-400',
      status === 'failed' && 'bg-red-400',
      status !== 'healthy' && status !== 'failed' && 'bg-text-tertiary'
    )} />
  );
}

function RiskBadge({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  const { t } = useLocale();
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-1 rounded-md border text-xs whitespace-nowrap',
      severity === 'critical' && 'bg-red-500/10 border-red-500/25 text-red-300',
      severity === 'warning' && 'bg-amber-500/10 border-amber-500/25 text-amber-300',
      severity === 'info' && 'bg-primary/10 border-primary/25 text-primary'
    )}>
      {severity === 'critical' ? t('hermesChannels.risk.critical') : severity === 'warning' ? t('hermesChannels.risk.warning') : t('hermesChannels.risk.info')}
    </span>
  );
}

function TeamReadinessBadge({ ready }: { ready: boolean }) {
  const { t } = useLocale();
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs whitespace-nowrap',
      ready
        ? 'bg-green-500/10 border-green-500/25 text-green-300'
        : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
    )}>
      {ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
      {ready ? t('hermesChannels.team.ready') : t('hermesChannels.team.pending')}
    </span>
  );
}

function TeamRunEvidenceSummary({ run }: { run: AgentTeamRun }) {
  const { t } = useLocale();
  const chain = getTeamEvidenceChain(run);
  if (!chain) {
    return null;
  }

  const counts = chain.counts || {};
  const steps = (chain.steps || []).filter((step) => step.role !== 'leader').slice(0, 2);

  return (
    <div className="mt-3 rounded-lg bg-surface border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
            <BookOpenCheck className="w-3.5 h-3.5 text-primary" />
            {t('hermesChannels.team.evidenceChain')}
          </div>
          <div className="mt-1 text-[11px] text-text-tertiary truncate">
            {t('hermesChannels.team.correlation', { id: shortId(chain.correlationId || run.correlation_id || run.id) })}
          </div>
        </div>
        <span className="text-[11px] text-text-tertiary">{formatDateTime(run.completed_at || run.created_at)}</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <MetricChip label={t('hermesChannels.team.evidence.workers')} value={String(readCount(counts, 'workers'))} />
        <MetricChip label={t('hermesChannels.team.evidence.skills')} value={String(readCount(counts, 'skills'))} />
        <MetricChip label={t('hermesChannels.team.evidence.mcp')} value={String(readCount(counts, 'mcpServers'))} />
        <MetricChip label={t('hermesChannels.team.evidence.releases')} value={String(readCount(counts, 'releaseOverlays'))} />
      </div>

      {steps.length > 0 && (
        <div className="mt-3 space-y-2">
          {steps.map((step) => (
            <div key={`${step.role}-${step.workerRole}-${step.channelName}`} className="rounded-md bg-background border border-border px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs font-medium text-text-primary truncate">{step.displayName || step.role || '-'}</div>
                <HealthDot status={step.workerHealthy ? 'healthy' : 'failed'} />
              </div>
              <div className="mt-1 text-[11px] text-text-tertiary truncate">
                {step.channelName || step.channelType || '-'} / {step.workerRole || '-'}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {t('hermesChannels.team.evidence.skills')}: {step.skills?.length || 0}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {t('hermesChannels.team.evidence.mcp')}: {step.mcpServers?.length || 0}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {t('hermesChannels.team.evidence.releases')}: {step.releaseOverlays?.length || 0}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function riskText(
  item: HermesControlPlaneOverview['riskSummary']['items'][number],
  t: ReturnType<typeof useLocale>['t']
) {
  const values = {
    channel: item.channelName || '-',
    worker: item.workerRole || '-',
    count: item.count || 0
  };
  switch (item.code) {
    case 'channel_without_worker':
      return t('hermesChannels.risk.channelWithoutWorker', values);
    case 'worker_unhealthy':
      return t('hermesChannels.risk.workerUnhealthy', values);
    case 'fallback_runs':
      return t('hermesChannels.risk.fallbackRuns', values);
    case 'legacy_agent_config':
      return t('hermesChannels.risk.legacyAgentConfig', values);
    case 'high_risk_tools_without_policy':
      return t('hermesChannels.risk.highRiskToolsWithoutPolicy', values);
    case 'mcp_unhealthy':
      return t('hermesChannels.risk.mcpUnhealthy', values);
    case 'stale_review_queue':
      return t('hermesChannels.risk.staleReviewQueue', values);
    case 'no_active_release':
      return t('hermesChannels.risk.noActiveRelease');
    default:
      return item.code;
  }
}

function riskActionText(action: string, t: ReturnType<typeof useLocale>['t']) {
  switch (action) {
    case 'check_worker':
      return t('hermesChannels.risk.action.checkWorker');
    case 'bind_channel':
      return t('hermesChannels.risk.action.bindChannel');
    case 'review_policy':
      return t('hermesChannels.risk.action.reviewPolicy');
    case 'review_mcp':
      return t('hermesChannels.risk.action.reviewMcp');
    case 'review_evolution':
      return t('hermesChannels.risk.action.reviewEvolution');
    case 'publish_release':
      return t('hermesChannels.risk.action.publishRelease');
    default:
      return action;
  }
}

function sumRecord(record: Record<string, number>) {
  return Object.values(record).reduce((sum, value) => sum + Number(value || 0), 0);
}

function readCount(counts: Record<string, unknown>, key: string) {
  const value = counts[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getTeamEvidenceChain(run: AgentTeamRun): TeamEvidenceChain | null {
  const outputChain = asRecord(run.output)?.evidenceChain;
  const metadataChain = asRecord(run.metadata)?.evidenceChain;
  const chain = asRecord(outputChain) || asRecord(metadataChain);
  if (!chain) return null;
  return {
    schemaVersion: typeof chain.schemaVersion === 'string' ? chain.schemaVersion : undefined,
    correlationId: typeof chain.correlationId === 'string' ? chain.correlationId : undefined,
    counts: asRecord(chain.counts) || {},
    steps: Array.isArray(chain.steps)
      ? chain.steps.map((step) => asRecord(step)).filter((step): step is Record<string, unknown> => Boolean(step)).map((step) => ({
        role: typeof step.role === 'string' ? step.role : undefined,
        displayName: typeof step.displayName === 'string' ? step.displayName : undefined,
        agentName: typeof step.agentName === 'string' ? step.agentName : null,
        channelName: typeof step.channelName === 'string' ? step.channelName : null,
        channelType: typeof step.channelType === 'string' ? step.channelType : null,
        workerRole: typeof step.workerRole === 'string' ? step.workerRole : null,
        workerHealthy: step.workerHealthy === true,
        workerLastRun: asRecord(step.workerLastRun),
        skills: Array.isArray(step.skills) ? step.skills : [],
        mcpServers: Array.isArray(step.mcpServers) ? step.mcpServers : [],
        tools: Array.isArray(step.tools) ? step.tools : [],
        releaseOverlays: Array.isArray(step.releaseOverlays) ? step.releaseOverlays : []
      }))
      : []
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function shortId(value?: string | null) {
  if (!value) return '-';
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function buildDigitalOpsTeams(overview: HermesControlPlaneOverview, agentTeams: AgentTeam[]): DigitalOpsTeam[] {
  const specs: Array<{
    id: string;
    teamType: string;
    titleKey: MessageKey;
    descKey: MessageKey;
    icon: typeof Bot;
    channelTypes: string[];
    workerRoles: string[];
    mode: string;
  }> = [
    {
      id: 'alert-remediation',
      teamType: 'alert_remediation',
      titleKey: 'hermesChannels.team.alertRemediation.title',
      descKey: 'hermesChannels.team.alertRemediation.desc',
      icon: ShieldCheck,
      channelTypes: ['diagnose', 'remediate', 'review'],
      workerRoles: ['diagnose', 'remediate', 'evolve'],
      mode: 'pipeline'
    },
    {
      id: 'inspection-review',
      teamType: 'inspection_review',
      titleKey: 'hermesChannels.team.inspectionReview.title',
      descKey: 'hermesChannels.team.inspectionReview.desc',
      icon: Activity,
      channelTypes: ['diagnose', 'review'],
      workerRoles: ['diagnose', 'evolve'],
      mode: 'parallel'
    },
    {
      id: 'change-risk',
      teamType: 'change_risk',
      titleKey: 'hermesChannels.team.changeRisk.title',
      descKey: 'hermesChannels.team.changeRisk.desc',
      icon: GitBranch,
      channelTypes: ['remediate', 'review'],
      workerRoles: ['remediate', 'evolve'],
      mode: 'debate'
    }
  ];

  return specs.map((spec) => {
    const apiTeam = agentTeams.find((team) => team.team_type === spec.teamType);
    if (apiTeam) {
      return {
        id: apiTeam.id,
        titleKey: spec.titleKey,
        descKey: spec.descKey,
        icon: spec.icon,
        channelTypes: spec.channelTypes,
        workerRoles: apiTeam.members
          .map((member) => member.worker_role)
          .filter((role): role is string => Boolean(role)),
        channelNames: apiTeam.members
          .map((member) => member.channel_name)
          .filter((name): name is string => Boolean(name)),
        agentNames: apiTeam.members
          .map((member) => member.agent_name)
          .filter((name): name is string => Boolean(name)),
        skills: apiTeam.capabilitySummary.skills,
        mcpServers: apiTeam.capabilitySummary.mcpServers,
        tools: apiTeam.capabilitySummary.tools,
        ready: apiTeam.readiness.ready,
        source: 'api' as const,
        mode: apiTeam.collaboration_mode,
        recentRunStatus: apiTeam.recentRuns?.[0]?.status || null,
        recentRun: apiTeam.recentRuns?.[0] || null
      };
    }

    const inventory = overview.capabilityInventory.filter((item) => spec.channelTypes.includes(item.channelType));
    const channels = overview.channels.filter((channel) => spec.channelTypes.includes(channel.type));
    const agents = overview.agentBindings.filter((agent) => agent.channel_type && spec.channelTypes.includes(agent.channel_type));
    const workers = overview.workers.filter((worker) => spec.workerRoles.includes(worker.role));
    return {
      ...spec,
      channelNames: channels.map((channel) => channel.name),
      agentNames: agents.map((agent) => agent.name),
      skills: inventory.reduce((sum, item) => sum + item.enabledSkills, 0),
      mcpServers: inventory.reduce((sum, item) => sum + item.enabledMcpServers, 0),
      tools: inventory.reduce((sum, item) => sum + item.enabledTools, 0),
      ready: spec.channelTypes.every((type) => channels.some((channel) => channel.type === type && channel.enabled === 1))
        && spec.workerRoles.every((role) => workers.some((worker) => worker.role === role && worker.healthy))
        && agents.length > 0,
      source: 'derived' as const,
      mode: spec.mode,
      recentRunStatus: null,
      recentRun: null
    };
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function WorkerStatusPanel({ workers }: { workers: HermesWorkerStatus[] }) {
  const { t } = useLocale();
  const ordered = ['diagnose', 'remediate', 'evolve']
    .map((role) => workers.find((worker) => worker.role === role))
    .filter((worker): worker is HermesWorkerStatus => Boolean(worker));

  if (ordered.length === 0) {
    return null;
  }

  return (
    <div className={`${panelClass} p-5`}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{t('hermesChannels.workers')}</h2>
          <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.workersDesc')}</p>
        </div>
        <Activity className="w-5 h-5 text-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {ordered.map((worker) => (
          <div key={worker.role} className="rounded-lg bg-background border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-text-primary truncate">{worker.name}</div>
                <div className="text-xs text-text-tertiary mt-1">{worker.role} / {worker.channelType}</div>
              </div>
              <HealthBadge status={!worker.configured ? 'unknown' : worker.healthy ? 'healthy' : 'failed'} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-md bg-surface border border-border px-2 py-1 text-text-secondary truncate">
                {worker.configured ? worker.status : t('hermesChannels.workerNotConfigured')}
              </span>
              <span className="rounded-md bg-surface border border-border px-2 py-1 text-text-secondary truncate">
                {worker.latencyMs ? `${worker.latencyMs}ms` : '-'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MetricChip label={t('hermesChannels.workerRuns24h')} value={String(worker.runStats?.totalRuns ?? 0)} />
              <MetricChip label={t('hermesChannels.workerFallbacks')} value={String(worker.runStats?.fallbackRuns ?? 0)} />
              <MetricChip
                label={t('hermesChannels.workerAvgLatency')}
                value={worker.runStats?.avgLatencyMs != null ? `${worker.runStats.avgLatencyMs}ms` : '-'}
              />
              <MetricChip
                label={t('hermesChannels.workerLastRun')}
                value={worker.lastRun?.status || '-'}
              />
            </div>
            <div className="mt-2 text-xs text-text-tertiary truncate">
              {worker.url || t('hermesChannels.workerNoUrl')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface border border-border px-2 py-1 min-w-0">
      <div className="text-[10px] uppercase text-text-tertiary truncate">{label}</div>
      <div className="text-xs font-medium text-text-primary truncate">{value}</div>
    </div>
  );
}

function ChannelDetails({
  channel,
  tools,
  skills,
  mcpServers,
  canManage,
  isSaving,
  isTesting,
  isCreatingMcp,
  testingMcpId,
  onSave,
  onTest,
  onCreateMcp,
  onTestMcp
}: {
  channel: HermesChannel;
  tools: ToolDescriptor[];
  skills: SkillPack[];
  mcpServers: McpServer[];
  canManage: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isCreatingMcp: boolean;
  testingMcpId: string | null;
  onSave: (form: ChannelFormState) => void;
  onTest: () => void;
  onCreateMcp: (form: McpServerFormState) => void;
  onTestMcp: (serverId: string) => void;
}) {
  const { t } = useLocale();
  const [form, setForm] = useState<ChannelFormState>(() => formFromChannel(channel));
  const [mcpForm, setMcpForm] = useState<McpServerFormState>({
    name: '',
    description: '',
    transport: 'http',
    url: '',
    command: ''
  });

  useEffect(() => {
    setForm(formFromChannel(channel));
  }, [channel]);

  const selectedTools = new Set(form.tools);
  const selectedSkills = new Set(form.skills);
  const selectedMcpServers = new Set(form.mcpServers);

  const toggleTool = (toolName: string) => {
    setForm((current) => ({
      ...current,
      tools: current.tools.includes(toolName)
        ? current.tools.filter((name) => name !== toolName)
        : [...current.tools, toolName]
    }));
  };

  const toggleSkill = (skillId: string) => {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(skillId)
        ? current.skills.filter((id) => id !== skillId)
        : [...current.skills, skillId]
    }));
  };

  const toggleMcpServer = (serverId: string) => {
    setForm((current) => ({
      ...current,
      mcpServers: current.mcpServers.includes(serverId)
        ? current.mcpServers.filter((id) => id !== serverId)
        : [...current.mcpServers, serverId]
    }));
  };

  const canCreateMcp = mcpForm.name.trim().length > 0 && (
    mcpForm.transport === 'stdio'
      ? mcpForm.command.trim().length > 0
      : mcpForm.url.trim().length > 0
  );

  const submitMcpServer = () => {
    if (!canCreateMcp) return;
    onCreateMcp(mcpForm);
    setMcpForm({ name: '', description: '', transport: mcpForm.transport, url: '', command: '' });
  };

  return (
    <div className="space-y-6">
      <div className={`${panelClass} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-text-primary">{channel.name}</h2>
              <HealthBadge status={channel.health_status} />
            </div>
            <p className="text-sm text-text-secondary mt-1">{channel.description || t('hermesChannels.noDescription')}</p>
          </div>
          <button
            onClick={onTest}
            disabled={!canManage || isTesting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Activity className="w-4 h-4" />
            {isTesting ? t('hermesChannels.testing') : t('hermesChannels.test')}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          <InfoTile label={t('hermesChannels.model')} value={channel.model} />
          <InfoTile label={t('hermesChannels.secretRef')} value={channel.api_key_ref} />
          <InfoTile label={t('hermesChannels.timeout')} value={`${channel.timeout_ms}ms`} />
          <InfoTile label={t('hermesChannels.lastChecked')} value={channel.last_checked_at || '-'} />
        </div>
      </div>

      <div className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('hermesChannels.mcpServers')}</h3>
            <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.mcpServersDesc')}</p>
          </div>
          <PlugZap className="w-5 h-5 text-primary" />
        </div>

        {mcpServers.length === 0 ? (
          <div className="rounded-lg bg-background border border-border p-4 text-sm text-text-tertiary">
            {t('hermesChannels.noMcpServers')}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {mcpServers.map((server) => (
              <div
                key={server.id}
                role={canManage ? 'button' : undefined}
                tabIndex={canManage ? 0 : undefined}
                onClick={() => canManage && toggleMcpServer(server.id)}
                onKeyDown={(event) => {
                  if (!canManage) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleMcpServer(server.id);
                  }
                }}
                className={clsx(
                  'text-left rounded-lg border p-3 transition-colors',
                  selectedMcpServers.has(server.id)
                    ? 'bg-primary/10 border-primary/40'
                    : 'bg-background border-border',
                  canManage ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary truncate">{server.name}</div>
                    <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{server.description || server.url || server.command || t('hermesChannels.noDescription')}</div>
                  </div>
                  <HealthBadge status={server.health_status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-text-tertiary">
                  <span className="truncate">{server.transport}</span>
                  <span className="whitespace-nowrap">{t('hermesChannels.mcpImportDisabled')}</span>
                </div>
                {canManage && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={testingMcpId === server.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTestMcp(server.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onTestMcp(server.id);
                        }
                      }}
                      className={clsx(
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface border border-border text-xs text-text-secondary hover:text-text-primary transition-colors',
                        testingMcpId === server.id && 'opacity-60'
                      )}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      {testingMcpId === server.id ? t('hermesChannels.testing') : t('common.test')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <div className="mt-5 pt-5 border-t border-border">
            <h4 className="text-sm font-semibold text-text-primary mb-3">{t('hermesChannels.registerMcp')}</h4>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] gap-3">
              <input
                className={inputClass}
                value={mcpForm.name}
                onChange={(event) => setMcpForm({ ...mcpForm, name: event.target.value })}
                placeholder={t('hermesChannels.mcpName')}
              />
              <select
                className={inputClass}
                value={mcpForm.transport}
                onChange={(event) => setMcpForm({ ...mcpForm, transport: event.target.value })}
              >
                <option value="http">http</option>
                <option value="sse">sse</option>
                <option value="stdio">stdio</option>
              </select>
              <input
                className={inputClass}
                value={mcpForm.transport === 'stdio' ? mcpForm.command : mcpForm.url}
                onChange={(event) => setMcpForm(mcpForm.transport === 'stdio'
                  ? { ...mcpForm, command: event.target.value }
                  : { ...mcpForm, url: event.target.value }
                )}
                placeholder={mcpForm.transport === 'stdio' ? t('hermesChannels.mcpCommand') : t('hermesChannels.mcpUrl')}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3">
              <input
                className={inputClass}
                value={mcpForm.description}
                onChange={(event) => setMcpForm({ ...mcpForm, description: event.target.value })}
                placeholder={t('hermesChannels.mcpDescription')}
              />
              <button
                type="button"
                onClick={submitMcpServer}
                disabled={!canCreateMcp || isCreatingMcp}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <PlugZap className="w-4 h-4" />
                {isCreatingMcp ? t('common.saving') : t('common.create')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('hermesChannels.skills')}</h3>
            <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.skillsDesc')}</p>
          </div>
          <BookOpenCheck className="w-5 h-5 text-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              disabled={!canManage}
              onClick={() => toggleSkill(skill.id)}
              className={clsx(
                'text-left rounded-lg border p-3 transition-colors',
                selectedSkills.has(skill.id)
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-background border-border',
                !canManage && 'cursor-default'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary truncate">{skill.name}</div>
                  <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{skill.description || t('hermesChannels.noDescription')}</div>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-md bg-surface border border-border text-text-secondary whitespace-nowrap">
                  {skill.version}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-text-secondary">
                <SemanticChip value={skill.category} />
                <SemanticChip value={t('hermesChannels.skillRisk', { level: skill.risk_level || 'medium' })} tone={skill.risk_level === 'high' ? 'warning' : 'normal'} />
                <SemanticChip value={t('hermesChannels.skillApproval', { policy: skill.approval_policy || 'inherit' })} />
                <SemanticChip value={skill.version_status || 'draft'} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text-tertiary">
                <SkillMetric label={t('hermesChannels.skillScenarios')} value={String(skill.applicable_scenarios?.length || 0)} />
                <SkillMetric label={t('hermesChannels.skillEvidence')} value={String(skill.evidence_requirements?.length || 0)} />
                <SkillMetric label={t('hermesChannels.skillRecommendedTools')} value={String((skill.recommended_tools || skill.required_tools || []).length)} />
                <SkillMetric label={t('hermesChannels.skillMcp')} value={String(skill.recommended_mcp_servers?.length || 0)} />
              </div>
              {(skill.verification_method || skill.rollback_guidance) && (
                <div className="mt-3 space-y-1 text-[11px] leading-5 text-text-tertiary">
                  {skill.verification_method && (
                    <div className="line-clamp-2">
                      <span className="font-medium text-text-secondary">{t('hermesChannels.skillVerification')}:</span> {skill.verification_method}
                    </div>
                  )}
                  {skill.rollback_guidance && (
                    <div className="line-clamp-2">
                      <span className="font-medium text-text-secondary">{t('hermesChannels.skillRollback')}:</span> {skill.rollback_guidance}
                    </div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('hermesChannels.config')}</h3>
            <p className="text-xs text-text-tertiary mt-1">{canManage ? t('hermesChannels.configDesc') : t('hermesChannels.readOnlyDesc')}</p>
          </div>
          {!canManage && <ShieldCheck className="w-5 h-5 text-primary" />}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label={t('hermesChannels.name')}>
            <input disabled={!canManage} className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label={t('hermesChannels.type')}>
            <select disabled={!canManage} className={inputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              <option value="diagnose">diagnose</option>
              <option value="remediate">remediate</option>
              <option value="review">review</option>
              <option value="custom">custom</option>
            </select>
          </Field>
          <Field label="Base URL">
            <input disabled={!canManage} className={inputClass} value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} placeholder="HERMES_API_BASE" />
          </Field>
          <Field label={t('hermesChannels.model')}>
            <input disabled={!canManage} className={inputClass} value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
          </Field>
          <Field label={t('hermesChannels.secretRef')}>
            <input disabled={!canManage} className={inputClass} value={form.api_key_ref} onChange={(event) => setForm({ ...form, api_key_ref: event.target.value })} />
          </Field>
          <Field label={t('hermesChannels.policy')}>
            <input disabled={!canManage} className={inputClass} value={form.policy_id} onChange={(event) => setForm({ ...form, policy_id: event.target.value })} />
          </Field>
          <Field label={t('hermesChannels.maxToolRounds')}>
            <input disabled={!canManage} type="number" min="0" max="12" className={inputClass} value={form.max_tool_rounds} onChange={(event) => setForm({ ...form, max_tool_rounds: Number(event.target.value) })} />
          </Field>
          <Field label={t('hermesChannels.temperature')}>
            <input disabled={!canManage} type="number" min="0" max="2" step="0.05" className={inputClass} value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} />
          </Field>
        </div>

        <Field label={t('hermesChannels.description')}>
          <textarea disabled={!canManage} className={`${inputClass} resize-none h-20`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>

        {canManage && (
          <div className="flex justify-end mt-5">
            <button
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>

      <div className={`${panelClass} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{t('hermesChannels.tools')}</h3>
            <p className="text-xs text-text-tertiary mt-1">{t('hermesChannels.toolsDesc')}</p>
          </div>
          <Wrench className="w-5 h-5 text-primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {tools.map((tool) => (
            <button
              key={tool.name}
              type="button"
              disabled={!canManage}
              onClick={() => toggleTool(tool.name)}
              className={clsx(
                'text-left rounded-lg border p-3 transition-colors',
                selectedTools.has(tool.name)
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-background border-border',
                !canManage && 'cursor-default'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary truncate">{tool.name}</div>
                  <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{tool.description}</div>
                </div>
                <span className="text-[11px] px-2 py-1 rounded-md bg-surface border border-border text-text-secondary whitespace-nowrap">
                  {tool.riskLevel}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-text-secondary mb-4">
      <span className="block mb-2 font-medium">{label}</span>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background border border-border p-3">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-sm font-semibold text-text-primary mt-1 truncate">{value}</div>
    </div>
  );
}

function SemanticChip({ value, tone = 'normal' }: { value: string; tone?: 'normal' | 'warning' }) {
  return (
    <span className={clsx(
      'px-2 py-1 rounded-md border whitespace-nowrap',
      tone === 'warning'
        ? 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-300'
        : 'bg-surface border-border text-text-secondary'
    )}>
      {value}
    </span>
  );
}

function SkillMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface border border-border px-2 py-1.5">
      <div className="truncate">{label}</div>
      <div className="mt-0.5 font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  const normalized = status || 'unknown';
  const Icon = normalized === 'healthy' ? CheckCircle2 : normalized === 'failed' ? XCircle : Clock;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border whitespace-nowrap',
      normalized === 'healthy' && 'bg-green-500/10 border-green-500/25 text-green-300',
      normalized === 'failed' && 'bg-red-500/10 border-red-500/25 text-red-300',
      normalized !== 'healthy' && normalized !== 'failed' && 'bg-background border-border text-text-tertiary'
    )}>
      <Icon className="w-3.5 h-3.5" />
      {normalized}
    </span>
  );
}

function formFromChannel(channel: HermesChannel): ChannelFormState {
  return {
    name: channel.name,
    description: channel.description || '',
    type: channel.type || 'custom',
    base_url: channel.base_url || '',
    model: channel.model || 'smart-router',
    api_key_ref: channel.api_key_ref || 'HERMES_API_KEY',
    timeout_ms: channel.timeout_ms || 300000,
    max_tool_rounds: channel.max_tool_rounds || 3,
    temperature: channel.temperature ?? 0.2,
    policy_id: channel.policy_id || '',
    enabled: channel.enabled === 1,
    tools: (channel.tools || []).filter((tool) => tool.enabled === 1).map((tool) => tool.tool_name),
    skills: (channel.skills || []).filter((skill) => skill.enabled === 1 && skill.binding_enabled === 1).map((skill) => skill.skill_id),
    mcpServers: (channel.mcpServers || []).filter((server) => server.enabled === 1 && server.binding_enabled === 1).map((server) => server.mcp_server_id)
  };
}
