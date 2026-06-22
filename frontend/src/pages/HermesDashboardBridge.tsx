import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, GitBranch, KanbanSquare, Loader2, RefreshCw, ShieldCheck, X, XCircle, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

interface HermesWorkerStatus {
  role: 'diagnose' | 'remediate' | 'evolve' | string;
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
  lastRun?: HermesWorkerRun | null;
}

interface HermesWorkerRun {
  id: string;
  worker_role: string | null;
  worker_url: string | null;
  agent_id: string | null;
  channel_id: string | null;
  correlation_id: string | null;
  status: string;
  latency_ms: number | null;
  fallback_used: number;
  error: string | null;
  created_at: string;
}

interface HermesSessionRefs {
  approvalIds: string[];
  taskIds: string[];
  correlationIds: string[];
}

interface HermesIntentSummary {
  entities: string[];
  action: string;
  timeWindow: string | null;
  environment: string | null;
  assetRefs: string[];
  expectedOutput: string;
}

interface HermesEvidenceSummary {
  toolsUsed: string[];
  skillsUsed: string[];
  mcpServersUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  missingEvidence: string[];
  suggestedNextAction: string;
}

interface HermesSession {
  id: string;
  agent_execution_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  mode: string | null;
  input: string;
  output: string | null;
  extracted_refs: HermesSessionRefs;
  intent_summary?: HermesIntentSummary;
  evidence_summary?: HermesEvidenceSummary;
  correlation_id: string | null;
  status: string;
  created_at: string;
}

interface CorrelationTrace {
  correlationId: string;
  hermesSessions: Array<Record<string, unknown>>;
  agentExecutions: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  teamRuns: Array<Record<string, unknown>>;
  workerRuns: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
  externalLinks: Array<Record<string, unknown>>;
  boardFeedback: Array<Record<string, unknown>>;
  executionEvidence: Array<Record<string, unknown>>;
  executionEvidenceSummary?: Record<string, unknown>;
}

type BoardFeedbackCategory = 'useful' | 'wrong_root_cause' | 'missing_evidence' | 'unsafe_action' | 'needs_workflow';

interface BoardFeedbackResult {
  generated_proposal_id?: string | null;
  proposal?: {
    id: string;
    title: string;
  } | null;
}

type BoardSelection =
  | { type: 'run'; item: HermesWorkerRun }
  | { type: 'session'; item: HermesSession };

const laneMeta = [
  {
    role: 'diagnose',
    icon: Bot,
    titleKey: 'hermesDashboard.lane.diagnose' as MessageKey,
    descKey: 'hermesDashboard.lane.diagnoseDesc' as MessageKey,
    tone: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20'
  },
  {
    role: 'remediate',
    icon: ShieldCheck,
    titleKey: 'hermesDashboard.lane.remediate' as MessageKey,
    descKey: 'hermesDashboard.lane.remediateDesc' as MessageKey,
    tone: 'text-amber-500 bg-amber-500/10 border-amber-500/20'
  },
  {
    role: 'evolve',
    icon: GitBranch,
    titleKey: 'hermesDashboard.lane.evolve' as MessageKey,
    descKey: 'hermesDashboard.lane.evolveDesc' as MessageKey,
    tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
  }
] as const;

export default function HermesDashboardBridge() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<BoardSelection | null>(null);

  const { data: workers = [], isFetching: workersFetching } = useQuery({
    queryKey: ['hermes-workers'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-workers');
      return res.data.data as HermesWorkerStatus[];
    },
    refetchInterval: 30000
  });

  const { data: runs = [], isFetching: runsFetching } = useQuery({
    queryKey: ['hermes-worker-runs'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-workers/runs?limit=80');
      return res.data.data as HermesWorkerRun[];
    },
    refetchInterval: 30000
  });

  const { data: sessionResult, isFetching: sessionsFetching } = useQuery({
    queryKey: ['hermes-sessions', 'board'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-sessions?limit=30');
      return res.data.data as { sessions: HermesSession[]; total: number };
    },
    refetchInterval: 30000
  });

  const sessions = sessionResult?.sessions || [];
  const workerByRole = useMemo(() => new Map(workers.map((worker) => [worker.role, worker])), [workers]);
  const runsByRole = useMemo(() => {
    const grouped = new Map<string, HermesWorkerRun[]>();
    runs.forEach((run) => {
      const role = run.worker_role || 'unknown';
      grouped.set(role, [...(grouped.get(role) || []), run]);
    });
    return grouped;
  }, [runs]);

  const healthyWorkers = workers.filter((worker) => worker.healthy).length;
  const runningSignals = runs.filter((run) => run.status === 'success' && minutesAgo(run.created_at) <= 60).length;
  const failedSignals = runs.filter((run) => run.status === 'failed').length;
  const isFetching = workersFetching || runsFetching || sessionsFetching;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['hermes-workers'] });
    queryClient.invalidateQueries({ queryKey: ['hermes-worker-runs'] });
    queryClient.invalidateQueries({ queryKey: ['hermes-sessions', 'board'] });
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KanbanSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('hermesDashboard.title')}</h1>
              <p className="text-text-secondary mt-1">{t('hermesDashboard.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('common.refresh')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <MetricCard icon={Activity} label={t('hermesDashboard.metric.workers')} value={`${healthyWorkers}/${workers.length || 3}`} tone="text-emerald-500 bg-emerald-500/10" />
          <MetricCard icon={CheckCircle2} label={t('hermesDashboard.metric.successHour')} value={String(runningSignals)} tone="text-cyan-500 bg-cyan-500/10" />
          <MetricCard icon={AlertTriangle} label={t('hermesDashboard.metric.failures')} value={String(failedSignals)} tone="text-amber-500 bg-amber-500/10" />
          <MetricCard icon={Clock} label={t('hermesDashboard.metric.sessions')} value={String(sessionResult?.total ?? sessions.length)} tone="text-violet-500 bg-violet-500/10" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {laneMeta.map((lane) => {
            const worker = workerByRole.get(lane.role);
            const laneRuns = runsByRole.get(lane.role) || [];
            const Icon = lane.icon;
            return (
              <section key={lane.role} className="bg-surface border border-border rounded-lg min-h-[520px] flex flex-col">
                <div className="p-4 border-b border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={clsx('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', lane.tone)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-text-primary truncate">{t(lane.titleKey)}</h2>
                        <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{t(lane.descKey)}</p>
                      </div>
                    </div>
                    <WorkerHealthBadge worker={worker} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                    <MiniStat label={t('hermesDashboard.worker.runs24h')} value={String(worker?.runStats?.totalRuns || 0)} />
                    <MiniStat label={t('hermesDashboard.worker.avgLatency')} value={worker?.runStats?.avgLatencyMs ? `${worker.runStats.avgLatencyMs}ms` : '-'} />
                    <MiniStat label={t('hermesDashboard.worker.fallbacks')} value={String(worker?.runStats?.fallbackRuns || 0)} />
                  </div>
                </div>

                <div className="p-4 space-y-3 flex-1 overflow-hidden">
                  {laneRuns.slice(0, 8).map((run) => (
                    <RunCard key={run.id} run={run} onOpen={() => setSelection({ type: 'run', item: run })} />
                  ))}
                  {laneRuns.length === 0 && (
                    <div className="h-52 rounded-lg border border-dashed border-border bg-background/50 flex flex-col items-center justify-center text-center px-6">
                      <KanbanSquare className="w-8 h-8 text-text-tertiary mb-3" />
                      <p className="text-sm text-text-secondary">{t('hermesDashboard.board.emptyLane')}</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('hermesDashboard.sessions.title')}</h2>
              <p className="text-sm text-text-tertiary mt-1">{t('hermesDashboard.sessions.desc')}</p>
            </div>
            {sessionsFetching && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sessions.slice(0, 8).map((session) => (
              <SessionCard key={session.id} session={session} onOpen={() => setSelection({ type: 'session', item: session })} />
            ))}
            {sessions.length === 0 && (
              <div className="lg:col-span-2 py-12 text-center text-sm text-text-secondary">
                {t('hermesDashboard.sessions.empty')}
              </div>
            )}
          </div>
        </section>
      </div>
      {selection && (
        <BoardDetailDrawer selection={selection} onClose={() => setSelection(null)} />
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', tone)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xl font-semibold text-text-primary text-right">{value}</span>
      </div>
      <p className="text-sm text-text-secondary mt-3">{label}</p>
    </div>
  );
}

function WorkerHealthBadge({ worker }: { worker?: HermesWorkerStatus }) {
  const healthy = Boolean(worker?.healthy);
  const Icon = healthy ? CheckCircle2 : worker?.configured ? XCircle : Clock;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap',
      healthy && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
      !healthy && worker?.configured && 'border-red-500/30 bg-red-500/10 text-red-500',
      !worker?.configured && 'border-border bg-background text-text-tertiary'
    )}>
      <Icon className="w-3.5 h-3.5" />
      {worker?.status || 'unknown'}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <p className="text-text-tertiary truncate">{label}</p>
      <p className="text-text-primary font-semibold mt-1 truncate">{value}</p>
    </div>
  );
}

function RunCard({ run, onOpen }: { run: HermesWorkerRun; onOpen: () => void }) {
  const { t } = useLocale();
  const failed = run.status === 'failed';
  const success = run.status === 'success';
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="rounded-lg border border-border bg-background/70 p-3 text-left cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{run.correlation_id || run.channel_id || run.id}</p>
          <p className="text-xs text-text-tertiary mt-1">{formatTime(run.created_at)}</p>
        </div>
        <span className={clsx(
          'text-[11px] px-2 py-1 rounded-md border whitespace-nowrap',
          success && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
          failed && 'border-red-500/25 bg-red-500/10 text-red-500',
          !success && !failed && 'border-border bg-surface text-text-secondary'
        )}>
          {run.status}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-secondary">
        <Chip value={run.latency_ms ? `${run.latency_ms}ms` : '-'} />
        {run.fallback_used === 1 && <Chip value="fallback" warning />}
        {run.agent_id && <Chip value={`agent:${shortId(run.agent_id)}`} />}
        {run.correlation_id && (
          <Chip value={`corr:${shortId(run.correlation_id)}`} />
        )}
        <Chip value={t('hermesDashboard.detail.open')} />
      </div>
      {run.error && <p className="text-xs text-red-500 mt-3 line-clamp-2">{run.error}</p>}
    </article>
  );
}

function SessionCard({ session, onOpen }: { session: HermesSession; onOpen: () => void }) {
  const { t } = useLocale();
  const correlationId = session.correlation_id || session.extracted_refs.correlationIds[0];
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="rounded-lg border border-border bg-background/70 p-4 text-left cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{session.agent_name || session.mode || session.id}</p>
          <p className="text-xs text-text-tertiary mt-1">{formatTime(session.created_at)}</p>
        </div>
        <span className="text-[11px] px-2 py-1 rounded-md border border-border bg-surface text-text-secondary whitespace-nowrap">
          {session.status}
        </span>
      </div>
      <p className="text-xs text-text-secondary mt-3 line-clamp-2">{session.input}</p>
      {(session.extracted_refs.approvalIds.length > 0 || session.extracted_refs.taskIds.length > 0 || correlationId) && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] items-center">
          {session.extracted_refs.approvalIds.slice(0, 3).map((approvalId) => (
            <EvidenceLink
              key={`approval-${approvalId}`}
              to={`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`}
              value={`approval:${shortId(approvalId)}`}
            />
          ))}
          {session.extracted_refs.taskIds.slice(0, 3).map((taskId) => (
            <EvidenceLink
              key={`task-${taskId}`}
              to={`/tasks?taskId=${encodeURIComponent(taskId)}`}
              value={`task:${shortId(taskId)}`}
            />
          ))}
          {correlationId && <Chip value={`corr:${shortId(correlationId)}`} />}
          <Chip value={t('hermesDashboard.detail.open')} />
        </div>
      )}
    </article>
  );
}

function Chip({ value, warning = false }: { value: string; warning?: boolean }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-md border px-2 py-1',
      warning ? 'border-amber-500/25 bg-amber-500/10 text-amber-500' : 'border-border bg-surface text-text-secondary'
    )}>
      {value}
    </span>
  );
}

function EvidenceLink({ to, value }: { to: string; value: string }) {
  return (
    <Link
      to={to}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-primary hover:bg-primary/15 transition-colors"
    >
      {value}
    </Link>
  );
}

function BoardDetailDrawer({ selection, onClose }: { selection: BoardSelection; onClose: () => void }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isRun = selection.type === 'run';
  const run = isRun ? selection.item : null;
  const session = !isRun ? selection.item : null;
  const correlationId = session
    ? session.correlation_id || session.extracted_refs.correlationIds[0]
    : run?.correlation_id || null;
  const title = isRun ? t('hermesDashboard.detail.runTitle') : t('hermesDashboard.detail.sessionTitle');
  const { data: correlationTrace, isFetching: traceFetching, isError: traceError } = useQuery({
    queryKey: ['hermes-correlation-trace', correlationId],
    queryFn: async () => {
      const res = await api.get(`/api/correlations/${encodeURIComponent(correlationId as string)}`);
      return res.data.data as CorrelationTrace;
    },
    enabled: Boolean(correlationId),
    staleTime: 30000
  });
  const feedbackMutation = useMutation({
    mutationFn: async (category: BoardFeedbackCategory) => {
      const sourceType = isRun ? 'worker_run' : 'hermes_session';
      const sourceId = isRun ? run?.id : session?.id;
      if (!sourceId) {
        throw new Error(t('hermesDashboard.feedback.missingSource'));
      }
      const res = await api.post('/api/hermes-dashboard/feedback', {
        sourceType,
        sourceId,
        category,
        correlationId,
        evidenceRefs: {
          selectionType: selection.type,
          run,
          session: session ? {
            id: session.id,
            agentName: session.agent_name,
            mode: session.mode,
            status: session.status,
            intentSummary: session.intent_summary || null,
            evidenceSummary: session.evidence_summary || null,
            extractedRefs: session.extracted_refs
          } : null,
          traceSummary: correlationTrace?.executionEvidenceSummary || null
        }
      });
      return res.data.data as BoardFeedbackResult;
    },
    onSuccess: (feedback, category) => {
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
      if (feedback.proposal?.id || feedback.generated_proposal_id) {
        toast.success(t('hermesDashboard.feedback.proposalCreated'));
      } else if (category === 'useful') {
        toast.success(t('hermesDashboard.feedback.usefulSaved'));
      } else {
        toast.success(t('hermesDashboard.feedback.saved'));
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('hermesDashboard.feedback.failed'));
    }
  });
  const canSubmitFeedback = user?.role === 'admin' || user?.role === 'operator';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onClick={onClose}>
      <aside
        className="h-full w-full max-w-2xl overflow-auto border-l border-border bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <p className="mt-1 text-xs text-text-tertiary break-all">{isRun ? run?.id : session?.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-text-secondary hover:text-text-primary transition-colors"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {isRun && run && (
            <>
              <DetailGrid
                items={[
                  [t('hermesDashboard.detail.type'), 'worker_run'],
                  [t('common.status'), run.status],
                  [t('hermesDashboard.detail.workerRole'), run.worker_role || '-'],
                  [t('hermesDashboard.detail.channel'), run.channel_id || '-'],
                  [t('hermesDashboard.detail.latency'), run.latency_ms ? `${run.latency_ms}ms` : '-'],
                  [t('hermesDashboard.worker.fallbacks'), run.fallback_used === 1 ? t('common.yes') : t('common.no')],
                  [t('hermesDashboard.detail.createdAt'), formatTime(run.created_at)],
                  [t('hermesDashboard.detail.correlation'), correlationId || '-']
                ]}
              />
              {run.error && (
                <DetailSection title={t('hermesDashboard.detail.error')}>
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">{run.error}</pre>
                </DetailSection>
              )}
            </>
          )}

          {session && (
            <>
              <DetailGrid
                items={[
                  [t('hermesDashboard.detail.type'), 'hermes_session'],
                  [t('common.status'), session.status],
                  [t('hermesDashboard.detail.agent'), session.agent_name || session.agent_id || '-'],
                  [t('hermesDashboard.detail.mode'), session.mode || '-'],
                  [t('hermesDashboard.detail.createdAt'), formatTime(session.created_at)],
                  [t('hermesDashboard.detail.correlation'), correlationId || '-']
                ]}
              />
              <DetailSection title={t('hermesDashboard.detail.input')}>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background/70 p-3 text-sm text-text-secondary">
                  {session.input || '-'}
                </p>
              </DetailSection>
              <DetailSection title={t('hermesDashboard.detail.output')}>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background/70 p-3 text-sm text-text-secondary">
                  {session.output || '-'}
                </p>
              </DetailSection>
              <DetailSection title={t('hermesDashboard.detail.evidenceRefs')}>
                <div className="flex flex-wrap gap-2 text-xs">
                  {session.extracted_refs.approvalIds.map((approvalId) => (
                    <EvidenceLink key={approvalId} to={`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`} value={`approval:${shortId(approvalId)}`} />
                  ))}
                  {session.extracted_refs.taskIds.map((taskId) => (
                    <EvidenceLink key={taskId} to={`/tasks?taskId=${encodeURIComponent(taskId)}`} value={`task:${shortId(taskId)}`} />
                  ))}
                  {correlationId && <Chip value={`corr:${shortId(correlationId)}`} />}
                  {session.extracted_refs.approvalIds.length === 0 && session.extracted_refs.taskIds.length === 0 && !correlationId && (
                    <span className="text-text-tertiary">-</span>
                  )}
                </div>
              </DetailSection>
            </>
          )}

          <CorrelationTraceSection
            correlationId={correlationId}
            trace={correlationTrace}
            isFetching={traceFetching}
            isError={traceError}
          />

          <OperationalContractSection selection={selection} correlationTrace={correlationTrace} />

          {session && (
            <IntentEvidenceSection session={session} />
          )}

          <BoardFeedbackSection
            canSubmit={canSubmitFeedback}
            isSubmitting={feedbackMutation.isPending}
            latestProposalId={feedbackMutation.data?.proposal?.id || feedbackMutation.data?.generated_proposal_id || null}
            onSubmit={(category) => feedbackMutation.mutate(category)}
          />

          <DetailSection title={t('hermesDashboard.detail.nextActions')}>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link to="/tool-approvals" className="rounded-md border border-border bg-background px-3 py-2 text-text-secondary hover:text-primary">
                {t('hermesDashboard.detail.openApprovals')}
              </Link>
              <Link to="/tasks" className="rounded-md border border-border bg-background px-3 py-2 text-text-secondary hover:text-primary">
                {t('hermesDashboard.detail.openTasks')}
              </Link>
              <Link to="/evolution-proposals" className="rounded-md border border-border bg-background px-3 py-2 text-text-secondary hover:text-primary">
                {t('hermesDashboard.detail.openEvolution')}
              </Link>
            </div>
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}

function CorrelationTraceSection({
  correlationId,
  trace,
  isFetching,
  isError
}: {
  correlationId: string | null;
  trace?: CorrelationTrace;
  isFetching: boolean;
  isError: boolean;
}) {
  const { t } = useLocale();

  if (!correlationId) {
    return (
      <DetailSection title={t('hermesDashboard.trace.title')}>
        <div className="rounded-lg border border-border bg-background/70 p-3 text-sm text-text-tertiary">
          {t('hermesDashboard.trace.unavailable')}
        </div>
      </DetailSection>
    );
  }

  if (isFetching && !trace) {
    return (
      <DetailSection title={t('hermesDashboard.trace.title')}>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 p-3 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {t('common.loading')}
        </div>
      </DetailSection>
    );
  }

  if (isError || !trace) {
    return (
      <DetailSection title={t('hermesDashboard.trace.title')}>
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
          {t('hermesDashboard.trace.loadFailed')}
        </div>
      </DetailSection>
    );
  }

  const riskLevels = summaryStringList(trace, 'riskLevels');
  const toolCalls = summaryStringList(trace, 'toolCalls');
  const preflightDecisions = summaryStringList(trace, 'preflightDecisions');
  const preflightReasons = summaryStringList(trace, 'preflightReasons');
  const approvalIds = uniqueStrings([
    ...summaryStringList(trace, 'approvalIds'),
    ...trace.approvals.map((approval) => stringValue(approval.id))
  ]);
  const taskIds = uniqueStrings([
    ...summaryStringList(trace, 'taskIds'),
    ...trace.tasks.map((task) => stringValue(task.id))
  ]);
  const proposalIds = uniqueStrings([
    ...summaryStringList(trace, 'proposalIds'),
    ...trace.proposals.map((proposal) => stringValue(proposal.id)),
    ...trace.boardFeedback.map((feedback) => stringValue(feedback.generated_proposal_id))
  ]);
  const externalCardIds = uniqueStrings([
    ...summaryStringList(trace, 'externalCardIds'),
    ...trace.externalLinks.map((link) => stringValue(link.external_card_id) || stringValue(link.external_run_id))
  ]);
  const latestEvidenceAt = stringValue(trace.executionEvidenceSummary?.latestEvidenceAt);

  return (
    <DetailSection title={t('hermesDashboard.trace.title')}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <TraceMetric label={t('hermesDashboard.trace.workerRuns')} value={trace.workerRuns.length} />
          <TraceMetric label={t('hermesDashboard.trace.sessions')} value={trace.hermesSessions.length} />
          <TraceMetric label={t('hermesDashboard.trace.approvals')} value={trace.approvals.length} />
          <TraceMetric label={t('hermesDashboard.trace.tasks')} value={trace.tasks.length} />
          <TraceMetric label={t('hermesDashboard.trace.agentExecutions')} value={trace.agentExecutions.length} />
          <TraceMetric label={t('hermesDashboard.trace.teamRuns')} value={trace.teamRuns.length} />
          <TraceMetric label={t('hermesDashboard.trace.auditLogs')} value={trace.auditLogs.length} />
          <TraceMetric label={t('hermesDashboard.trace.evidence')} value={trace.executionEvidence.length} />
          <TraceMetric label={t('hermesDashboard.trace.proposals')} value={trace.proposals.length} />
          <TraceMetric label={t('hermesDashboard.trace.externalLinks')} value={trace.externalLinks.length} />
          <TraceMetric label={t('hermesDashboard.trace.boardFeedback')} value={trace.boardFeedback.length} />
        </div>

        {(riskLevels.length > 0 || toolCalls.length > 0 || preflightDecisions.length > 0 || preflightReasons.length > 0 || proposalIds.length > 0 || externalCardIds.length > 0 || latestEvidenceAt) && (
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <div className="space-y-2 text-xs">
              {riskLevels.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.riskLevels')} values={riskLevels} warning />
              )}
              {preflightDecisions.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.preflightDecisions')} values={preflightDecisions} warning={preflightDecisions.some((item) => item !== 'allow')} />
              )}
              {preflightReasons.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.preflightReasons')} values={preflightReasons.slice(0, 6)} warning />
              )}
              {toolCalls.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.toolCalls')} values={toolCalls} />
              )}
              {proposalIds.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.proposalIds')} values={proposalIds.map(shortId)} />
              )}
              {externalCardIds.length > 0 && (
                <TraceChipRow label={t('hermesDashboard.trace.externalCards')} values={externalCardIds.map(shortId)} />
              )}
              {latestEvidenceAt && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-text-tertiary">{t('hermesDashboard.trace.latestEvidence')}</span>
                  <span className="text-text-secondary">{formatTime(latestEvidenceAt)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {(approvalIds.length > 0 || taskIds.length > 0) && (
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <div className="space-y-3 text-xs">
              {approvalIds.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-text-primary">{t('hermesDashboard.trace.linkedApprovals')}</p>
                  <div className="flex flex-wrap gap-2">
                    {approvalIds.slice(0, 8).map((approvalId) => (
                      <EvidenceLink key={approvalId} to={`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`} value={`approval:${shortId(approvalId)}`} />
                    ))}
                  </div>
                </div>
              )}
              {taskIds.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-text-primary">{t('hermesDashboard.trace.linkedTasks')}</p>
                  <div className="flex flex-wrap gap-2">
                    {taskIds.slice(0, 8).map((taskId) => (
                      <EvidenceLink key={taskId} to={`/tasks?taskId=${encodeURIComponent(taskId)}`} value={`task:${shortId(taskId)}`} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {(trace.proposals.length > 0 || trace.externalLinks.length > 0 || trace.boardFeedback.length > 0) && (
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <div className="space-y-3 text-xs">
              {trace.proposals.length > 0 && (
                <TraceRecordList
                  title={t('hermesDashboard.trace.linkedProposals')}
                  records={trace.proposals.slice(0, 5)}
                  render={(proposal) => (
                    <Link
                      to={`/evolution-proposals?proposalId=${encodeURIComponent(stringValue(proposal.id))}`}
                      className="block rounded-md border border-border bg-surface px-3 py-2 hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-text-primary line-clamp-1">{stringValue(proposal.title) || shortId(stringValue(proposal.id))}</span>
                        <span className="shrink-0 text-text-tertiary">{stringValue(proposal.status) || '-'}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-text-tertiary">
                        <span>{stringValue(proposal.priority) || '-'}</span>
                        <span>{stringValue(proposal.source) || '-'}</span>
                        <span>{formatTime(stringValue(proposal.updated_at) || stringValue(proposal.created_at))}</span>
                      </div>
                    </Link>
                  )}
                />
              )}
              {trace.externalLinks.length > 0 && (
                <TraceRecordList
                  title={t('hermesDashboard.trace.externalLinks')}
                  records={trace.externalLinks.slice(0, 5)}
                  render={(link) => (
                    <a
                      href={stringValue(link.external_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-md border border-border bg-surface px-3 py-2 hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-text-primary line-clamp-1">{stringValue(link.title) || stringValue(link.external_card_id) || stringValue(link.external_system)}</span>
                        <span className="shrink-0 text-text-tertiary">{stringValue(link.external_state) || '-'}</span>
                      </div>
                      <p className="mt-1 break-all text-text-tertiary">{stringValue(link.external_url)}</p>
                    </a>
                  )}
                />
              )}
              {trace.boardFeedback.length > 0 && (
                <TraceRecordList
                  title={t('hermesDashboard.trace.boardFeedback')}
                  records={trace.boardFeedback.slice(0, 5)}
                  render={(feedback) => (
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-text-primary">{stringValue(feedback.category) || '-'}</span>
                        <span className="shrink-0 text-text-tertiary">{formatTime(stringValue(feedback.created_at))}</span>
                      </div>
                      {stringValue(feedback.generated_proposal_id) && (
                        <Link
                          to={`/evolution-proposals?proposalId=${encodeURIComponent(stringValue(feedback.generated_proposal_id))}`}
                          className="mt-2 inline-flex rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-primary hover:bg-primary/15"
                        >
                          {t('hermesDashboard.trace.openFeedbackProposal')}
                        </Link>
                      )}
                    </div>
                  )}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

function OperationalContractSection({
  selection,
  correlationTrace
}: {
  selection: BoardSelection;
  correlationTrace?: CorrelationTrace;
}) {
  const { t } = useLocale();
  const isRun = selection.type === 'run';
  const status = isRun ? selection.item.status : selection.item.status;
  const hasApprovals = Boolean(correlationTrace?.approvals.length);
  const hasTasks = Boolean(correlationTrace?.tasks.length);
  const hasFailures = status === 'failed' || status === 'error';
  const contracts = [
    {
      label: t('hermesDashboard.contract.readOnly'),
      value: t('hermesDashboard.contract.readOnlyDesc')
    },
    {
      label: t('hermesDashboard.contract.executionGate'),
      value: hasApprovals || hasTasks
        ? t('hermesDashboard.contract.executionLinked')
        : t('hermesDashboard.contract.executionGated')
    },
    {
      label: t('hermesDashboard.contract.evolutionGate'),
      value: hasFailures
        ? t('hermesDashboard.contract.evolutionRecommended')
        : t('hermesDashboard.contract.evolutionProposalOnly')
    }
  ];

  return (
    <DetailSection title={t('hermesDashboard.contract.title')}>
      <div className="space-y-2">
        {contracts.map((contract) => (
          <div key={contract.label} className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-xs font-semibold text-text-primary">{contract.label}</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{contract.value}</p>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function IntentEvidenceSection({ session }: { session: HermesSession }) {
  const { t } = useLocale();
  const intent = session.intent_summary || buildClientIntentFallback(session);
  const evidence = session.evidence_summary || buildClientEvidenceFallback(session);

  return (
    <DetailSection title={t('hermesDashboard.summary.title')}>
      <div className="space-y-3">
        <DetailGrid
          items={[
            [t('hermesDashboard.summary.action'), intent.action || '-'],
            [t('hermesDashboard.summary.expectedOutput'), intent.expectedOutput || '-'],
            [t('hermesDashboard.summary.environment'), intent.environment || '-'],
            [t('hermesDashboard.summary.confidence'), evidence.confidence || '-'],
            [t('hermesDashboard.summary.suggestedNextAction'), evidence.suggestedNextAction || '-'],
            [t('hermesDashboard.summary.timeWindow'), intent.timeWindow || '-']
          ]}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SummaryChipPanel title={t('hermesDashboard.summary.entities')} values={intent.entities} />
          <SummaryChipPanel title={t('hermesDashboard.summary.assetRefs')} values={intent.assetRefs} />
          <SummaryChipPanel title={t('hermesDashboard.summary.toolsUsed')} values={evidence.toolsUsed} />
          <SummaryChipPanel title={t('hermesDashboard.summary.skillsUsed')} values={evidence.skillsUsed} />
          <SummaryChipPanel title={t('hermesDashboard.summary.mcpServersUsed')} values={evidence.mcpServersUsed} />
          <SummaryChipPanel title={t('hermesDashboard.summary.missingEvidence')} values={evidence.missingEvidence} warning />
        </div>
      </div>
    </DetailSection>
  );
}

function SummaryChipPanel({ title, values, warning = false }: { title: string; values: string[]; warning?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-3">
      <p className="mb-2 text-xs font-semibold text-text-primary">{title}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {values.length > 0
          ? values.slice(0, 8).map((value) => <Chip key={value} value={value} warning={warning} />)
          : <span className="text-text-tertiary">-</span>}
      </div>
    </div>
  );
}

function BoardFeedbackSection({
  canSubmit,
  isSubmitting,
  latestProposalId,
  onSubmit
}: {
  canSubmit: boolean;
  isSubmitting: boolean;
  latestProposalId: string | null;
  onSubmit: (category: BoardFeedbackCategory) => void;
}) {
  const { t } = useLocale();
  const feedbackItems: Array<{ category: BoardFeedbackCategory; label: string; warning?: boolean }> = [
    { category: 'useful', label: t('hermesDashboard.feedback.useful') },
    { category: 'wrong_root_cause', label: t('hermesDashboard.feedback.wrongRootCause'), warning: true },
    { category: 'missing_evidence', label: t('hermesDashboard.feedback.missingEvidence'), warning: true },
    { category: 'unsafe_action', label: t('hermesDashboard.feedback.unsafeAction'), warning: true },
    { category: 'needs_workflow', label: t('hermesDashboard.feedback.needsWorkflow'), warning: true }
  ];

  return (
    <DetailSection title={t('hermesDashboard.feedback.title')}>
      <div className="rounded-lg border border-border bg-background/70 p-3">
        <p className="text-xs leading-5 text-text-secondary">
          {t('hermesDashboard.feedback.desc')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {feedbackItems.map((item) => (
            <button
              key={item.category}
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={() => onSubmit(item.category)}
              className={clsx(
                'rounded-md border px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                item.warning
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400'
                  : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400'
              )}
            >
              {isSubmitting ? t('common.saving') : item.label}
            </button>
          ))}
        </div>
        {!canSubmit && (
          <p className="mt-3 text-xs text-text-tertiary">{t('hermesDashboard.feedback.noPermission')}</p>
        )}
        {latestProposalId && (
          <Link
            to={`/evolution-proposals?proposalId=${encodeURIComponent(latestProposalId)}`}
            className="mt-3 inline-flex rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary hover:bg-primary/15"
          >
            {t('hermesDashboard.feedback.openProposal')}
          </Link>
        )}
      </div>
    </DetailSection>
  );
}

function TraceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
      <p className="truncate text-xs text-text-tertiary">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function TraceChipRow({ label, values, warning = false }: { label: string; values: string[]; warning?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-text-tertiary">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.slice(0, 8).map((value) => (
          <Chip key={value} value={value} warning={warning} />
        ))}
      </div>
    </div>
  );
}

function TraceRecordList({ title, records, render }: { title: string; records: Array<Record<string, unknown>>; render: (record: Record<string, unknown>) => ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-medium text-text-primary">{title}</p>
      <div className="space-y-2">
        {records.map((record, index) => (
          <div key={stringValue(record.id) || `${title}-${index}`}>
            {render(record)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-border bg-background/70 p-3">
          <p className="text-xs text-text-tertiary">{label}</p>
          <p className="mt-1 break-all text-sm font-medium text-text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function formatTime(value: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function summaryStringList(trace: CorrelationTrace, key: string): string[] {
  const summary = trace.executionEvidenceSummary;
  const value = summary && Array.isArray(summary[key]) ? summary[key] : [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildClientIntentFallback(session: HermesSession): HermesIntentSummary {
  return {
    entities: [session.agent_name || session.agent_id || 'Hermes'].filter(Boolean),
    action: session.mode || inferClientAction(session.input),
    timeWindow: null,
    environment: null,
    assetRefs: [
      ...session.extracted_refs.taskIds.map(id => `task:${id}`),
      ...session.extracted_refs.approvalIds.map(id => `approval:${id}`)
    ],
    expectedOutput: session.mode === 'review'
      ? 'facts_judgement_and_improvement_proposal'
      : session.mode === 'remediate'
        ? 'remediation_plan_risk_approval_and_verification'
        : 'evidence_risk_and_recommended_action'
  };
}

function buildClientEvidenceFallback(session: HermesSession): HermesEvidenceSummary {
  const hasRefs = session.extracted_refs.approvalIds.length > 0
    || session.extracted_refs.taskIds.length > 0
    || session.extracted_refs.correlationIds.length > 0
    || Boolean(session.correlation_id);
  return {
    toolsUsed: [],
    skillsUsed: [],
    mcpServersUsed: [],
    confidence: hasRefs ? 'medium' : 'low',
    missingEvidence: hasRefs ? ['tool_evidence'] : ['tool_evidence', 'correlation_id'],
    suggestedNextAction: session.extracted_refs.taskIds.length > 0
      ? 'track_task_and_verify_result'
      : session.extracted_refs.approvalIds.length > 0
        ? 'review_pending_or_completed_approval'
        : 'review_trace_and_choose_next_action'
  };
}

function inferClientAction(input: string): string {
  if (/复盘|review|evolve|proposal|进化|优化/i.test(input)) return 'review_and_improve';
  if (/修复|remediate|repair|审批|approval|执行/i.test(input)) return 'plan_remediation';
  if (/诊断|diagnose|分析|告警|root cause|根因/i.test(input)) return 'diagnose_issue';
  return 'answer_ops_request';
}

function minutesAgo(value: string): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / 60000;
}
