import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Brain,
  Cable,
  KanbanSquare,
  Loader2,
  MessageSquare,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

interface AgentItem {
  id: string;
  enabled?: number;
  runtime_type?: string;
  runtime_config?: Record<string, unknown>;
}

interface HermesChannel {
  id: string;
  enabled?: number;
  skills?: unknown[];
  mcpServers?: unknown[];
  tools?: unknown[];
}

interface HermesLaunchOption {
  mode: 'diagnose' | 'remediate' | 'review';
  channel: {
    id: string;
    name: string;
    type: string;
    model: string;
    healthStatus: string;
    enabled: number;
  };
  agent: {
    id: string;
    name: string;
    role?: string | null;
    enabled: number;
    runtime?: string | null;
    autonomyLevel?: string | null;
  } | null;
  policy: {
    canLaunch: boolean;
    mode: string;
    currentRole: string;
    highRiskToolCount: number;
  };
  capabilitySummary: {
    tools: Array<{ name: string; riskLevel: string }>;
    skillCount: number;
    mcpServerCount: number;
    warnings: string[];
  };
  defaultPrompt: string;
}

interface OperationCase {
  id: string;
  title: string;
  status: string;
  severity?: string | null;
  correlation_id?: string | null;
  asset_name?: string | null;
}

interface ServerItem {
  id: string;
  name: string;
  hostname?: string | null;
  ip_address?: string | null;
  enabled: number;
}

interface AlertItem {
  id: string;
  title: string;
  severity: string;
  status: string;
}

interface KubernetesCluster {
  id: string;
  name: string;
  environment?: string | null;
  api_server_url?: string | null;
  node_count: number;
  bound_server_count: number;
}

type LaunchContextType = 'none' | 'case' | 'server' | 'kubernetes' | 'alert';

function toArray<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export default function HermesConsole() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const toast = useToast();
  const [launchContextType, setLaunchContextType] = useState<LaunchContextType>('none');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [selectedKubernetesClusterId, setSelectedKubernetesClusterId] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState('');

  const { data: channels = [] } = useQuery({
    queryKey: ['hermes-console', 'channels'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels');
      return toArray<HermesChannel>(res.data.data, ['channels', 'items']);
    },
    staleTime: 60000,
  });

  const { data: launchOptions = [] } = useQuery({
    queryKey: ['hermes-console', 'launch-options'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-sessions/launch-options');
      return (res.data.data?.options || []) as HermesLaunchOption[];
    },
    staleTime: 30000,
  });

  const { data: operationCases = [] } = useQuery({
    queryKey: ['hermes-console', 'operation-cases'],
    queryFn: async () => {
      const res = await api.get('/api/operation-cases', { params: { limit: 20 } });
      return (res.data.data?.cases || []) as OperationCase[];
    },
    staleTime: 30000,
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['hermes-console', 'servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerItem>(res.data.data, ['servers', 'items']);
    },
    staleTime: 60000,
  });

  const { data: kubernetesClusters = [] } = useQuery({
    queryKey: ['hermes-console', 'kubernetes-clusters'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-clusters');
      return (res.data.data || []) as KubernetesCluster[];
    },
    staleTime: 60000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['hermes-console', 'alerts'],
    queryFn: async () => {
      const res = await api.get('/api/alerts', { params: { limit: 20 } });
      return (res.data.data || []) as AlertItem[];
    },
    staleTime: 30000,
  });

  const selectedCase = useMemo(() => operationCases.find((item) => item.id === selectedCaseId), [operationCases, selectedCaseId]);
  const selectedServer = useMemo(() => servers.find((item) => item.id === selectedServerId), [servers, selectedServerId]);
  const selectedKubernetesCluster = useMemo(() => kubernetesClusters.find((item) => item.id === selectedKubernetesClusterId), [kubernetesClusters, selectedKubernetesClusterId]);
  const selectedAlert = useMemo(() => alerts.find((item) => item.id === selectedAlertId), [alerts, selectedAlertId]);

  const launchContextPayload = useMemo(() => {
    if (launchContextType === 'case' && selectedCase) {
      return {
        caseId: selectedCase.id,
        correlationId: selectedCase.correlation_id || undefined,
        prompt: t('hermesConsole.launch.prompt.case', {
          title: selectedCase.title,
          status: selectedCase.status,
          severity: selectedCase.severity || t('common.unknown'),
        }),
      };
    }
    if (launchContextType === 'server' && selectedServer) {
      return {
        serverId: selectedServer.id,
        serverIds: [selectedServer.id],
        prompt: t('hermesConsole.launch.prompt.server', {
          name: selectedServer.name,
          host: selectedServer.hostname || selectedServer.ip_address || selectedServer.id,
        }),
      };
    }
    if (launchContextType === 'kubernetes' && selectedKubernetesCluster) {
      return {
        knowledgeCategory: 'kubernetes',
        prompt: t('hermesConsole.launch.prompt.kubernetes', {
          name: selectedKubernetesCluster.name,
          environment: selectedKubernetesCluster.environment || t('common.unknown'),
          apiServer: selectedKubernetesCluster.api_server_url || t('common.unknown'),
          nodes: selectedKubernetesCluster.node_count,
          bound: selectedKubernetesCluster.bound_server_count,
        }),
      };
    }
    if (launchContextType === 'alert' && selectedAlert) {
      return {
        alertId: selectedAlert.id,
        prompt: t('hermesConsole.launch.prompt.alert', {
          title: selectedAlert.title,
          severity: selectedAlert.severity,
          status: selectedAlert.status,
        }),
      };
    }
    return {};
  }, [launchContextType, selectedAlert, selectedCase, selectedKubernetesCluster, selectedServer, t]);
  const launchContextReady = launchContextType === 'none'
    || (launchContextType === 'case' && Boolean(selectedCase))
    || (launchContextType === 'server' && Boolean(selectedServer))
    || (launchContextType === 'kubernetes' && Boolean(selectedKubernetesCluster))
    || (launchContextType === 'alert' && Boolean(selectedAlert));

  const launchMutation = useMutation({
    mutationFn: async (option: HermesLaunchOption) => {
      const payload: Record<string, unknown> = {
        mode: option.mode,
        channelId: option.channel.id,
        ...launchContextPayload,
      };
      if (!payload.knowledgeCategory && option.mode === 'diagnose' && launchContextType === 'none') {
        payload.knowledgeCategory = 'kubernetes';
      }
      const res = await api.post('/api/hermes-sessions/launch', payload);
      return res.data.data as { launchUrl: string };
    },
    onSuccess: (result) => {
      navigate(result.launchUrl);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('hermesConsole.launch.failed'));
    },
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['hermes-console', 'agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return toArray<AgentItem>(res.data.data, ['agents', 'items']);
    },
    staleTime: 60000,
  });

  const enabledChannels = channels.filter((channel) => channel.enabled !== 0);
  const hermesAgents = agents.filter((agent) => agent.runtime_type === 'hermes' || agent.runtime_config?.provider === 'hermes');
  const skillCount = channels.reduce((count, channel) => count + (Array.isArray(channel.skills) ? channel.skills.length : 0), 0);
  const mcpCount = channels.reduce((count, channel) => count + (Array.isArray(channel.mcpServers) ? channel.mcpServers.length : 0), 0);
  const toolCount = channels.reduce((count, channel) => count + (Array.isArray(channel.tools) ? channel.tools.length : 0), 0);

  const metrics = [
    { labelKey: 'hermesConsole.metric.channels', value: enabledChannels.length, icon: Cable },
    { labelKey: 'hermesConsole.metric.agents', value: hermesAgents.length, icon: Bot },
    { labelKey: 'hermesConsole.metric.skills', value: skillCount, icon: Sparkles },
    { labelKey: 'hermesConsole.metric.mcp', value: mcpCount, icon: Network },
  ];

  const entries = [
    {
      titleKey: 'hermesConsole.entry.channels.title',
      descKey: 'hermesConsole.entry.channels.desc',
      href: '/hermes-channels',
      icon: Cable,
    },
    {
      titleKey: 'hermesConsole.entry.dashboard.title',
      descKey: 'hermesConsole.entry.dashboard.desc',
      href: '/hermes-dashboard',
      icon: KanbanSquare,
    },
    {
      titleKey: 'hermesConsole.entry.assistant.title',
      descKey: 'hermesConsole.entry.assistant.desc',
      href: '/hermes',
      icon: Brain,
    },
    {
      titleKey: 'hermesConsole.entry.agents.title',
      descKey: 'hermesConsole.entry.agents.desc',
      href: '/agents',
      icon: Bot,
    },
    {
      titleKey: 'hermesConsole.entry.skills.title',
      descKey: 'hermesConsole.entry.skills.desc',
      href: '/hermes-channels?focus=skills',
      icon: Sparkles,
    },
    {
      titleKey: 'hermesConsole.entry.mcp.title',
      descKey: 'hermesConsole.entry.mcp.desc',
      href: '/hermes-channels?focus=mcp',
      icon: Network,
    },
    {
      titleKey: 'hermesConsole.entry.policy.title',
      descKey: 'hermesConsole.entry.policy.desc',
      href: '/hermes-channels?focus=policy',
      icon: ShieldCheck,
    },
    {
      titleKey: 'hermesConsole.entry.models.title',
      descKey: 'hermesConsole.entry.models.desc',
      href: '/settings',
      icon: Wrench,
    },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('hermesConsole.title')}</h1>
              <p className="text-text-secondary mt-1">{t('hermesConsole.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/hermes')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Brain className="w-4 h-4" />
            {t('hermesConsole.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <div key={metric.labelKey} className="rounded-lg border border-border bg-surface p-4">
              <metric.icon className="w-5 h-5 text-primary" />
              <p className="mt-3 text-2xl font-semibold text-text-primary">{metric.value}</p>
              <p className="text-sm text-text-secondary">{t(metric.labelKey as MessageKey)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('hermesConsole.capability.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {t('hermesConsole.capability.desc', { tools: toolCount, skills: skillCount, mcp: mcpCount })}
          </p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {entries.map((entry) => (
              <button
                key={entry.href}
                onClick={() => navigate(entry.href)}
                className="text-left rounded-lg border border-border bg-background/50 p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <entry.icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-secondary" />
                </div>
                <p className="mt-4 font-semibold text-text-primary">{t(entry.titleKey as MessageKey)}</p>
                <p className="mt-2 text-sm text-text-secondary">{t(entry.descKey as MessageKey)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('hermesConsole.launch.title')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('hermesConsole.launch.subtitle')}</p>
            </div>
            <button
              onClick={() => navigate('/hermes')}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              {t('hermesConsole.launch.openAssistant')}
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-background/50 p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-secondary">{t('hermesConsole.launch.contextType')}</span>
                <select
                  value={launchContextType}
                  onChange={(event) => {
                    setLaunchContextType(event.target.value as LaunchContextType);
                    setSelectedCaseId('');
                    setSelectedServerId('');
                    setSelectedKubernetesClusterId('');
                    setSelectedAlertId('');
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="none">{t('hermesConsole.launch.context.none')}</option>
                  <option value="case">{t('hermesConsole.launch.context.case')}</option>
                  <option value="server">{t('hermesConsole.launch.context.server')}</option>
                  <option value="kubernetes">{t('hermesConsole.launch.context.kubernetes')}</option>
                  <option value="alert">{t('hermesConsole.launch.context.alert')}</option>
                </select>
              </label>

              {launchContextType === 'case' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">{t('hermesConsole.launch.context.case')}</span>
                  <select
                    value={selectedCaseId}
                    onChange={(event) => setSelectedCaseId(event.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="">{t('hermesConsole.launch.context.select')}</option>
                    {operationCases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {launchContextType === 'server' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">{t('hermesConsole.launch.context.server')}</span>
                  <select
                    value={selectedServerId}
                    onChange={(event) => setSelectedServerId(event.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="">{t('hermesConsole.launch.context.select')}</option>
                    {servers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.hostname || item.ip_address || item.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {launchContextType === 'kubernetes' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">{t('hermesConsole.launch.context.kubernetes')}</span>
                  <select
                    value={selectedKubernetesClusterId}
                    onChange={(event) => setSelectedKubernetesClusterId(event.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="">{t('hermesConsole.launch.context.select')}</option>
                    {kubernetesClusters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.bound_server_count}/{item.node_count}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {launchContextType === 'alert' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-text-secondary">{t('hermesConsole.launch.context.alert')}</span>
                  <select
                    value={selectedAlertId}
                    onChange={(event) => setSelectedAlertId(event.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="">{t('hermesConsole.launch.context.select')}</option>
                    {alerts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.severity} · {item.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {launchContextType === 'none' && (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-secondary">
                  {t('hermesConsole.launch.context.noneDesc')}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {launchOptions.map((option) => (
              <div key={option.channel.id} className="rounded-lg border border-border bg-background/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{option.channel.name}</p>
                    <p className="mt-1 text-xs text-text-secondary">{t(`hermes.mode.${option.mode}.title` as MessageKey)} · {option.channel.model}</p>
                  </div>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
                    {option.channel.healthStatus}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-text-secondary">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('hermesConsole.launch.agent')}</span>
                    <span className="text-text-primary truncate">{option.agent?.name || t('common.unknown')}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('hermesConsole.launch.policy')}</span>
                    <span className="text-text-primary">{t(`hermesConsole.launch.policy.${option.policy.mode}` as MessageKey)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('hermesConsole.launch.capabilities')}</span>
                    <span className="text-text-primary">
                      {t('hermesConsole.launch.capabilityCounts', {
                        tools: option.capabilitySummary.tools.length,
                        skills: option.capabilitySummary.skillCount,
                        mcp: option.capabilitySummary.mcpServerCount,
                      })}
                    </span>
                  </div>
                </div>

                {option.capabilitySummary.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                    {option.capabilitySummary.warnings.slice(0, 2).join(' · ')}
                  </div>
                )}

                <button
                  onClick={() => launchMutation.mutate(option)}
                  disabled={!option.policy.canLaunch || !launchContextReady || launchMutation.isPending}
                  title={!option.policy.canLaunch || !launchContextReady ? t('hermesConsole.launch.disabled') : undefined}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {launchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {t('hermesConsole.launch.start')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
