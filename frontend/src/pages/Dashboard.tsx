import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Play,
  Radar,
  Route,
  Server,
  Settings,
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
      titleKey: 'dashboard.workbench.diagnosis.title',
      descriptionKey: 'dashboard.workbench.diagnosis.desc',
      count: highRiskAlerts.length || openAlerts.length,
      countKey: highRiskAlerts.length > 0 ? 'dashboard.workbench.diagnosis.highRisk' : 'dashboard.workbench.diagnosis.open',
      href: '/diagnosis-center',
      icon: Radar,
      tone: highRiskAlerts.length > 0 ? 'text-red-500 bg-red-500/10' : 'text-blue-500 bg-blue-500/10',
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
      titleKey: 'dashboard.workbench.capability.title',
      descriptionKey: 'dashboard.workbench.capability.desc',
      count: enabledAgents,
      countKey: 'dashboard.workbench.capability.count',
      href: '/hermes-console',
      icon: Brain,
      tone: 'text-purple-500 bg-purple-500/10',
    },
    {
      titleKey: 'dashboard.workbench.evolution.title',
      descriptionKey: 'dashboard.workbench.evolution.desc',
      count: pendingProposals.length,
      countKey: 'dashboard.workbench.evolution.count',
      href: '/evolution-governance',
      icon: Sparkles,
      tone: 'text-indigo-500 bg-indigo-500/10',
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
      titleKey: 'dashboard.usage.step.detect.title',
      descKey: 'dashboard.usage.step.detect.desc',
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
      titleKey: 'dashboard.usage.step.hermes.title',
      descKey: 'dashboard.usage.step.hermes.desc',
      href: '/hermes',
      icon: Brain,
    },
    {
      titleKey: 'dashboard.usage.step.approval.title',
      descKey: 'dashboard.usage.step.approval.desc',
      href: '/execution-center',
      icon: ShieldAlert,
    },
    {
      titleKey: 'dashboard.usage.step.verify.title',
      descKey: 'dashboard.usage.step.verify.desc',
      href: '/tasks',
      icon: CheckCircle2,
    },
    {
      titleKey: 'dashboard.usage.step.evolve.title',
      descKey: 'dashboard.usage.step.evolve.desc',
      href: '/evolution-governance',
      icon: Sparkles,
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-surface rounded-lg p-5 border border-border animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-border/50 mb-4" />
                <div className="h-5 w-28 bg-border/50 rounded mb-3" />
                <div className="h-4 w-full bg-border/50 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
