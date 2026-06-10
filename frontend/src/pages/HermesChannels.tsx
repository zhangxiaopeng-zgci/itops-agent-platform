import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BookOpenCheck, Cable, CheckCircle2, Clock, Download, PlugZap, RefreshCw, Save, ShieldCheck, Upload, Wrench, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useLocale } from '../contexts/LocaleContext';

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
              onClick={() => queryClient.invalidateQueries({ queryKey: ['hermes-channels'] })}
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
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-text-tertiary">
                <span className="truncate">{skill.category}</span>
                <span className="whitespace-nowrap">{t('hermesChannels.requiredTools', { count: skill.required_tools.length })}</span>
              </div>
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
