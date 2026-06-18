import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCode,
  GitBranch,
  ListChecks,
  Play,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface TaskItem {
  id: string;
  status: string;
}

interface WorkflowItem {
  id: string;
  is_template: number;
}

interface ToolApprovalItem {
  id: string;
  status: string;
  risk_level?: string;
}

interface RemediationExecution {
  id: string;
  status: string;
}

interface ActionItem {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  href: string;
  icon: typeof Wrench;
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

export default function ExecutionCenter() {
  const navigate = useNavigate();
  const { t } = useLocale();

  const { data: tasks = [] } = useQuery({
    queryKey: ['execution-center', 'tasks'],
    queryFn: async () => {
      const res = await api.get('/api/tasks');
      return toArray<TaskItem>(res.data.data, ['tasks', 'items']);
    },
    staleTime: 30000,
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ['execution-center', 'workflows'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return toArray<WorkflowItem>(res.data.data, ['workflows', 'items']);
    },
    staleTime: 60000,
  });

  const { data: approvals = [] } = useQuery({
    queryKey: ['execution-center', 'tool-approvals'],
    queryFn: async () => {
      const res = await api.get('/api/tool-approvals');
      return toArray<ToolApprovalItem>(res.data.data, ['approvals', 'items']);
    },
    staleTime: 30000,
  });

  const { data: executions = [] } = useQuery({
    queryKey: ['execution-center', 'remediation-executions'],
    queryFn: async () => {
      const res = await api.get('/api/remediation-executions');
      return toArray<RemediationExecution>(res.data.data, ['executions', 'items']);
    },
    staleTime: 30000,
  });

  const runningTasks = tasks.filter((task) => task.status === 'running').length;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const workflowTemplates = workflows.filter((workflow) => workflow.is_template === 1).length;
  const failedExecutions = executions.filter((execution) => execution.status === 'failed').length;

  const statusCards = [
    {
      labelKey: 'executionCenter.metric.approvals',
      value: pendingApprovals,
      helper: pendingApprovals > 0
        ? t('executionCenter.metric.approvalsPending')
        : t('executionCenter.metric.approvalsClear'),
      icon: ShieldAlert,
      tone: pendingApprovals > 0 ? 'text-yellow-500 bg-yellow-500/10' : 'text-emerald-500 bg-emerald-500/10',
    },
    {
      labelKey: 'executionCenter.metric.tasks',
      value: runningTasks,
      helper: t('executionCenter.metric.tasksDesc', { count: tasks.length }),
      icon: Play,
      tone: runningTasks > 0 ? 'text-blue-500 bg-blue-500/10' : 'text-slate-500 bg-slate-500/10',
    },
    {
      labelKey: 'executionCenter.metric.workflows',
      value: workflowTemplates,
      helper: t('executionCenter.metric.workflowsDesc'),
      icon: GitBranch,
      tone: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      labelKey: 'executionCenter.metric.executions',
      value: failedExecutions,
      helper: failedExecutions > 0
        ? t('executionCenter.metric.executionsFailed')
        : t('executionCenter.metric.executionsClear'),
      icon: ListChecks,
      tone: failedExecutions > 0 ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10',
    },
  ];

  const actions: ActionItem[] = [
    {
      titleKey: 'executionCenter.action.workbench',
      descriptionKey: 'executionCenter.action.workbenchDesc',
      href: '/remediation-workbench',
      icon: Wrench,
    },
    {
      titleKey: 'executionCenter.action.approvals',
      descriptionKey: 'executionCenter.action.approvalsDesc',
      href: '/tool-approvals',
      icon: ShieldAlert,
    },
    {
      titleKey: 'executionCenter.action.tasks',
      descriptionKey: 'executionCenter.action.tasksDesc',
      href: '/tasks',
      icon: ListChecks,
    },
    {
      titleKey: 'executionCenter.action.workflows',
      descriptionKey: 'executionCenter.action.workflowsDesc',
      href: '/workflows',
      icon: GitBranch,
    },
    {
      titleKey: 'executionCenter.action.executions',
      descriptionKey: 'executionCenter.action.executionsDesc',
      href: '/remediation-executions',
      icon: RefreshCw,
    },
    {
      titleKey: 'executionCenter.action.scripts',
      descriptionKey: 'executionCenter.action.scriptsDesc',
      href: '/scripts',
      icon: FileCode,
    },
  ];

  const flowSteps = [
    { labelKey: 'executionCenter.flow.plan', icon: Wrench },
    { labelKey: 'executionCenter.flow.approval', icon: ShieldAlert },
    { labelKey: 'executionCenter.flow.execute', icon: Play },
    { labelKey: 'executionCenter.flow.observe', icon: ListChecks },
    { labelKey: 'executionCenter.flow.verify', icon: CheckCircle2 },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Route className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{t('executionCenter.title')}</h1>
                <p className="text-text-secondary mt-1">{t('executionCenter.subtitle')}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/remediation-workbench')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Wrench className="w-4 h-4" />
            {t('executionCenter.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statusCards.map((card) => (
            <div key={card.labelKey} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-text-secondary">{t(card.labelKey as MessageKey)}</p>
                  <p className="text-2xl font-semibold text-text-primary mt-2">{card.value}</p>
                  <p className="text-xs text-text-secondary mt-2">{card.helper}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.tone}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold text-text-primary mb-4">{t('executionCenter.flow.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {flowSteps.map((step, index) => (
              <div key={step.labelKey} className="flex items-center gap-3">
                <div className="flex-1 min-w-0 rounded-lg border border-border bg-background/40 p-3">
                  <step.icon className="w-4 h-4 text-primary mb-2" />
                  <p className="text-sm font-medium text-text-primary">{t(step.labelKey as MessageKey)}</p>
                </div>
                {index < flowSteps.length - 1 && (
                  <ArrowRight className="hidden md:block w-4 h-4 text-text-secondary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-text-primary mb-4">{t('executionCenter.actions.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {actions.map((action) => (
              <button
                key={action.href}
                onClick={() => navigate(action.href)}
                className="text-left bg-surface border border-border rounded-lg p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{t(action.titleKey)}</p>
                    <p className="text-sm text-text-secondary mt-1">{t(action.descriptionKey)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-text-secondary mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('executionCenter.guard.title')}</p>
              <p className="text-sm text-text-secondary mt-1">{t('executionCenter.guard.desc')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/tool-approvals')}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {t('executionCenter.guard.action')}
          </button>
        </div>
      </div>
    </div>
  );
}
