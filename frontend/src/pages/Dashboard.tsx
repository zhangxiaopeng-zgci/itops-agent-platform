import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Network,
  Play,
  Radar,
  Route,
  Server,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { safeFormatDistance } from '../lib/date';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface Agent {
  id: string;
  enabled: number;
}

interface ServerItem {
  id: string;
  enabled: number;
}

interface Workflow {
  id: string;
  is_template: number;
}

interface Task {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
}

interface ToolApproval {
  id: string;
  tool_name?: string;
  status: string;
  risk_level?: string;
  requested_at?: string;
}

interface EvolutionProposal {
  id: string;
  title: string;
  status: string;
  priority?: string;
  created_at?: string;
}

interface OpsOverview {
  generatedAt: string;
  hosts: {
    total: number;
    enabled: number;
    online: number;
    stale: number;
    avgCpu: number | null;
    avgMemory: number | null;
    avgDisk: number | null;
    freshMetrics: number;
  };
  kubernetes: {
    clusters: number;
    enabledClusters: number;
    syncedClusters: number;
    nodes: number;
    boundNodes: number;
    unboundNodes: number;
    boundRatio: number;
    pods: number;
    runningPods: number;
    notReadyPods: number;
    workloads: number;
    degradedWorkloads: number;
    warningEvents: number;
  };
  network: {
    total: number;
    online: number;
    warning: number;
    offline: number;
    unknown: number;
  };
  topology: {
    explicitEdges: number;
    activeEdges: number;
    staleEdges: number;
    unboundKubernetesNodes: number;
    accuracyScore: number;
  };
  closedLoop: {
    openAlerts: number;
    criticalAlerts: number;
    openCases: number;
    pendingApprovals: number;
    runningTasks: number;
    failedTasks: number;
    hermesSessions24h: number;
    openEvolutionProposals: number;
  };
  automation: {
    autoBindingEnabled: boolean;
    pendingHumanActions: number;
    topologyVerificationNeeded: number;
    recommendedNextActions: string[];
  };
}

interface ActiveInspectionFinding {
  id: string;
  domain: 'host' | 'kubernetes' | 'network' | 'alert';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  assetId?: string | null;
  assetType?: string | null;
  assetName?: string | null;
  alertId?: string | null;
  recommendedAction: string;
  caseId?: string | null;
  status: 'detected' | 'case_created' | 'case_updated' | 'case_exists';
}

interface ActiveInspectionSummary {
  generatedAt: string;
  mode: 'preview' | 'active';
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    casesCreated: number;
    casesUpdated: number;
    alertsCreated: number;
  };
  flow: Array<{
    key: string;
    label: string;
    status: 'done' | 'attention' | 'idle';
    count: number;
  }>;
  findings: ActiveInspectionFinding[];
}

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

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLocale();

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['workbench', 'agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return toArray<Agent>(res.data.data, ['agents', 'items']);
    },
    staleTime: 60000,
  });

  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['workbench', 'servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerItem>(res.data.data, ['servers', 'items']);
    },
    staleTime: 60000,
  });

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ['workbench', 'workflows'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return toArray<Workflow>(res.data.data, ['workflows', 'items']);
    },
    staleTime: 120000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['workbench', 'tasks'],
    queryFn: async () => {
      const res = await api.get('/api/tasks');
      return toArray<Task>(res.data.data, ['tasks', 'items']);
    },
    staleTime: 30000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['workbench', 'alerts'],
    queryFn: async () => {
      const res = await api.get('/api/alerts');
      return toArray<Alert>(res.data.data, ['alerts', 'items']);
    },
    staleTime: 30000,
  });

  const { data: approvals = [], isLoading: approvalsLoading } = useQuery({
    queryKey: ['workbench', 'tool-approvals'],
    queryFn: async () => {
      const res = await api.get('/api/tool-approvals');
      return toArray<ToolApproval>(res.data.data, ['approvals', 'items']);
    },
    staleTime: 30000,
  });

  const { data: proposals = [], isLoading: proposalsLoading } = useQuery({
    queryKey: ['workbench', 'evolution-proposals'],
    queryFn: async () => {
      const res = await api.get('/api/evolution-proposals', { params: { limit: 10 } });
      return toArray<EvolutionProposal>(res.data.data, ['proposals', 'items']);
    },
    staleTime: 60000,
  });

  const { data: opsOverview, isLoading: opsOverviewLoading } = useQuery({
    queryKey: ['dashboard', 'ops-overview'],
    queryFn: async () => {
      const res = await api.get('/api/dashboard/ops-overview');
      return res.data.data as OpsOverview;
    },
    staleTime: 30000,
  });

  const { data: activeInspection, isLoading: activeInspectionLoading } = useQuery({
    queryKey: ['active-inspection', 'summary'],
    queryFn: async () => {
      const res = await api.get('/api/active-inspection/summary');
      return res.data.data as ActiveInspectionSummary;
    },
    staleTime: 30000,
  });

  const runActiveInspection = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/active-inspection/run');
      return res.data.data as ActiveInspectionSummary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-inspection', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'ops-overview'] });
      queryClient.invalidateQueries({ queryKey: ['workbench', 'alerts'] });
      queryClient.invalidateQueries({ queryKey: ['operation-cases'] });
    },
  });

  const isLoading = agentsLoading
    || serversLoading
    || workflowsLoading
    || tasksLoading
    || alertsLoading
    || approvalsLoading
    || proposalsLoading;

  const openAlerts = alerts.filter((alert) => ['new', 'active', 'open'].includes(alert.status));
  const highRiskAlerts = openAlerts.filter((alert) => ['critical', 'high'].includes(alert.severity));
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending');
  const runningTasks = tasks.filter((task) => task.status === 'running');
  const failedTasks = tasks.filter((task) => task.status === 'failed');
  const pendingProposals = proposals.filter((proposal) => [
    'draft',
    'generated',
    'eval_pending',
    'eval_passed',
    'approval_pending',
    'approved',
  ].includes(proposal.status));
  const enabledServers = servers.filter((server) => server.enabled === 1).length;
  const enabledAgents = agents.filter((agent) => agent.enabled === 1).length;
  const workflowTemplates = workflows.filter((workflow) => workflow.is_template === 1).length;

  const workbenchCards = [
    {
      titleKey: 'dashboard.workbench.assets.title',
      descriptionKey: 'dashboard.workbench.assets.desc',
      count: enabledServers,
      countKey: 'dashboard.workbench.assets.count',
      href: '/assets-center',
      icon: Server,
      tone: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      titleKey: 'dashboard.workbench.diagnosis.title',
      descriptionKey: 'dashboard.workbench.diagnosis.desc',
      count: highRiskAlerts.length || openAlerts.length,
      countKey: highRiskAlerts.length > 0 ? 'dashboard.workbench.diagnosis.highRisk' : 'dashboard.workbench.diagnosis.open',
      href: '/diagnosis-center',
      icon: Radar,
      tone: highRiskAlerts.length > 0 ? 'text-red-500 bg-red-500/10' : 'text-blue-500 bg-blue-500/10',
    },
    {
      titleKey: 'dashboard.workbench.cases.title',
      descriptionKey: 'dashboard.workbench.cases.desc',
      count: opsOverview?.closedLoop.openCases || 0,
      countKey: 'dashboard.workbench.cases.count',
      href: '/operation-cases',
      icon: ClipboardList,
      tone: (opsOverview?.closedLoop.openCases || 0) > 0 ? 'text-indigo-500 bg-indigo-500/10' : 'text-emerald-500 bg-emerald-500/10',
    },
    {
      titleKey: 'dashboard.workbench.execution.title',
      descriptionKey: 'dashboard.workbench.execution.desc',
      count: pendingApprovals.length + runningTasks.length + failedTasks.length,
      countKey: 'dashboard.workbench.execution.todo',
      href: '/execution-center',
      icon: Route,
      tone: pendingApprovals.length > 0 ? 'text-yellow-500 bg-yellow-500/10' : 'text-emerald-500 bg-emerald-500/10',
    },
  ];

  const overviewCards = [
    {
      labelKey: 'dashboard.stats.servers',
      value: servers.length,
      helper: t('dashboard.overview.enabledServers', { count: enabledServers }),
      icon: Server,
    },
    {
      labelKey: 'dashboard.stats.agents',
      value: agents.length,
      helper: t('dashboard.overview.enabledAgents', { count: enabledAgents }),
      icon: Bot,
    },
    {
      labelKey: 'dashboard.stats.workflowTemplates',
      value: workflowTemplates,
      helper: t('dashboard.overview.workflowTemplates'),
      icon: GitBranch,
    },
    {
      labelKey: 'dashboard.stats.runningTasks',
      value: runningTasks.length,
      helper: failedTasks.length > 0
        ? t('dashboard.overview.failedTasks', { count: failedTasks.length })
        : t('dashboard.overview.noFailedTasks'),
      icon: Play,
    },
  ];

  const usageSteps = [
    {
      titleKey: 'dashboard.usage.step.resource.title',
      descKey: 'dashboard.usage.step.resource.desc',
      href: '/assets-center',
      icon: Server,
    },
    {
      titleKey: 'dashboard.usage.step.diagnosis.title',
      descKey: 'dashboard.usage.step.diagnosis.desc',
      href: '/diagnosis-center',
      icon: Radar,
    },
    {
      titleKey: 'dashboard.usage.step.case.title',
      descKey: 'dashboard.usage.step.case.desc',
      href: '/operation-cases',
      icon: ClipboardList,
    },
    {
      titleKey: 'dashboard.usage.step.execution.title',
      descKey: 'dashboard.usage.step.execution.desc',
      href: '/execution-center',
      icon: Route,
    },
  ];

  const startOptions = [
    {
      titleKey: 'dashboard.start.issue.title',
      descKey: 'dashboard.start.issue.desc',
      href: '/diagnosis-center',
      icon: AlertTriangle,
    },
    {
      titleKey: 'dashboard.start.case.title',
      descKey: 'dashboard.start.case.desc',
      href: '/operation-cases',
      icon: ClipboardList,
    },
    {
      titleKey: 'dashboard.start.execution.title',
      descKey: 'dashboard.start.execution.desc',
      href: '/execution-center',
      icon: Route,
    },
    {
      titleKey: 'dashboard.start.assets.title',
      descKey: 'dashboard.start.assets.desc',
      href: '/assets-center',
      icon: Server,
    },
  ];

  const formatTaskStatus = (status: string) => {
    const key = `status.task.${status}` as MessageKey;
    const text = t(key);
    return text === key ? status : text;
  };

  const formatSeverity = (severity: string) => {
    const key = `status.severity.${severity}` as MessageKey;
    const text = t(key);
    return text === key ? severity : text;
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{t('dashboard.title')}</h1>
                <p className="text-text-secondary mt-1">{t('dashboard.subtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/diagnosis-center')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Radar className="w-4 h-4" />
              {t('dashboard.primary.diagnose')}
            </button>
            <button
              onClick={() => navigate('/execution-center')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-surface transition-colors"
            >
              <Wrench className="w-4 h-4" />
              {t('dashboard.primary.execute')}
            </button>
          </div>
        </div>

        <OperationsWallboardSummary overview={opsOverview} loading={opsOverviewLoading} />

        <ActiveInspectionPanel
          data={activeInspection}
          loading={activeInspectionLoading}
          running={runActiveInspection.isPending}
          onRun={() => runActiveInspection.mutate()}
        />

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('dashboard.start.title')}</h2>
            <p className="text-sm text-text-secondary mt-1">{t('dashboard.start.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {startOptions.map((option) => (
              <button
                key={option.href}
                onClick={() => navigate(option.href)}
                className="text-left rounded-lg border border-border bg-surface p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <option.icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-secondary" />
                </div>
                <p className="font-semibold text-text-primary mt-4">{t(option.titleKey as MessageKey)}</p>
                <p className="text-sm text-text-secondary mt-2">{t(option.descKey as MessageKey)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('dashboard.usage.title')}</h2>
            <p className="text-sm text-text-secondary mt-1">{t('dashboard.usage.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {usageSteps.map((step, index) => (
              <button
                key={step.href}
                onClick={() => navigate(step.href)}
                className="text-left rounded-lg border border-border bg-surface p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors min-h-[150px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <step.icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-semibold text-text-tertiary">{index + 1}</span>
                </div>
                <p className="font-semibold text-text-primary mt-4">{t(step.titleKey as MessageKey)}</p>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">{t(step.descKey as MessageKey)}</p>
              </button>
            ))}
          </div>
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-surface rounded-lg p-5 border border-border animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-border/50 mb-4" />
                <div className="h-5 w-28 bg-border/50 rounded mb-3" />
                <div className="h-4 w-full bg-border/50 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {workbenchCards.map((card) => (
              <button
                key={card.href}
                onClick={() => navigate(card.href)}
                className="text-left bg-surface border border-border rounded-lg p-5 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.tone}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-secondary" />
                </div>
                <p className="font-semibold text-text-primary mt-4">{t(card.titleKey as MessageKey)}</p>
                <p className="text-sm text-text-secondary mt-2 min-h-[40px]">{t(card.descriptionKey as MessageKey)}</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-text-primary">{card.count}</span>
                  <span className="text-xs text-text-secondary">{t(card.countKey as MessageKey)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-primary" />
                {t('dashboard.todo.title')}
              </h2>
              <Link to="/execution-center" className="text-sm text-primary hover:underline">
                {t('dashboard.todo.viewExecution')}
              </Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TodoColumn
                title={t('dashboard.todo.alerts')}
                empty={t('dashboard.todo.noAlerts')}
                icon={AlertTriangle}
                items={openAlerts.slice(0, 4).map((alert) => ({
                  id: alert.id,
                  title: alert.title,
                  meta: `${formatSeverity(alert.severity)} · ${safeFormatDistance(alert.created_at)}`,
                  href: '/diagnosis-center',
                }))}
              />
              <TodoColumn
                title={t('dashboard.todo.approvals')}
                empty={t('dashboard.todo.noApprovals')}
                icon={ShieldAlert}
                items={pendingApprovals.slice(0, 4).map((approval) => ({
                  id: approval.id,
                  title: approval.tool_name || t('dashboard.todo.approvalFallback'),
                  meta: approval.risk_level || t('common.unknown'),
                  href: `/tool-approvals?approvalId=${encodeURIComponent(approval.id)}`,
                }))}
              />
              <TodoColumn
                title={t('dashboard.todo.tasks')}
                empty={t('dashboard.todo.noTasks')}
                icon={Clock}
                items={[...runningTasks, ...failedTasks].slice(0, 4).map((task) => ({
                  id: task.id,
                  title: task.name,
                  meta: `${formatTaskStatus(task.status)} · ${safeFormatDistance(task.created_at)}`,
                  href: '/tasks',
                }))}
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                {t('dashboard.evolution.title')}
              </h2>
              <Link to="/evolution-proposals" className="text-sm text-primary hover:underline">
                {t('common.viewAll')}
              </Link>
            </div>
            <div className="space-y-3">
              {pendingProposals.slice(0, 5).map((proposal) => (
                <button
                  key={proposal.id}
                  onClick={() => navigate(`/evolution-proposals?proposalId=${encodeURIComponent(proposal.id)}`)}
                  className="w-full text-left p-3 rounded-lg bg-background hover:bg-background/80 transition-colors"
                >
                  <p className="text-sm font-medium text-text-primary line-clamp-1">{proposal.title}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {proposal.priority || t('common.unknown')} · {proposal.status}
                  </p>
                </button>
              ))}
              {pendingProposals.length === 0 && (
                <div className="py-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">{t('dashboard.evolution.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-4">{t('dashboard.overview.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {overviewCards.map((card) => (
              <div key={card.labelKey} className="rounded-lg bg-background/60 border border-border p-4">
                <card.icon className="w-5 h-5 text-primary mb-3" />
                <p className="text-2xl font-semibold text-text-primary">{card.value}</p>
                <p className="text-sm text-text-secondary mt-1">{t(card.labelKey as MessageKey)}</p>
                <p className="text-xs text-text-secondary mt-2">{card.helper}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OperationsWallboardSummary({ overview, loading }: { overview?: OpsOverview; loading: boolean }) {
  const { t } = useLocale();

  if (loading || !overview) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 animate-pulse">
        <div className="h-5 w-48 rounded bg-border/60" />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-lg bg-background/70 border border-border" />
          ))}
        </div>
      </section>
    );
  }

  const healthItems = [
    {
      label: t('dashboard.wallboard.hosts'),
      value: overview.hosts.enabled,
      total: overview.hosts.total,
      helper: t('dashboard.wallboard.hosts.helper', {
        online: overview.hosts.online,
        stale: overview.hosts.stale,
      }),
      detail: t('dashboard.wallboard.hosts.detail', {
        cpu: formatMetric(overview.hosts.avgCpu),
        memory: formatMetric(overview.hosts.avgMemory),
        disk: formatMetric(overview.hosts.avgDisk),
      }),
      icon: Server,
      tone: 'text-sky-600 bg-sky-500/10',
      href: '/servers',
    },
    {
      label: t('dashboard.wallboard.kubernetes'),
      value: overview.kubernetes.clusters,
      total: overview.kubernetes.nodes,
      helper: t('dashboard.wallboard.kubernetes.helper', {
        pods: overview.kubernetes.pods,
        notReady: overview.kubernetes.notReadyPods,
      }),
      detail: t('dashboard.wallboard.kubernetes.detail', {
        bound: overview.kubernetes.boundRatio,
        unbound: overview.kubernetes.unboundNodes,
      }),
      icon: Boxes,
      tone: overview.kubernetes.unboundNodes > 0 ? 'text-amber-600 bg-amber-500/10' : 'text-emerald-600 bg-emerald-500/10',
      href: '/kubernetes-console',
    },
    {
      label: t('dashboard.wallboard.network'),
      value: overview.network.total,
      total: overview.network.online,
      helper: t('dashboard.wallboard.network.helper', {
        online: overview.network.online,
        warning: overview.network.warning,
      }),
      detail: t('dashboard.wallboard.network.detail', {
        offline: overview.network.offline,
        unknown: overview.network.unknown,
      }),
      icon: Network,
      tone: overview.network.offline > 0 || overview.network.warning > 0 ? 'text-amber-600 bg-amber-500/10' : 'text-teal-600 bg-teal-500/10',
      href: '/network-devices',
    },
    {
      label: t('dashboard.wallboard.closedLoop'),
      value: overview.closedLoop.openCases,
      total: overview.closedLoop.openAlerts,
      helper: t('dashboard.wallboard.closedLoop.helper', {
        approvals: overview.closedLoop.pendingApprovals,
        tasks: overview.closedLoop.runningTasks + overview.closedLoop.failedTasks,
      }),
      detail: t('dashboard.wallboard.closedLoop.detail', {
        sessions: overview.closedLoop.hermesSessions24h,
        proposals: overview.closedLoop.openEvolutionProposals,
      }),
      icon: Activity,
      tone: overview.closedLoop.criticalAlerts > 0 ? 'text-red-600 bg-red-500/10' : 'text-indigo-600 bg-indigo-500/10',
      href: '/operation-cases',
    },
  ];

  const actionItems = overview.automation.recommendedNextActions.length > 0
    ? overview.automation.recommendedNextActions
    : ['allClear'];

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('dashboard.wallboard.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('dashboard.wallboard.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/big-screen"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <LayoutDashboard className="h-4 w-4" />
            {t('dashboard.wallboard.openFull')}
          </Link>
          <Link
            to="/topology"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            <GitBranch className="h-4 w-4" />
            {t('dashboard.wallboard.openTopology')}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {healthItems.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className="rounded-lg border border-border bg-background/50 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-text-tertiary" />
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-text-primary">{item.value}</span>
              <span className="text-xs text-text-secondary">/ {item.total}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-text-primary">{item.label}</p>
            <p className="mt-2 text-xs text-text-secondary">{item.helper}</p>
            <p className="mt-1 text-xs text-text-tertiary">{item.detail}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('dashboard.wallboard.topologyAccuracy')}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {t('dashboard.wallboard.topologyDetail', {
                  stale: overview.topology.staleEdges,
                  unbound: overview.topology.unboundKubernetesNodes,
                })}
              </p>
            </div>
            <span className="text-2xl font-semibold text-text-primary">{overview.topology.accuracyScore}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-border/60">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, overview.topology.accuracyScore))}%` }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <p className="text-sm font-semibold text-text-primary">{t('dashboard.wallboard.nextActions')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {actionItems.map((action) => (
              <span key={action} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                {t(`dashboard.wallboard.action.${action}` as MessageKey)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ActiveInspectionPanel({
  data,
  loading,
  running,
  onRun,
}: {
  data?: ActiveInspectionSummary;
  loading: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const { t } = useLocale();
  const topFindings = data?.findings.slice(0, 3) || [];
  const actionableCount = (data?.summary.critical || 0) + (data?.summary.high || 0) + (data?.summary.medium || 0);
  const hasFindings = Boolean(data && data.summary.total > 0);

  if (loading || !data) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 animate-pulse">
        <div className="h-5 w-44 rounded bg-border/60" />
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 rounded-lg bg-background/70 border border-border" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">{t('dashboard.activeInspection.title')}</h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{t('dashboard.activeInspection.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Activity className="h-4 w-4" />
            {running ? t('dashboard.activeInspection.running') : t('dashboard.activeInspection.run')}
          </button>
          <Link
            to="/operation-cases"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            <ClipboardList className="h-4 w-4" />
            {t('dashboard.activeInspection.openCases')}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.flow.map((step) => (
          <div key={step.key} className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${step.status === 'attention' ? 'bg-amber-500/10 text-amber-600' : step.status === 'done' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-text-tertiary'}`}>
                {step.status === 'attention' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </span>
              <span className="text-xl font-semibold text-text-primary">{step.count}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-text-primary">{translateActiveInspectionStep(step.key, step.label, t)}</p>
            <p className="mt-1 text-xs text-text-secondary">{t(`dashboard.activeInspection.step.${step.key}.desc` as MessageKey)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[0.9fr_1.6fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-semibold text-text-primary">{t('dashboard.activeInspection.summary')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <InspectionMetric label={t('dashboard.activeInspection.total')} value={data.summary.total} />
            <InspectionMetric label={t('dashboard.activeInspection.actionable')} value={actionableCount} tone={actionableCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <InspectionMetric label={t('dashboard.activeInspection.casesCreated')} value={data.summary.casesCreated} />
            <InspectionMetric label={t('dashboard.activeInspection.casesUpdated')} value={data.summary.casesUpdated} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text-primary">{t('dashboard.activeInspection.findings')}</p>
            <span className="text-xs text-text-tertiary">{safeFormatDistance(data.generatedAt)}</span>
          </div>
          <div className="mt-3 space-y-2">
            {!hasFindings && (
              <div className="rounded-lg border border-border bg-surface px-3 py-4 text-sm text-text-secondary">
                {t('dashboard.activeInspection.empty')}
              </div>
            )}
            {topFindings.map((finding) => (
              <Link
                key={finding.id}
                to={finding.caseId ? `/operation-cases?caseId=${encodeURIComponent(finding.caseId)}` : '/diagnosis-center'}
                className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="line-clamp-1 text-sm font-medium text-text-primary">{finding.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-text-secondary">{finding.recommendedAction}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getFindingSeverityTone(finding.severity)}`}>
                    {t(`dashboard.activeInspection.severity.${finding.severity}` as MessageKey)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function InspectionMetric({ label, value, tone = 'text-text-primary' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
    </div>
  );
}

function translateActiveInspectionStep(key: string, fallback: string, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const translated = t(`dashboard.activeInspection.step.${key}` as MessageKey);
  return translated === `dashboard.activeInspection.step.${key}` ? fallback : translated;
}

function getFindingSeverityTone(severity: ActiveInspectionFinding['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/10 text-red-600';
    case 'high':
      return 'bg-orange-500/10 text-orange-600';
    case 'medium':
      return 'bg-amber-500/10 text-amber-600';
    default:
      return 'bg-slate-500/10 text-text-secondary';
  }
}

function formatMetric(value: number | null): string {
  return value === null ? '-' : `${value}%`;
}

function TodoColumn({
  title,
  empty,
  icon: Icon,
  items,
}: {
  title: string;
  empty: string;
  icon: typeof AlertTriangle;
  items: Array<{ id: string; title: string; meta: string; href: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.id} to={item.href} className="block rounded-lg bg-surface p-3 hover:bg-surface/80 transition-colors">
            <p className="text-sm font-medium text-text-primary line-clamp-1">{item.title}</p>
            <p className="text-xs text-text-secondary mt-1">{item.meta}</p>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-text-secondary">{empty}</p>
          </div>
        )}
      </div>
    </div>
  );
}
