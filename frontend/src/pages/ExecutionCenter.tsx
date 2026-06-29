import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ClipboardList,
  ExternalLink,
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

interface ServerItem {
  id: string;
  name?: string;
  hostname?: string;
  enabled: number;
}

interface OperationCase {
  id: string;
  title?: string;
  status?: string;
  correlation_id?: string | null;
}

interface OperationCaseDetailResponse {
  case: OperationCase;
}

interface ActionItem {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  href: string;
  icon: typeof Wrench;
}

interface ExecutionFocus {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  ctaKey: MessageKey;
  href: string;
  icon: typeof Wrench;
  tone: string;
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

function getAssetTypeLabel(type: string | null, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const keys: Record<string, MessageKey> = {
    server: 'topology.asset.server',
    network_device: 'topology.asset.networkDevice',
    kubernetes_cluster: 'topology.asset.kubernetesCluster',
    kubernetes_node: 'topology.asset.kubernetesNode',
    kubernetes_namespace: 'topology.asset.kubernetesNamespace',
    kubernetes_workload: 'topology.asset.kubernetesWorkload',
    kubernetes_pod: 'topology.asset.kubernetesPod',
    kubernetes_service: 'topology.asset.kubernetesService',
  };
  return type && keys[type] ? t(keys[type]) : t('topology.asset.generic');
}

function formatServerName(server: ServerItem): string {
  return server.name || server.hostname || server.id;
}

function appendQuery(path: string, query: string): string {
  if (!query) return path;
  return path.includes('?') ? `${path}&${query}` : `${path}?${query}`;
}

function HandoffFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary break-words">{value}</p>
    </div>
  );
}

function ExecutionQueueCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-2 text-xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-tertiary">{helper}</p>
    </div>
  );
}

export default function ExecutionCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLocale();
  const assetId = searchParams.get('assetId');
  const assetType = searchParams.get('assetType');
  const assetName = searchParams.get('assetName');
  const caseId = searchParams.get('caseId');
  const correlationId = searchParams.get('correlationId');
  const serverIds = useMemo(() => {
    return (searchParams.get('serverIds') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [searchParams]);

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

  const { data: servers = [] } = useQuery({
    queryKey: ['execution-center', 'servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerItem>(res.data.data, ['servers', 'items']);
    },
    staleTime: 60000,
  });

  const { data: operationCase } = useQuery({
    queryKey: ['execution-center', 'operation-case', caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const res = await api.get(`/api/operation-cases/${encodeURIComponent(caseId!)}`);
      const payload = res.data.data as OperationCaseDetailResponse;
      return payload.case;
    },
    staleTime: 30000,
  });

  const handoffServers = useMemo(() => {
    return servers.filter((server) => serverIds.includes(server.id));
  }, [serverIds, servers]);
  const handoffAssetLabel = useMemo(() => {
    if (assetName) return assetName;
    if (!assetId) return '-';
    const matchedServer = servers.find((server) => server.id === assetId);
    return matchedServer ? formatServerName(matchedServer) : assetId;
  }, [assetId, assetName, servers]);
  const handoffCaseLabel = operationCase?.title || caseId || '-';
  const handoffCorrelationLabel = operationCase?.correlation_id || correlationId || '-';
  const hasHandoffContext = Boolean(assetId || assetType || serverIds.length > 0 || caseId || correlationId);
  const handoffQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (caseId) params.set('caseId', caseId);
    if (operationCase?.correlation_id || correlationId) {
      params.set('correlationId', operationCase?.correlation_id || correlationId || '');
    }
    if (assetId) params.set('assetId', assetId);
    if (assetType) params.set('assetType', assetType);
    if (assetName) params.set('assetName', assetName);
    if (serverIds.length > 0) params.set('serverIds', serverIds.join(','));
    return params.toString();
  }, [assetId, assetName, assetType, caseId, correlationId, operationCase?.correlation_id, serverIds]);

  const runningTasks = tasks.filter((task) => task.status === 'running').length;
  const failedTasks = tasks.filter((task) => task.status === 'failed').length;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const workflowTemplates = workflows.filter((workflow) => workflow.is_template === 1).length;
  const failedExecutions = executions.filter((execution) => execution.status === 'failed').length;
  const executionFocus: ExecutionFocus = pendingApprovals > 0
    ? {
      titleKey: 'executionCenter.focus.approval.title',
      descriptionKey: 'executionCenter.focus.approval.desc',
      ctaKey: 'executionCenter.focus.approval.cta',
      href: '/tool-approvals',
      icon: ShieldAlert,
      tone: 'border-amber-500/30 bg-amber-500/10',
    }
    : failedTasks > 0 || failedExecutions > 0
      ? {
        titleKey: 'executionCenter.focus.failure.title',
        descriptionKey: 'executionCenter.focus.failure.desc',
        ctaKey: 'executionCenter.focus.failure.cta',
        href: failedTasks > 0 ? '/tasks' : '/remediation-executions',
        icon: RefreshCw,
        tone: 'border-red-500/30 bg-red-500/10',
      }
      : runningTasks > 0
        ? {
          titleKey: 'executionCenter.focus.running.title',
          descriptionKey: 'executionCenter.focus.running.desc',
          ctaKey: 'executionCenter.focus.running.cta',
          href: '/tasks',
          icon: Play,
          tone: 'border-sky-500/30 bg-sky-500/10',
        }
        : {
          titleKey: 'executionCenter.focus.ready.title',
          descriptionKey: 'executionCenter.focus.ready.desc',
          ctaKey: 'executionCenter.focus.ready.cta',
          href: '/remediation-workbench',
          icon: Wrench,
          tone: 'border-emerald-500/30 bg-emerald-500/10',
        };

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
            onClick={() => navigate(appendQuery('/remediation-workbench', handoffQuery))}
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

        <section className={`rounded-lg border p-5 ${executionFocus.tone}`}>
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface border border-border text-primary flex items-center justify-center flex-shrink-0">
                  <executionFocus.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{t('executionCenter.focus.eyebrow')}</p>
                  <h2 className="mt-1 text-base font-semibold text-text-primary">{t(executionFocus.titleKey)}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{t(executionFocus.descriptionKey)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:min-w-[420px]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ExecutionQueueCard
                  label={t('executionCenter.focus.queue.approvals')}
                  value={pendingApprovals}
                  helper={t('executionCenter.focus.queue.approvalsHelper')}
                />
                <ExecutionQueueCard
                  label={t('executionCenter.focus.queue.tasks')}
                  value={runningTasks + failedTasks}
                  helper={t('executionCenter.focus.queue.tasksHelper')}
                />
                <ExecutionQueueCard
                  label={t('executionCenter.focus.queue.verification')}
                  value={failedExecutions}
                  helper={t('executionCenter.focus.queue.verificationHelper')}
                />
              </div>
              <button
                onClick={() => navigate(appendQuery(executionFocus.href, handoffQuery))}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                {t(executionFocus.ctaKey)}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {hasHandoffContext && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">{t('executionCenter.handoff.title')}</h2>
                    <p className="text-sm text-text-secondary mt-1">{t('executionCenter.handoff.subtitle')}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-5 gap-3">
                  <HandoffFact label={t('executionCenter.handoff.case')} value={handoffCaseLabel} />
                  <HandoffFact label={t('executionCenter.handoff.correlation')} value={handoffCorrelationLabel} />
                  <HandoffFact label={t('executionCenter.handoff.asset')} value={handoffAssetLabel} />
                  <HandoffFact label={t('executionCenter.handoff.assetType')} value={getAssetTypeLabel(assetType, t)} />
                  <HandoffFact
                    label={t('executionCenter.handoff.relatedServers')}
                    value={handoffServers.length > 0 ? handoffServers.map(formatServerName).join(', ') : (serverIds.length > 0 ? serverIds.join(', ') : '-')}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 xl:justify-end">
                {caseId && (
                  <button
                    onClick={() => navigate(`/operation-cases?caseId=${encodeURIComponent(caseId)}`)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors text-sm"
                  >
                    <ClipboardList className="w-4 h-4" />
                    {t('executionCenter.handoff.openCase')}
                  </button>
                )}
                {(operationCase?.correlation_id || correlationId) && (
                  <button
                    onClick={() => navigate(`/hermes-dashboard?correlationId=${encodeURIComponent(operationCase?.correlation_id || correlationId || '')}`)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {t('executionCenter.handoff.openTrace')}
                  </button>
                )}
                <button
                  onClick={() => navigate(appendQuery('/remediation-workbench', handoffQuery))}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors text-sm"
                >
                  <Wrench className="w-4 h-4" />
                  {t('executionCenter.handoff.openWorkbench')}
                </button>
                <button
                  onClick={() => navigate(appendQuery('/tool-approvals', handoffQuery))}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors text-sm"
                >
                  <ShieldAlert className="w-4 h-4" />
                  {t('executionCenter.handoff.openApprovals')}
                </button>
                <button
                  onClick={() => navigate(appendQuery('/tasks', handoffQuery))}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors text-sm"
                >
                  <ListChecks className="w-4 h-4" />
                  {t('executionCenter.handoff.openTasks')}
                </button>
              </div>
            </div>
          </div>
        )}

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
                onClick={() => navigate(appendQuery(action.href, handoffQuery))}
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
