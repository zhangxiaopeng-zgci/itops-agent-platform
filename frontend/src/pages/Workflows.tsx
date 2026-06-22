import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch, Play, Clock, Plus, Edit, Server,
  Search, Filter, Copy, Trash2, XCircle,
  Zap, Shield, Database, Globe, Cpu, AlertTriangle,
  ArrowRight, Sparkles, CheckCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useLocale } from '../contexts/LocaleContext';

interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  agent_configs?: {
    hermesEnhanced?: boolean;
    runbookDriven?: boolean;
    collaborationMode?: string;
    runbookPattern?: string;
    stages?: Array<{
      phase?: string;
      approvalRequired?: boolean;
      verificationRequired?: boolean;
    }>;
  };
  is_template: number;
  created_at: string;
  updated_at?: string;
  capability_summary?: WorkflowCapabilitySummary;
}

interface WorkflowCapabilitySummary {
  hermesEnhanced: boolean;
  runbookDriven: boolean;
  collaborationMode: string | null;
  runbookPattern: string | null;
  agentTeams: Array<{ id: string; name: string; team_type: string }>;
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

interface Server {
  id: string;
  name: string;
  hostname: string;
}

function WorkflowCapabilitySummaryView({ summary }: { summary?: WorkflowCapabilitySummary }) {
  const { t } = useLocale();
  if (!summary) return null;

  const successRate = summary.executionQuality.successRate === null ? '-' : `${summary.executionQuality.successRate}%`;
  const gateText = summary.gates.approvalRequired || summary.gates.verificationRequired
    ? t('workflows.capability.gateSummary', {
      approval: summary.gates.approvalCount,
      verification: summary.gates.verificationCount
    })
    : t('workflows.runbook.readOnly');
  const items = [
    {
      label: t('workflows.capability.mode'),
      value: summary.hermesEnhanced ? t('workflows.hermesEnhanced') : t('workflows.capability.standard'),
      sub: summary.collaborationMode || summary.runbookPattern || '-'
    },
    {
      label: t('workflows.capability.teams'),
      value: String(summary.agentTeams.length),
      sub: summary.agentTeams.map((team) => team.name).slice(0, 2).join(', ') || t('workflows.capability.none')
    },
    {
      label: t('workflows.capability.agents'),
      value: String(summary.agents.length),
      sub: summary.agents.map((agent) => agent.name).slice(0, 2).join(', ') || t('workflows.capability.none')
    },
    {
      label: t('workflows.capability.skills'),
      value: String(summary.skills.count),
      sub: summary.skills.names.slice(0, 2).join(', ') || t('workflows.capability.none')
    },
    {
      label: t('workflows.capability.mcp'),
      value: String(summary.mcpServers.count),
      sub: summary.mcpServers.unhealthy > 0
        ? t('workflows.capability.unhealthyMcp', { count: summary.mcpServers.unhealthy })
        : t('workflows.capability.healthy')
    },
    {
      label: t('workflows.capability.bundles'),
      value: summary.channelBundles.count > 0
        ? `${summary.channelBundles.ready}/${summary.channelBundles.count}`
        : '0',
      sub: summary.channelBundles.count > 0
        ? t('workflows.capability.bundleReleaseSummary', { count: summary.channelBundles.releaseOverlays })
        : t('workflows.capability.none')
    },
    {
      label: t('workflows.capability.quality'),
      value: successRate,
      sub: summary.executionQuality.recentTotal > 0
        ? t('workflows.capability.recentRuns', { count: summary.executionQuality.recentTotal })
        : t('workflows.capability.noRuns')
    }
  ];

  return (
    <div className="mb-4 rounded-xl bg-background/70 border border-border p-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg bg-surface border border-border px-3 py-2 min-w-0">
            <div className="text-[11px] text-text-tertiary truncate">{item.label}</div>
            <div className="mt-1 text-sm font-semibold text-text-primary truncate">{item.value}</div>
            <div className="mt-0.5 text-xs text-text-tertiary truncate">{item.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 text-xs">
          {gateText}
        </span>
        {summary.runbookDriven && (
          <span className="px-2 py-1 rounded-md bg-teal-500/10 text-teal-500 border border-teal-500/20 text-xs">
            {t('workflows.capability.runbookDriven')}
          </span>
        )}
        {summary.executionQuality.lastStatus && (
          <span className="px-2 py-1 rounded-md bg-surface text-text-secondary border border-border text-xs">
            {t('workflows.capability.lastStatus')}: {summary.executionQuality.lastStatus}
          </span>
        )}
        {summary.channelBundles.channels.map((channel) => (
          <span
            key={channel.id}
            className={`px-2 py-1 rounded-md border text-xs ${
              channel.ready
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20'
            }`}
          >
            {channel.name} · {channel.ready ? t('workflows.capability.bundleReady') : t('workflows.capability.bundleNeedsReview')}
          </span>
        ))}
        {summary.channelBundles.warnings.slice(0, 3).map((warning) => (
          <span key={warning} className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20 text-xs">
            {bundleWarningText(warning, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Workflows() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const dateLocale = locale === 'zh-CN' ? zhCN : enUS;
  const [executingWorkflow, setExecutingWorkflow] = useState<string | null>(null);
  const [selectedWorkflowForServer, setSelectedWorkflowForServer] = useState<Workflow | null>(null);
  const [showServerSelectModal, setShowServerSelectModal] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTemplate, setFilterTemplate] = useState<'all' | 'template' | 'custom'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const getWorkflowStyle = (workflow: Workflow) => {
    if (isHermesEnhancedWorkflow(workflow)) {
      return { icon: Sparkles, color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/30' };
    }

    const serverNames = ['\u670d\u52a1\u5668', '\u5de1\u68c0', '\u5408\u89c4', 'server', 'inspect', 'compliance'];
    const securityNames = ['\u5b89\u5168', '\u6f0f\u6d1e', 'security', 'vulnerability'];
    const dataNames = ['\u6570\u636e', '\u5907\u4efd', '\u6062\u590d', 'data', 'backup', 'restore'];
    const networkNames = ['\u7f51\u7edc', 'DNS', 'network'];
    const systemNames = ['\u7cfb\u7edf', '\u6027\u80fd', '\u76d1\u63a7', 'system', 'performance', 'monitor'];
    
    const name = workflow.name.toLowerCase();
    
    if (serverNames.some(n => name.includes(n))) {
      return { icon: Server as any, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30' };
    }
    if (securityNames.some(n => name.includes(n))) {
      return { icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' };
    }
    if (dataNames.some(n => name.includes(n))) {
      return { icon: Database, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
    }
    if (networkNames.some(n => name.includes(n))) {
      return { icon: Globe, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' };
    }
    if (systemNames.some(n => name.includes(n))) {
      return { icon: Cpu, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' };
    }
    
    if (workflow.is_template === 1) {
      return { icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
    }
    
    return { icon: GitBranch, color: 'text-text-secondary', bg: 'bg-text-secondary/10', border: 'border-text-secondary/30' };
  };
  
  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as Server[];
    },
  });

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return res.data.data as Workflow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      await api.delete(`/api/workflows/${workflowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      setDeleteConfirmId(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (workflow: Workflow) => {
      const newWorkflow = {
        ...workflow,
        name: t('workflows.copyName', { name: workflow.name }),
        is_template: 0,
      };
      delete (newWorkflow as any).id;
      delete (newWorkflow as any).created_at;
      delete (newWorkflow as any).updated_at;
      await api.post('/api/workflows', newWorkflow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async ({ workflowId, context }: { workflowId: string; context?: any }) => {
      const res = await api.post('/api/tasks', {
        workflow_id: workflowId,
        name: 'Task',
        input: t('workflows.executionInput'),
        context
      });
      return res.data.data;
    },
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      navigate(`/tasks`);
    },
  });

  const isServerRelatedWorkflow = (workflow: Workflow) => {
    const serverAgentNames = [
      '\u670d\u52a1\u5668\u547d\u4ee4\u6267\u884c',
      '\u81ea\u52a8\u5de1\u68c0',
      '\u5408\u89c4\u68c0\u67e5',
      '\u7cfb\u7edf\u5de1\u68c0',
      '\u53d8\u66f4\u6267\u884c',
      '\u670d\u52a1\u5668',
      'server',
      'inspect',
      'compliance'
    ];
    return workflow.nodes?.some((node: any) => 
      serverAgentNames.some(name => node.data?.label?.includes(name))
    );
  };

  const filteredWorkflows = workflows?.filter(workflow => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        workflow.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterTemplate === 'all' ||
                        (filterTemplate === 'template' && workflow.is_template === 1) ||
                        (filterTemplate === 'custom' && workflow.is_template === 0);
    return matchesSearch && matchesFilter;
  });

  const handleExecute = (workflow: Workflow) => {
    if (isServerRelatedWorkflow(workflow) && servers && servers.length > 0) {
      setSelectedWorkflowForServer(workflow);
      setSelectedServers([]);
      setShowServerSelectModal(true);
    } else {
      if (confirm(getExecutionConfirmMessage(workflow, t))) {
        setExecutingWorkflow(workflow.id);
        executeMutation.mutate({ workflowId: workflow.id }, {
          onSettled: () => setExecutingWorkflow(null),
        });
      }
    }
  };

  const toggleServerSelection = (serverId: string) => {
    setSelectedServers(prev => {
      if (prev.includes(serverId)) {
        return prev.filter(id => id !== serverId);
      } else {
        return [...prev, serverId];
      }
    });
  };

  const selectAllServers = () => {
    if (servers) {
      setSelectedServers(servers.map(s => s.id));
    }
  };

  const clearServerSelection = () => {
    setSelectedServers([]);
  };

  const handleSelectServersAndExecute = () => {
    if (selectedWorkflowForServer && selectedServers.length > 0) {
      if (!confirm(getExecutionConfirmMessage(selectedWorkflowForServer, t))) {
        return;
      }
      setExecutingWorkflow(selectedWorkflowForServer.id);
      executeMutation.mutate(
        { 
          workflowId: selectedWorkflowForServer.id, 
          context: { serverIds: selectedServers } 
        },
        {
          onSettled: () => {
            setExecutingWorkflow(null);
            setShowServerSelectModal(false);
            setSelectedWorkflowForServer(null);
            setSelectedServers([]);
          },
        }
      );
    }
  };

  const handleDuplicate = (workflow: Workflow) => {
    if (confirm(t('workflows.confirm.duplicate', { name: workflow.name }))) {
      duplicateMutation.mutate(workflow);
    }
  };

  const handleDelete = (workflowId: string) => {
    deleteMutation.mutate(workflowId);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">{t('workflows.title')}</h1>
            <p className="text-text-secondary">{t('workflows.subtitle')}</p>
          </div>
          <button
            onClick={() => navigate('/workflows/new')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('workflows.new')}
          </button>
        </div>

        {/* Search and Filter */}
        <div className="bg-surface rounded-xl p-4 border border-border">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  placeholder={t('workflows.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-text-secondary" />
              <select
                value={filterTemplate}
                onChange={(e) => setFilterTemplate(e.target.value as any)}
                className="px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none"
              >
                <option value="all">{t('common.all')}</option>
                <option value="template">{t('workflows.filter.templatesOnly')}</option>
                <option value="custom">{t('workflows.filter.customOnly')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-xl p-5 border border-border hover:border-primary/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <GitBranch className="w-5 h-5 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold text-text-primary mb-1">{workflows?.length || 0}</div>
            <div className="text-sm text-text-secondary">{t('workflows.stats.total')}</div>
          </div>
          <div className="bg-surface rounded-xl p-5 border border-border hover:border-purple-500/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-500" />
              </div>
            </div>
            <div className="text-3xl font-bold text-purple-500 mb-1">
              {workflows?.filter(w => w.is_template === 1).length || 0}
            </div>
            <div className="text-sm text-text-secondary">{t('workflows.stats.templates')}</div>
          </div>
          <div className="bg-surface rounded-xl p-5 border border-border hover:border-blue-500/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Edit className="w-5 h-5 text-blue-500" />
              </div>
            </div>
            <div className="text-3xl font-bold text-blue-500 mb-1">
              {workflows?.filter(w => w.is_template === 0).length || 0}
            </div>
            <div className="text-sm text-text-secondary">{t('workflows.stats.custom')}</div>
          </div>
          <div className="bg-surface rounded-xl p-5 border border-border hover:border-green-500/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Cpu className="w-5 h-5 text-green-500" />
              </div>
            </div>
            <div className="text-3xl font-bold text-green-500 mb-1">
              {workflows?.reduce((acc, w) => acc + (w.nodes?.length || 0), 0) || 0}
            </div>
            <div className="text-sm text-text-secondary">{t('workflows.stats.nodes')}</div>
          </div>
        </div>

        {/* Server Select Modal */}
        {showServerSelectModal && selectedWorkflowForServer && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-lg mx-4">
              <h3 className="text-xl font-bold text-text-primary mb-2">{t('workflows.serverModal.title')}</h3>
              <p className="text-text-secondary mb-4">
                {t('workflows.serverModal.desc', { name: selectedWorkflowForServer.name })}
              </p>

              <WorkflowBundlePreflight workflow={selectedWorkflowForServer} />
              
              {/* Selection Controls */}
              <div className="flex items-center justify-between mb-4 p-3 bg-background rounded-lg border border-border">
                <span className="text-sm text-text-secondary">
                  {t('workflows.serverModal.selected', { selected: selectedServers.length, total: servers?.length || 0 })}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllServers}
                    className="text-sm px-3 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
                  >
                    {t('workflows.serverModal.selectAll')}
                  </button>
                  <button
                    onClick={clearServerSelection}
                    className="text-sm px-3 py-1 bg-surface border border-border text-text-secondary rounded hover:bg-background transition-colors"
                  >
                    {t('workflows.serverModal.clear')}
                  </button>
                </div>
              </div>
              
              {/* Server List */}
              <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
                {servers?.map((server) => (
                  <button
                    key={server.id}
                    onClick={() => toggleServerSelection(server.id)}
                    disabled={!!executingWorkflow}
                    className={`w-full p-4 text-left rounded-lg border transition-all disabled:opacity-50 flex items-center gap-3 ${
                      selectedServers.includes(server.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedServers.includes(server.id)
                        ? 'bg-primary border-primary text-white'
                        : 'border-gray-300'
                    }`}>
                      {selectedServers.includes(server.id) && <CheckCircle className="w-3.5 h-3.5" />}
                    </div>
                    <Server className={`w-5 h-5 ${selectedServers.includes(server.id) ? 'text-primary' : 'text-gray-400'}`} />
                    <div className="flex-1">
                      <div className="font-medium text-text-primary">{server.name}</div>
                      <div className="text-sm text-text-secondary">{server.hostname}</div>
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowServerSelectModal(false);
                    setSelectedWorkflowForServer(null);
                    setSelectedServers([]);
                  }}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSelectServersAndExecute}
                  disabled={selectedServers.length === 0 || !!executingWorkflow}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {executingWorkflow ? t('workflows.executing') : t('workflows.executeSelected', { count: selectedServers.length })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-500/10 rounded-full">
                  <XCircle className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-text-primary">{t('workflows.delete.title')}</h3>
              </div>
              <p className="text-text-secondary mb-6">
                {t('workflows.delete.desc')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleteMutation.isPending ? t('workflows.delete.deleting') : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredWorkflows?.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border border-border">
            <GitBranch className="w-16 h-16 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">{t('workflows.empty.title')}</h3>
            <p className="text-text-secondary mb-6">
              {searchQuery || filterTemplate !== 'all' ? t('workflows.empty.noMatch') : t('workflows.empty.desc')}
            </p>
            <button
              onClick={() => navigate('/workflows/new')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('workflows.new')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredWorkflows?.map((workflow) => {
              const style = getWorkflowStyle(workflow);
              const Icon = style.icon;
              
              return (
                <div
                  key={workflow.id}
                  className="bg-surface rounded-2xl border border-border hover:border-primary/30 transition-all group relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-2xl ${style.bg}`} />
                  
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${style.bg} group-hover:scale-110 transition-transform`}>
                          <Icon className={`w-6 h-6 ${style.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-text-primary truncate">{workflow.name}</h3>
                            {workflow.is_template === 1 && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
                                <Sparkles className="w-3 h-3" />
                                {t('workflows.templateBadge')}
                              </span>
                            )}
                            {isHermesEnhancedWorkflow(workflow) && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-teal-500/10 text-teal-500 text-xs rounded-full border border-teal-500/20">
                                <CheckCircle className="w-3 h-3" />
                                {t('workflows.hermesEnhanced')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-text-secondary" />
                            <span className="text-xs text-text-secondary">
                              {formatDistanceToNow(new Date(workflow.created_at), { addSuffix: true, locale: dateLocale })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDuplicate(workflow)}
                              className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                              title={t('workflows.actions.duplicate')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(workflow.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-text-secondary mb-4 line-clamp-2 min-h-[40px]">
                      {workflow.description || t('workflows.noDescription')}
                    </p>

                    {isHermesEnhancedWorkflow(workflow) && (
                      <div className="mb-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <RunbookChip label={t('workflows.runbook.mode')} value={workflow.agent_configs?.collaborationMode || '-'} />
                        <RunbookChip label={t('workflows.runbook.stages')} value={String(workflow.agent_configs?.stages?.length || 0)} />
                        <RunbookChip label={t('workflows.runbook.skills')} value={String(countRecommendedSkills(workflow))} />
                        <RunbookChip
                          label={t('workflows.runbook.gates')}
                          value={summarizeRunbookGates(workflow, {
                            readOnly: t('workflows.runbook.readOnly'),
                            gateSummary: (approval, verification) => t('workflows.runbook.gateSummary', { approval, verification })
                          })}
                        />
                      </div>
                    )}

                    <WorkflowCapabilitySummaryView summary={workflow.capability_summary} />

                    <div className="bg-gradient-to-br from-background/80 to-background/40 rounded-xl p-5 mb-4 border border-border/60">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-primary" />
                          {t('workflows.flow.title')}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium">
                            {t('workflows.flow.nodeCount', { count: workflow.nodes?.length || 0 })}
                          </span>
                          <span className="text-xs text-text-tertiary">|</span>
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 text-purple-500 rounded-md text-xs font-medium">
                            {t('workflows.flow.edgeCount', { count: workflow.edges?.length || 0 })}
                          </span>
                        </div>
                      </div>
                      
                      <div className="min-h-[60px]">
                        {workflow.nodes && workflow.nodes.length > 0 ? (
                          <div className="flex items-center gap-2 overflow-x-auto pb-2">
                            {(() => {
                              const nodeMap = new Map((workflow.nodes || []).map(node => [node.id, node]));
                              const edgeMap = new Map<string, string[]>();
                              
                              // Build edge adjacency.
                              (workflow.edges || []).forEach(edge => {
                                const targets = edgeMap.get(edge.source) || [];
                                targets.push(edge.target);
                                edgeMap.set(edge.source, targets);
                              });
                              
                              // Find start nodes without incoming edges.
                              const targetIds = new Set((workflow.edges || []).map(e => e.target));
                              const startNodes = (workflow.nodes || []).filter(n => !targetIds.has(n.id));
                              
                              // If there is one start node, render a simplified linear flow.
                              if (startNodes.length === 1) {
                                const orderedNodes: any[] = [];
                                let currentId: string | null = startNodes[0].id;
                                const visited = new Set<string>();
                                
                                while (currentId && !visited.has(currentId) && orderedNodes.length < 5) {
                                  visited.add(currentId);
                                  const node = nodeMap.get(currentId);
                                  if (node) orderedNodes.push(node);
                                  const nextTargets = edgeMap.get(currentId) || [];
                                  currentId = nextTargets.length > 0 ? nextTargets[0] : null;
                                }
                                
                                return orderedNodes.map((node, index) => (
                                  <div key={node.id} className="flex items-center shrink-0">
                                    <div className="px-4 py-2.5 bg-gradient-to-r from-surface to-background rounded-lg border-2 border-primary/20 hover:border-primary/50 transition-all shadow-sm flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                                        <span className="text-xs font-bold text-primary">{index + 1}</span>
                                      </div>
                                      <span className="text-sm font-medium text-text-primary truncate max-w-28">
                                        {node.data?.label || t('workflows.flow.defaultNode')}
                                      </span>
                                    </div>
                                    {index < orderedNodes.length - 1 && (
                                      <div className="flex items-center px-1">
                                        <div className="w-6 h-px bg-gradient-to-r from-primary/50 to-primary/30" />
                                        <ArrowRight className="w-3 h-3 text-primary/60 mx-0.5" />
                                        <div className="w-6 h-px bg-gradient-to-l from-primary/50 to-primary/30" />
                                      </div>
                                    )}
                                  </div>
                                ));
                              }
                              
                              // Otherwise show the first few nodes.
                              return (workflow.nodes || []).slice(0, 4).map((node, index) => (
                                <div key={node.id} className="flex items-center shrink-0">
                                  <div className="px-4 py-2.5 bg-gradient-to-r from-surface to-background rounded-lg border-2 border-border/70 hover:border-primary/40 transition-all shadow-sm flex items-center gap-2">
                                    <span className="text-sm font-medium text-text-primary truncate max-w-24">
                                      {node.data?.label || t('workflows.flow.defaultNode')}
                                    </span>
                                  </div>
                                  {index < Math.min((workflow.nodes || []).length, 4) - 1 && (
                                    <ArrowRight className="w-4 h-4 text-text-tertiary mx-1" />
                                  )}
                                </div>
                              ));
                            })()}
                            
                            {workflow.nodes && workflow.nodes.length > 4 && (
                              <div className="shrink-0 ml-1 px-3 py-2 bg-gradient-to-r from-primary/5 to-purple-500/5 text-primary rounded-lg border border-primary/20 flex items-center gap-1.5">
                                <span className="text-sm font-medium">+{workflow.nodes.length - 4}</span>
                                <span className="text-xs text-text-secondary">{t('workflows.flow.more')}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-16 text-text-tertiary text-sm italic border-2 border-dashed border-border/50 rounded-lg">
                            {t('workflows.flow.noNodes')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => handleExecute(workflow)}
                        disabled={executingWorkflow === workflow.id || (workflow.nodes?.length || 0) === 0}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/25"
                      >
                        <Play className="w-4 h-4" />
                        {executingWorkflow === workflow.id ? t('workflows.executing') : t('workflows.actions.execute')}
                      </button>
                      <button
                        onClick={() => navigate(`/workflows/${workflow.id}`)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-background border border-border text-text-primary rounded-xl hover:bg-background/80 hover:border-primary/30 transition-all"
                      >
                        <Edit className="w-4 h-4" />
                        {t('common.edit')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function isHermesEnhancedWorkflow(workflow: Workflow) {
  return Boolean(
    workflow.capability_summary?.hermesEnhanced ||
    workflow.agent_configs?.hermesEnhanced ||
    workflow.agent_configs?.runbookDriven ||
    workflow.nodes?.some((node) => node.data?.runbookPhase)
  );
}

function WorkflowBundlePreflight({ workflow }: { workflow: Workflow }) {
  const { t } = useLocale();
  const bundles = workflow.capability_summary?.channelBundles;
  if (!bundles || bundles.count === 0) return null;

  const allReady = bundles.needsReview === 0;
  return (
    <div className={`mb-4 rounded-lg border p-3 ${
      allReady
        ? 'bg-emerald-500/10 border-emerald-500/20'
        : 'bg-amber-500/10 border-amber-500/20'
    }`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-4 h-4 mt-0.5 ${allReady ? 'text-emerald-500' : 'text-amber-500'}`} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            {allReady
              ? t('workflows.capability.bundlePreflightReady')
              : t('workflows.capability.bundlePreflightWarning', { count: bundles.needsReview })}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {t('workflows.capability.bundlePreflightDesc', {
              ready: bundles.ready,
              total: bundles.count,
              releases: bundles.releaseOverlays
            })}
          </div>
          {bundles.warnings.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bundles.warnings.map((warning) => (
                <span key={warning} className="px-2 py-1 rounded-md bg-surface border border-border text-xs text-text-secondary">
                  {bundleWarningText(warning, t)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getExecutionConfirmMessage(workflow: Workflow, t: ReturnType<typeof useLocale>['t']) {
  const bundles = workflow.capability_summary?.channelBundles;
  if (bundles && bundles.count > 0 && bundles.needsReview > 0) {
    return t('workflows.confirm.executeWithBundleWarning', {
      name: workflow.name,
      count: bundles.needsReview
    });
  }
  return t('workflows.confirm.execute', { name: workflow.name });
}

function bundleWarningText(warning: string, t: ReturnType<typeof useLocale>['t']) {
  const labels: Record<string, string> = {
    channel_disabled: t('hermesChannels.bundle.warning.channel_disabled'),
    no_bound_agent: t('hermesChannels.bundle.warning.no_bound_agent'),
    no_enabled_tool: t('hermesChannels.bundle.warning.no_enabled_tool'),
    high_risk_tools_without_policy: t('hermesChannels.bundle.warning.high_risk_tools_without_policy'),
    unhealthy_mcp_server: t('hermesChannels.bundle.warning.unhealthy_mcp_server'),
    recent_failed_runs: t('hermesChannels.bundle.warning.recent_failed_runs'),
    recent_fallback_runs: t('hermesChannels.bundle.warning.recent_fallback_runs')
  };
  return labels[warning] || warning;
}

function summarizeRunbookGates(
  workflow: Workflow,
  labels: { readOnly: string; gateSummary: (approval: number, verification: number) => string }
) {
  const stages = workflow.agent_configs?.stages || [];
  const approvalCount = stages.filter((stage) => stage.approvalRequired).length;
  const verificationCount = stages.filter((stage) => stage.verificationRequired).length;
  if (approvalCount === 0 && verificationCount === 0) {
    return labels.readOnly;
  }
  return labels.gateSummary(approvalCount, verificationCount);
}

function countRecommendedSkills(workflow: Workflow) {
  const skillIds = new Set<string>();
  (workflow.agent_configs?.stages || []).forEach((stage: any) => {
    if (typeof stage.recommendedSkillId === 'string' && stage.recommendedSkillId) {
      skillIds.add(stage.recommendedSkillId);
    }
    if (Array.isArray(stage.recommendedSkillIds)) {
      stage.recommendedSkillIds.forEach((skillId: unknown) => {
        if (typeof skillId === 'string' && skillId) skillIds.add(skillId);
      });
    }
  });
  (workflow.nodes || []).forEach((node: any) => {
    if (typeof node.data?.recommendedSkillId === 'string' && node.data.recommendedSkillId) {
      skillIds.add(node.data.recommendedSkillId);
    }
    if (Array.isArray(node.data?.recommendedSkillIds)) {
      node.data.recommendedSkillIds.forEach((skillId: unknown) => {
        if (typeof skillId === 'string' && skillId) skillIds.add(skillId);
      });
    }
  });
  return skillIds.size;
}

function RunbookChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary truncate">{label}</div>
      <div className="mt-1 text-sm font-medium text-text-primary truncate">{value}</div>
    </div>
  );
}
