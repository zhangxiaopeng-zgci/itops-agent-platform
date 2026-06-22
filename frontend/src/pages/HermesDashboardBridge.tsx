import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, GitBranch, KanbanSquare, Loader2, RefreshCw, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

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

interface HermesSession {
  id: string;
  agent_execution_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  mode: string | null;
  input: string;
  output: string | null;
  extracted_refs: HermesSessionRefs;
  correlation_id: string | null;
  status: string;
  created_at: string;
}

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
                    <RunCard key={run.id} run={run} />
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
              <SessionCard key={session.id} session={session} />
            ))}
            {sessions.length === 0 && (
              <div className="lg:col-span-2 py-12 text-center text-sm text-text-secondary">
                {t('hermesDashboard.sessions.empty')}
              </div>
            )}
          </div>
        </section>
      </div>
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

function RunCard({ run }: { run: HermesWorkerRun }) {
  const failed = run.status === 'failed';
  const success = run.status === 'success';
  return (
    <article className="rounded-lg border border-border bg-background/70 p-3">
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
      </div>
      {run.error && <p className="text-xs text-red-500 mt-3 line-clamp-2">{run.error}</p>}
    </article>
  );
}

function SessionCard({ session }: { session: HermesSession }) {
  const correlationId = session.correlation_id || session.extracted_refs.correlationIds[0];
  return (
    <article className="rounded-lg border border-border bg-background/70 p-4">
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
      className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-primary hover:bg-primary/15 transition-colors"
    >
      {value}
    </Link>
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

function minutesAgo(value: string): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return (Date.now() - date.getTime()) / 60000;
}
