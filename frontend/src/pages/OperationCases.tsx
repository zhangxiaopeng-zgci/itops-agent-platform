import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  GitBranch,
  History,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

type CaseStatus =
  | 'diagnosing'
  | 'diagnosis_ready'
  | 'approval_pending'
  | 'executing'
  | 'verifying'
  | 'reviewing'
  | 'evolving'
  | 'closed'
  | 'cancelled';

interface OperationCase {
  id: string;
  title: string;
  case_type: string;
  status: CaseStatus;
  severity?: string | null;
  source?: string | null;
  asset_id?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  alert_id?: string | null;
  correlation_id?: string | null;
  server_ids: string[];
  context?: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

interface OperationCaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  source_type?: string | null;
  source_id?: string | null;
  correlation_id?: string | null;
  payload?: Record<string, unknown>;
  created_by?: string | null;
  created_at: string;
}

interface OperationCaseListResponse {
  cases: OperationCase[];
  total: number;
}

interface CorrelationTrace {
  operationCases?: Array<Record<string, unknown>>;
  hermesSessions?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  agentExecutions?: Array<Record<string, unknown>>;
  workerRuns?: Array<Record<string, unknown>>;
  proposals?: Array<Record<string, unknown>>;
  auditLogs?: Array<Record<string, unknown>>;
  executionEvidence?: Array<Record<string, unknown>>;
  executionEvidenceSummary?: {
    counts?: Record<string, number>;
    riskLevels?: string[];
    toolCalls?: string[];
    latestEvidenceAt?: string | null;
  };
}

interface OperationCaseDetailResponse {
  case: OperationCase;
  events: OperationCaseEvent[];
  trace?: CorrelationTrace;
}

interface CaseNextAction {
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  path: string;
  tone: 'primary' | 'warning' | 'danger' | 'success';
}

const statusOrder: CaseStatus[] = [
  'diagnosing',
  'diagnosis_ready',
  'approval_pending',
  'executing',
  'verifying',
  'reviewing',
  'evolving',
  'closed'
];

const statusLabelKeys: Record<CaseStatus, MessageKey> = {
  diagnosing: 'operationCases.status.diagnosing',
  diagnosis_ready: 'operationCases.status.diagnosisReady',
  approval_pending: 'operationCases.status.approvalPending',
  executing: 'operationCases.status.executing',
  verifying: 'operationCases.status.verifying',
  reviewing: 'operationCases.status.reviewing',
  evolving: 'operationCases.status.evolving',
  closed: 'operationCases.status.closed',
  cancelled: 'operationCases.status.cancelled',
};

const eventLabelKeys: Record<string, MessageKey> = {
  case_created: 'operationCases.event.caseCreated',
  status_changed: 'operationCases.event.statusChanged',
  tool_approval_created: 'operationCases.event.approvalCreated',
  tool_approval_approved: 'operationCases.event.approvalApproved',
  tool_approval_rejected: 'operationCases.event.approvalRejected',
  tool_approval_executed: 'operationCases.event.approvalExecuted',
  tool_approval_execution_failed: 'operationCases.event.approvalFailed',
  workflow_task_created: 'operationCases.event.taskCreated',
  workflow_task_started: 'operationCases.event.taskStarted',
  workflow_task_completed: 'operationCases.event.taskCompleted',
  workflow_task_failed: 'operationCases.event.taskFailed',
  remediation_verification_passed: 'operationCases.event.verifyPassed',
  remediation_verification_failed: 'operationCases.event.verifyFailed',
  hermes_diagnosis_completed: 'operationCases.event.hermesDiagnosis',
  hermes_remediation_reviewed: 'operationCases.event.hermesRemediation',
  hermes_retrospective_completed: 'operationCases.event.hermesReview',
  hermes_session_completed: 'operationCases.event.hermesSession',
  hermes_session_failed: 'operationCases.event.hermesFailed',
  hermes_downstream_refs_detected: 'operationCases.event.hermesRefsDetected',
  evolution_proposal_created: 'operationCases.event.proposalCreated',
  evolution_proposal_status_changed: 'operationCases.event.proposalStatus',
};

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

function shortId(value?: string | null) {
  if (!value) return '-';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatDate(value?: string | null, locale = 'zh-CN') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US');
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractPayloadRef(event: OperationCaseEvent, type: 'approval' | 'task' | 'proposal'): string | null {
  const directKeys = type === 'approval'
    ? ['approvalId', 'approval_id', 'id']
    : type === 'task'
      ? ['taskId', 'task_id', 'id']
      : ['proposalId', 'proposal_id', 'id'];
  const direct = extractDirectPayloadId(event, directKeys);
  if (direct) return direct;

  const extractedRefs = event.payload?.extractedRefs;
  if (extractedRefs && typeof extractedRefs === 'object' && !Array.isArray(extractedRefs)) {
    const key = type === 'approval' ? 'approvalIds' : type === 'task' ? 'taskIds' : 'proposalIds';
    const ref = readFirstString((extractedRefs as Record<string, unknown>)[key]);
    if (ref) return ref;
  }

  if (event.event_type.includes(type) || (type === 'task' && event.event_type.includes('workflow'))) {
    return readString(event.source_id);
  }
  return null;
}

function extractDirectPayloadId(event: OperationCaseEvent, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(event.payload?.[key]);
    if (value) return value;
  }
  return null;
}

function readFirstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const text = readString(item);
    if (text) return text;
  }
  return null;
}

function statusTone(status: CaseStatus) {
  switch (status) {
    case 'closed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
    case 'cancelled':
      return 'border-slate-500/30 bg-slate-500/10 text-slate-400';
    case 'approval_pending':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    case 'executing':
    case 'verifying':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-500';
    case 'evolving':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-500';
    default:
      return 'border-primary/30 bg-primary/10 text-primary';
  }
}

function eventIcon(eventType: string) {
  if (eventType.includes('approval')) return ShieldAlert;
  if (eventType.includes('task') || eventType.includes('workflow')) return GitBranch;
  if (eventType.includes('verification')) return CheckCircle2;
  if (eventType.includes('hermes')) return Bot;
  if (eventType.includes('evolution')) return Lightbulb;
  if (eventType.includes('failed')) return AlertTriangle;
  return History;
}

function readRecordString(record: Record<string, unknown>, key: string): string | null {
  return readString(record[key]);
}

function buildHermesPath(operationCase: OperationCase, mode: 'diagnose' | 'remediate' | 'review') {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('caseId', operationCase.id);
  if (operationCase.correlation_id) params.set('correlationId', operationCase.correlation_id);
  return `/hermes?${params.toString()}`;
}

function buildExecutionPath(operationCase: OperationCase) {
  const params = new URLSearchParams();
  params.set('caseId', operationCase.id);
  if (operationCase.correlation_id) params.set('correlationId', operationCase.correlation_id);
  if (operationCase.asset_id) params.set('assetId', operationCase.asset_id);
  if (operationCase.asset_type) params.set('assetType', operationCase.asset_type);
  if (operationCase.asset_name) params.set('assetName', operationCase.asset_name);
  if (operationCase.server_ids.length > 0) params.set('serverIds', operationCase.server_ids.join(','));
  return params.toString() ? `/execution-center?${params.toString()}` : '/execution-center';
}

function buildNextAction(
  operationCase: OperationCase,
  trace: CorrelationTrace | undefined,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): CaseNextAction {
  const approvals = toArray<Record<string, unknown>>(trace?.approvals);
  const tasks = toArray<Record<string, unknown>>(trace?.tasks);
  const proposals = toArray<Record<string, unknown>>(trace?.proposals);
  const pendingApproval = approvals.find((item) => readRecordString(item, 'status') === 'pending');
  if (pendingApproval) {
    const id = readRecordString(pendingApproval, 'id') || '';
    return {
      icon: ShieldAlert,
      title: t('operationCases.next.pendingApproval.title'),
      description: t('operationCases.next.pendingApproval.description'),
      cta: t('operationCases.next.pendingApproval.action'),
      path: `/tool-approvals?approvalId=${encodeURIComponent(id)}`,
      tone: 'warning',
    };
  }

  const failedTask = tasks.find((item) => readRecordString(item, 'status') === 'failed');
  if (failedTask) {
    const id = readRecordString(failedTask, 'id') || '';
    return {
      icon: AlertTriangle,
      title: t('operationCases.next.failedTask.title'),
      description: t('operationCases.next.failedTask.description'),
      cta: t('operationCases.next.failedTask.action'),
      path: `/tasks?taskId=${encodeURIComponent(id)}`,
      tone: 'danger',
    };
  }

  const activeTask = tasks.find((item) => ['pending', 'running', 'paused'].includes(readRecordString(item, 'status') || ''));
  if (activeTask) {
    const id = readRecordString(activeTask, 'id') || '';
    return {
      icon: GitBranch,
      title: t('operationCases.next.activeTask.title'),
      description: t('operationCases.next.activeTask.description'),
      cta: t('operationCases.next.activeTask.action'),
      path: `/tasks?taskId=${encodeURIComponent(id)}`,
      tone: 'primary',
    };
  }

  const pendingProposal = proposals.find((item) => ['draft', 'pending', 'reviewing', 'staged'].includes(readRecordString(item, 'status') || ''));
  if (pendingProposal) {
    const id = readRecordString(pendingProposal, 'id') || '';
    return {
      icon: Lightbulb,
      title: t('operationCases.next.proposal.title'),
      description: t('operationCases.next.proposal.description'),
      cta: t('operationCases.next.proposal.action'),
      path: `/evolution-proposals?proposalId=${encodeURIComponent(id)}`,
      tone: 'primary',
    };
  }

  if (operationCase.status === 'closed') {
    return {
      icon: CheckCircle2,
      title: t('operationCases.next.closed.title'),
      description: t('operationCases.next.closed.description'),
      cta: t('operationCases.action.openTrace'),
      path: operationCase.correlation_id
        ? `/hermes-dashboard?correlationId=${encodeURIComponent(operationCase.correlation_id)}`
        : '/hermes-dashboard',
      tone: 'success',
    };
  }

  if (operationCase.status === 'diagnosing' || operationCase.status === 'diagnosis_ready') {
    return {
      icon: Bot,
      title: t('operationCases.next.diagnose.title'),
      description: t('operationCases.next.diagnose.description'),
      cta: t('operationCases.next.diagnose.action'),
      path: buildHermesPath(operationCase, 'diagnose'),
      tone: 'primary',
    };
  }

  if (operationCase.status === 'approval_pending' || operationCase.status === 'executing' || operationCase.status === 'verifying') {
    return {
      icon: Bot,
      title: t('operationCases.next.remediate.title'),
      description: t('operationCases.next.remediate.description'),
      cta: t('operationCases.next.remediate.action'),
      path: buildHermesPath(operationCase, 'remediate'),
      tone: 'warning',
    };
  }

  return {
    icon: Bot,
    title: t('operationCases.next.review.title'),
    description: t('operationCases.next.review.description'),
    cta: t('operationCases.next.review.action'),
    path: buildHermesPath(operationCase, 'review'),
    tone: 'primary',
  };
}

export default function OperationCases() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<string>(searchParams.get('status') || '');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(searchParams.get('caseId'));

  const { data: caseList, isLoading, refetch } = useQuery({
    queryKey: ['operation-cases', status],
    queryFn: async () => {
      const res = await api.get('/api/operation-cases', {
        params: {
          limit: 80,
          ...(status ? { status } : {})
        }
      });
      return res.data.data as OperationCaseListResponse;
    },
    staleTime: 15000,
  });

  const cases = caseList?.cases || [];

  useEffect(() => {
    if (!selectedCaseId && cases.length > 0) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (status) next.set('status', status);
    if (selectedCaseId) next.set('caseId', selectedCaseId);
    setSearchParams(next, { replace: true });
  }, [selectedCaseId, setSearchParams, status]);

  const { data: detail, isFetching: detailFetching, refetch: refetchDetail } = useQuery({
    queryKey: ['operation-case-detail', selectedCaseId],
    enabled: Boolean(selectedCaseId),
    queryFn: async () => {
      const res = await api.get(`/api/operation-cases/${encodeURIComponent(selectedCaseId!)}`);
      return res.data.data as OperationCaseDetailResponse;
    },
    refetchInterval: 20000,
  });

  const selectedCase = detail?.case || cases.find((item) => item.id === selectedCaseId) || null;
  const events = detail?.events || [];
  const trace = detail?.trace;
  const browserLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';

  const metrics = useMemo(() => {
    return [
      { label: t('operationCases.metric.sessions'), value: trace?.hermesSessions?.length || 0, icon: Bot },
      { label: t('operationCases.metric.approvals'), value: trace?.approvals?.length || 0, icon: ShieldAlert },
      { label: t('operationCases.metric.tasks'), value: trace?.tasks?.length || 0, icon: GitBranch },
      { label: t('operationCases.metric.proposals'), value: trace?.proposals?.length || 0, icon: Lightbulb },
      { label: t('operationCases.metric.evidence'), value: trace?.executionEvidence?.length || 0, icon: FileText },
      { label: t('operationCases.metric.audit'), value: trace?.auditLogs?.length || 0, icon: ClipboardList },
    ];
  }, [t, trace]);

  const currentStatusIndex = selectedCase ? statusOrder.indexOf(selectedCase.status) : -1;
  const nextAction = selectedCase ? buildNextAction(selectedCase, trace, t) : null;
  const closureSteps = [
    { labelKey: 'operationCases.flow.resource', helperKey: 'operationCases.flow.resourceHelper', path: '/assets-center', icon: TerminalSquare },
    { labelKey: 'operationCases.flow.diagnosis', helperKey: 'operationCases.flow.diagnosisHelper', path: '/diagnosis-center', icon: AlertTriangle },
    { labelKey: 'operationCases.flow.case', helperKey: 'operationCases.flow.caseHelper', path: '/operation-cases', icon: ClipboardList },
    { labelKey: 'operationCases.flow.execution', helperKey: 'operationCases.flow.executionHelper', path: selectedCase ? buildExecutionPath(selectedCase) : '/execution-center', icon: ShieldAlert },
  ];

  const openHermes = () => {
    if (!selectedCase) return;
    navigate(buildHermesPath(selectedCase, selectedCase.status === 'evolving' ? 'review' : 'diagnose'));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span>{t('operationCases.eyebrow')}</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">{t('operationCases.title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('operationCases.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              refetch();
              refetchDetail();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            <RefreshCw className={clsx('w-4 h-4', (isLoading || detailFetching) && 'animate-spin')} />
            {t('common.refresh')}
          </button>
          <button
            onClick={() => navigate('/diagnosis-center')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <AlertTriangle className="w-4 h-4" />
            {t('operationCases.action.newDiagnosis')}
          </button>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{t('operationCases.flow.title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('operationCases.flow.subtitle')}</p>
          </div>
          <button
            onClick={() => navigate('/diagnosis-center')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            <AlertTriangle className="w-4 h-4" />
            {t('operationCases.action.newDiagnosis')}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          {closureSteps.map((step, index) => (
            <button
              key={step.labelKey}
              onClick={() => navigate(step.path)}
              className="text-left rounded-lg border border-border bg-background/40 p-3 hover:border-primary/60 hover:bg-primary/5 transition-colors min-h-[118px]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <step.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-text-tertiary">{index + 1}</span>
              </div>
              <p className="mt-3 text-sm font-semibold text-text-primary">{t(step.labelKey as MessageKey)}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{t(step.helperKey as MessageKey)}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <FilterButton active={!status} onClick={() => setStatus('')}>{t('common.all')}</FilterButton>
        {statusOrder.concat('cancelled').map((item) => (
          <FilterButton key={item} active={status === item} onClick={() => setStatus(item)}>
            {t(statusLabelKeys[item])}
          </FilterButton>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5">
        <section className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">{t('operationCases.list.title')}</h2>
              <p className="text-xs text-text-secondary">{t('operationCases.list.count', { count: caseList?.total || 0 })}</p>
            </div>
            <Clock className="w-4 h-4 text-text-tertiary" />
          </div>
          <div className="divide-y divide-border max-h-[calc(100vh-280px)] overflow-y-auto">
            {cases.length === 0 && (
              <div className="p-6 text-sm text-text-secondary">{t('operationCases.empty')}</div>
            )}
            {cases.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedCaseId(item.id)}
                className={clsx(
                  'w-full text-left p-4 hover:bg-surface-hover transition-colors',
                  selectedCaseId === item.id && 'bg-primary/5'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary truncate">{item.title || item.id}</h3>
                    <p className="mt-1 text-xs text-text-secondary truncate">
                      {item.asset_name || item.asset_id || item.source || t('operationCases.list.manual')}
                    </p>
                  </div>
                  <span className={clsx('shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold', statusTone(item.status))}>
                    {t(statusLabelKeys[item.status])}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-text-tertiary">
                  <span>{shortId(item.correlation_id)}</span>
                  <span>{formatDate(item.updated_at || item.created_at, browserLocale)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface min-h-[620px]">
          {!selectedCase && (
            <div className="h-full min-h-[520px] flex items-center justify-center text-sm text-text-secondary">
              {t('operationCases.detail.empty')}
            </div>
          )}
          {selectedCase && (
            <div className="p-5 space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('rounded-md border px-2 py-1 text-xs font-semibold', statusTone(selectedCase.status))}>
                      {t(statusLabelKeys[selectedCase.status])}
                    </span>
                    {selectedCase.severity && (
                      <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-text-secondary">
                        {selectedCase.severity}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-text-primary break-words">{selectedCase.title || selectedCase.id}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('operationCases.detail.updatedAt', { time: formatDate(selectedCase.updated_at || selectedCase.created_at, browserLocale) })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={openHermes}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                  >
                    <Bot className="w-4 h-4" />
                    {t('operationCases.action.openHermes')}
                  </button>
                  <button
                    onClick={() => navigate(buildExecutionPath(selectedCase))}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {t('operationCases.action.openExecution')}
                  </button>
                  {selectedCase.correlation_id && (
                    <button
                      onClick={() => navigate(`/hermes-dashboard?correlationId=${encodeURIComponent(selectedCase.correlation_id!)}`)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t('operationCases.action.openTrace')}
                    </button>
                  )}
                </div>
              </div>

              {nextAction && (
                <NextActionPanel action={nextAction} onNavigate={(path) => navigate(path)} title={t('operationCases.next.title')} helper={t('operationCases.next.helper')} />
              )}

              <section className="rounded-lg border border-border bg-background/35 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{t('operationCases.snapshot.title')}</h3>
                    <p className="mt-1 text-xs text-text-secondary">{t('operationCases.snapshot.subtitle')}</p>
                  </div>
                  <span className="text-xs text-text-secondary">{t('operationCases.stage.auto')}</span>
                </div>

                <div className="mt-4 grid grid-cols-1 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{t('operationCases.stage.title')}</h4>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {statusOrder.map((item, index) => {
                        const done = selectedCase.status === 'closed' || (currentStatusIndex >= 0 && index <= currentStatusIndex);
                        const active = selectedCase.status === item;
                        return (
                          <div
                            key={item}
                            className={clsx(
                              'rounded-lg border px-2 py-3 text-center min-h-[72px]',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : done
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                  : 'border-border bg-surface text-text-tertiary'
                            )}
                          >
                            <CheckCircle2 className="w-4 h-4 mx-auto mb-2" />
                            <div className="text-[11px] font-semibold leading-tight">{t(statusLabelKeys[item])}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{t('operationCases.snapshot.facts')}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-1 gap-3">
                      <Fact label={t('operationCases.field.correlation')} value={selectedCase.correlation_id || '-'} />
                      <Fact label={t('operationCases.field.asset')} value={selectedCase.asset_name || selectedCase.asset_id || '-'} />
                      <Fact label={t('operationCases.field.alert')} value={selectedCase.alert_id || '-'} />
                      <Fact label={t('operationCases.field.source')} value={selectedCase.source || '-'} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{t('operationCases.snapshot.evidence')}</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="rounded-lg border border-border bg-surface p-3">
                        <metric.icon className="w-4 h-4 text-primary" />
                        <p className="mt-2 text-xl font-semibold text-text-primary">{metric.value}</p>
                        <p className="text-xs text-text-secondary">{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
                <div className="rounded-lg border border-border bg-background/35">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">{t('operationCases.timeline.title')}</h3>
                    <span className="text-xs text-text-secondary">{t('operationCases.timeline.count', { count: events.length })}</span>
                  </div>
                  <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                    {events.length === 0 && (
                      <p className="text-sm text-text-secondary">{t('operationCases.timeline.empty')}</p>
                    )}
                    {events.map((event) => (
                      <TimelineEvent
                        key={event.id}
                        event={event}
                        locale={browserLocale}
                        label={t(eventLabelKeys[event.event_type] || 'operationCases.event.unknown')}
                        onNavigate={(path) => navigate(path)}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <LinkedRecords
                    title={t('operationCases.linked.approvals')}
                    records={toArray<Record<string, unknown>>(trace?.approvals)}
                    empty={t('operationCases.linked.emptyApprovals')}
                    render={(record) => (
                      <LinkedButton
                        title={String(record.tool_name || record.id || '-')}
                        subtitle={String(record.status || '-')}
                        onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(String(record.id))}`)}
                      />
                    )}
                  />
                  <LinkedRecords
                    title={t('operationCases.linked.tasks')}
                    records={toArray<Record<string, unknown>>(trace?.tasks)}
                    empty={t('operationCases.linked.emptyTasks')}
                    render={(record) => (
                      <LinkedButton
                        title={String(record.name || record.id || '-')}
                        subtitle={String(record.status || '-')}
                        onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(String(record.id))}`)}
                      />
                    )}
                  />
                  <LinkedRecords
                    title={t('operationCases.linked.proposals')}
                    records={toArray<Record<string, unknown>>(trace?.proposals)}
                    empty={t('operationCases.linked.emptyProposals')}
                    render={(record) => (
                      <LinkedButton
                        title={String(record.title || record.id || '-')}
                        subtitle={String(record.status || '-')}
                        onClick={() => navigate(`/evolution-proposals?proposalId=${encodeURIComponent(String(record.id))}`)}
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NextActionPanel({
  action,
  title,
  helper,
  onNavigate,
}: {
  action: CaseNextAction;
  title: string;
  helper: string;
  onNavigate: (path: string) => void;
}) {
  const Icon = action.icon;
  return (
    <div className={clsx(
      'rounded-lg border p-4',
      action.tone === 'warning' && 'border-amber-500/30 bg-amber-500/10',
      action.tone === 'danger' && 'border-red-500/30 bg-red-500/10',
      action.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10',
      action.tone === 'primary' && 'border-primary/25 bg-primary/5'
    )}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{title}</p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">{action.title}</h3>
            <p className="mt-1 text-sm text-text-secondary">{action.description}</p>
            <p className="mt-2 text-xs text-text-tertiary">{helper}</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate(action.path)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 whitespace-nowrap"
        >
          {action.cta}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      {children}
    </button>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-3 min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary truncate" title={value}>{value}</p>
    </div>
  );
}

function TimelineEvent({
  event,
  label,
  locale,
  onNavigate,
}: {
  event: OperationCaseEvent;
  label: string;
  locale: string;
  onNavigate: (path: string) => void;
}) {
  const Icon = eventIcon(event.event_type);
  const approvalId = extractPayloadRef(event, 'approval');
  const taskId = extractPayloadRef(event, 'task');
  const proposalId = event.event_type.includes('evolution') ? extractPayloadRef(event, 'proposal') : null;
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-text-primary">{label}</h4>
          <span className="text-xs text-text-tertiary">{formatDate(event.created_at, locale)}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-secondary">
          {event.source_type && <span>{event.source_type}</span>}
          {event.source_id && <span>{shortId(event.source_id)}</span>}
          {event.correlation_id && <span>corr {shortId(event.correlation_id)}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {approvalId && (
            <JumpButton onClick={() => onNavigate(`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`)} label={`approval ${shortId(approvalId)}`} />
          )}
          {taskId && (
            <JumpButton onClick={() => onNavigate(`/tasks?taskId=${encodeURIComponent(taskId)}`)} label={`task ${shortId(taskId)}`} />
          )}
          {proposalId && (
            <JumpButton onClick={() => onNavigate(`/evolution-proposals?proposalId=${encodeURIComponent(proposalId)}`)} label={`proposal ${shortId(proposalId)}`} />
          )}
        </div>
      </div>
    </div>
  );
}

function JumpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover"
    >
      {label}
      <ArrowRight className="w-3 h-3" />
    </button>
  );
}

function LinkedRecords({
  title,
  records,
  empty,
  render,
}: {
  title: string;
  records: Array<Record<string, unknown>>;
  empty: string;
  render: (record: Record<string, unknown>) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/35">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="p-3 space-y-2">
        {records.length === 0 && <p className="text-sm text-text-secondary">{empty}</p>}
        {records.slice(0, 6).map((record, index) => (
          <div key={String(record.id || index)}>{render(record)}</div>
        ))}
      </div>
    </div>
  );
}

function LinkedButton({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-hover"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{title}</p>
          <p className="truncate text-xs text-text-secondary">{subtitle}</p>
        </div>
        <TerminalSquare className="w-4 h-4 shrink-0 text-text-tertiary" />
      </div>
    </button>
  );
}
