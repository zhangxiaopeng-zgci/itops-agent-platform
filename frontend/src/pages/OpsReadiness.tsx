import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Archive, CheckCircle2, Database, PlayCircle, RefreshCw, RotateCcw, ServerCog, ShieldCheck, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

type ReadinessStatus = 'ready' | 'warning' | 'blocked';
type CheckCategory = 'deployment' | 'runtime' | 'data' | 'release' | 'security';

interface ReadinessCheck {
  key: string;
  category: CheckCategory;
  status: ReadinessStatus;
  required: boolean;
  message: string;
}

interface HermesWorkerStatus {
  role: string;
  name: string;
  configured: boolean;
  healthy: boolean;
  latencyMs: number;
  status: string;
  model?: string;
  upstreamConfigured?: boolean;
}

interface OpsReadinessSummary {
  status: ReadinessStatus;
  score: number;
  blockers: string[];
  warnings: string[];
  checks: ReadinessCheck[];
  environment: {
    nodeEnv: string;
    port: number;
    databasePath: string;
    databasePersistent: boolean;
    backupDir: string;
    allowedOrigins: string[];
    hermesWorkerFallbackEnabled: boolean;
  };
  deployment: {
    backendProductionBuild: boolean;
    frontendProductionAssetsDetected: boolean;
    expectedHermesWorkers: number;
    configuredHermesWorkers: number;
    healthyHermesWorkers: number;
    containerRebuildDrills: number;
    lastContainerRebuildDrillAt?: string | null;
    lastContainerRebuildDrillStatus?: string | null;
  };
  data: {
    backupEnabled: boolean;
    totalBackups: number;
    lastBackupAt?: string | null;
    lastBackupVerified: boolean;
    restoreDrills: number;
    lastRestoreDrillAt?: string | null;
    lastRestoreDrillStatus?: string | null;
    totalBackupSize: number;
    databaseSize: number;
  };
  release: {
    activeReleases: number;
    approvedProposals: number;
    pendingApprovalProposals: number;
  };
  cloudNative: {
    kiteConfigured: boolean;
    kiteHealthy: boolean;
    kiteUrl?: string | null;
    kitePublicUrl?: string | null;
    kiteDataDir?: string | null;
    kiteDatabasePresent: boolean;
    kiteDatabaseSize: number;
    kiteLatencyMs?: number | null;
    kiteStatusCode?: number | null;
    kiteError?: string | null;
  };
  health: {
    status: string;
    uptime: number;
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; output?: string }>;
  };
  hermesWorkers: HermesWorkerStatus[];
  generatedAt: string;
}

interface BackupInfo {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  verified: boolean;
}

interface BackupRestoreDrill {
  id: string;
  backup_id: string;
  backup_filename: string;
  drill_type: string;
  status: 'passed' | 'failed' | 'warning';
  verification_status: string;
  notes?: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface ContainerRebuildDrill {
  id: string;
  status: 'passed' | 'failed' | 'warning';
  verification_status: string;
  notes?: string | null;
  created_at: string;
  completed_at?: string | null;
}

const panelClass = 'rounded-xl border border-border bg-surface/95 shadow-sm';
const categories: CheckCategory[] = ['deployment', 'runtime', 'data', 'release', 'security'];

export default function OpsReadiness() {
  const { t } = useLocale();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canRunRestoreDrill = user?.role === 'admin';
  const canRunContainerDrill = user?.role === 'admin';
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ops-readiness-summary'],
    queryFn: async () => {
      const res = await api.get('/api/ops-readiness/summary');
      return res.data.data as OpsReadinessSummary;
    },
    refetchInterval: 30000
  });
  const { data: backups } = useQuery({
    queryKey: ['backup-history'],
    enabled: canRunRestoreDrill,
    queryFn: async () => {
      const res = await api.get('/api/backups/history');
      return res.data.data as BackupInfo[];
    },
    refetchInterval: 60000
  });
  const { data: restoreDrills } = useQuery({
    queryKey: ['backup-restore-drills'],
    queryFn: async () => {
      const res = await api.get('/api/backups/restore-drills?limit=5');
      return res.data.data as BackupRestoreDrill[];
    },
    refetchInterval: 30000
  });
  const { data: containerDrills } = useQuery({
    queryKey: ['container-rebuild-drills'],
    queryFn: async () => {
      const res = await api.get('/api/ops-readiness/container-drills?limit=5');
      return res.data.data as ContainerRebuildDrill[];
    },
    refetchInterval: 30000
  });
  const restoreDrillMutation = useMutation({
    mutationFn: async () => {
      const backupId = backups?.[0]?.id;
      if (!backupId) {
        throw new Error(t('opsReadiness.drill.noBackup'));
      }
      const res = await api.post('/api/backups/restore-drills', {
        backupId,
        drillType: 'restore_validation',
        notes: t('opsReadiness.drill.defaultNotes')
      });
      return res.data.data as BackupRestoreDrill;
    },
    onSuccess: () => {
      toast.success(t('opsReadiness.drill.created'));
      queryClient.invalidateQueries({ queryKey: ['backup-restore-drills'] });
      queryClient.invalidateQueries({ queryKey: ['ops-readiness-summary'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('opsReadiness.drill.failed'));
    }
  });
  const containerDrillMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/ops-readiness/container-drills', {
        externalRecreatePerformed: false,
        notes: t('opsReadiness.containerDrill.defaultNotes')
      });
      return res.data.data as ContainerRebuildDrill;
    },
    onSuccess: () => {
      toast.success(t('opsReadiness.containerDrill.created'));
      queryClient.invalidateQueries({ queryKey: ['container-rebuild-drills'] });
      queryClient.invalidateQueries({ queryKey: ['ops-readiness-summary'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('opsReadiness.containerDrill.failed'));
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('opsReadiness.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('opsReadiness.subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          {t('common.refresh')}
        </button>
      </div>

      {isLoading || !data ? (
        <section className={`${panelClass} p-5 text-sm text-text-tertiary`}>{t('common.loading')}</section>
      ) : (
        <>
          <section className={`${panelClass} p-5`}>
            <div className="grid grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)] gap-4">
              <div className="rounded-lg bg-background border border-border p-4">
                <div className="text-xs text-text-tertiary">{t('opsReadiness.score')}</div>
                <div className="text-4xl font-semibold text-text-primary mt-1">{data.score}</div>
                <StatusPill status={data.status} />
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <Metric label={t('opsReadiness.metric.workers')} value={`${data.deployment.healthyHermesWorkers}/${data.deployment.expectedHermesWorkers}`} />
                <Metric label={t('opsReadiness.metric.backups')} value={String(data.data.totalBackups)} />
                <Metric label={t('opsReadiness.metric.activeReleases')} value={String(data.release.activeReleases)} />
                <Metric label={t('opsReadiness.metric.health')} value={data.health.status} />
                <Metric label={t('opsReadiness.metric.kite')} value={data.cloudNative.kiteHealthy ? t('common.online') : t('common.offline')} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <SummaryList title={t('opsReadiness.blockers')} items={data.blockers} tone="blocked" />
              <SummaryList title={t('opsReadiness.warnings')} items={data.warnings} tone="warning" />
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {categories.map((category) => (
              <CategoryPanel
                key={category}
                category={category}
                checks={data.checks.filter(check => check.category === category)}
              />
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <WorkersPanel workers={data.hermesWorkers} />
            <DataPanel
              summary={data}
              backups={backups || []}
              restoreDrills={restoreDrills || []}
              canRunRestoreDrill={canRunRestoreDrill}
              isRunningRestoreDrill={restoreDrillMutation.isPending}
              onRunRestoreDrill={() => restoreDrillMutation.mutate()}
            />
            <ContainerDrillPanel
              summary={data}
              drills={containerDrills || []}
              canRun={canRunContainerDrill}
              isRunning={containerDrillMutation.isPending}
              onRun={() => containerDrillMutation.mutate()}
            />
            <EnvironmentPanel summary={data} />
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background border border-border px-3 py-3 min-w-0">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-lg font-semibold text-text-primary truncate mt-1">{value}</div>
    </div>
  );
}

function SummaryList({ title, items, tone }: { title: string; items: string[]; tone: ReadinessStatus }) {
  const { t } = useLocale();
  return (
    <div className="rounded-lg bg-background border border-border px-3 py-3">
      <div className="text-xs font-medium text-text-tertiary">{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-sm text-status-success">{t('opsReadiness.none')}</span>
        ) : items.map((item) => (
          <span key={item} className={clsx(
            'rounded-md border px-2 py-0.5 text-xs',
            tone === 'blocked'
              ? 'bg-status-failed/10 text-status-failed border-status-failed/20'
              : 'bg-status-warning/10 text-status-warning border-status-warning/20'
          )}>
            {checkLabel(item, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryPanel({ category, checks }: { category: CheckCategory; checks: ReadinessCheck[] }) {
  const { t } = useLocale();
  const Icon = categoryIcon(category);
  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-text-primary">{t(`opsReadiness.category.${category}` as MessageKey)}</h2>
      </div>
      <div className="space-y-2">
        {checks.map((check) => (
          <div key={check.key} className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-text-primary truncate">{checkLabel(check.key, t)}</div>
              <StatusDot status={check.status} />
            </div>
            <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{checkMessage(check, t)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkersPanel({ workers }: { workers: HermesWorkerStatus[] }) {
  const { t } = useLocale();
  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-text-primary">{t('opsReadiness.workers.title')}</h2>
      </div>
      <div className="space-y-2">
        {workers.map((worker) => (
          <div key={worker.role} className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{worker.name}</div>
                <div className="text-xs text-text-tertiary mt-1 truncate">{worker.role} · {worker.model || t('common.unknown')}</div>
              </div>
              <StatusDot status={worker.healthy ? 'ready' : 'blocked'} />
            </div>
            <div className="mt-2 text-xs text-text-tertiary">
              {worker.status} · {worker.latencyMs}ms · {worker.upstreamConfigured ? t('opsReadiness.upstreamReady') : t('opsReadiness.upstreamMissing')}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataPanel({
  summary,
  backups,
  restoreDrills,
  canRunRestoreDrill,
  isRunningRestoreDrill,
  onRunRestoreDrill
}: {
  summary: OpsReadinessSummary;
  backups: BackupInfo[];
  restoreDrills: BackupRestoreDrill[];
  canRunRestoreDrill: boolean;
  isRunningRestoreDrill: boolean;
  onRunRestoreDrill: () => void;
}) {
  const { t } = useLocale();
  const latestBackup = backups[0];
  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">{t('opsReadiness.data.title')}</h2>
        </div>
        {canRunRestoreDrill && (
          <button
            disabled={!latestBackup || isRunningRestoreDrill}
            onClick={onRunRestoreDrill}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            {isRunningRestoreDrill ? t('opsReadiness.drill.running') : t('opsReadiness.drill.run')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('opsReadiness.data.databaseSize')} value={formatBytes(summary.data.databaseSize)} />
        <Metric label={t('opsReadiness.data.backupSize')} value={formatBytes(summary.data.totalBackupSize)} />
        <Metric label={t('opsReadiness.data.lastBackup')} value={formatTime(summary.data.lastBackupAt)} />
        <Metric label={t('opsReadiness.data.verified')} value={summary.data.lastBackupVerified ? t('common.yes') : t('common.no')} />
        <Metric label={t('opsReadiness.data.restoreDrills')} value={String(summary.data.restoreDrills)} />
        <Metric label={t('opsReadiness.data.lastDrill')} value={formatTime(summary.data.lastRestoreDrillAt)} />
        <Metric label={t('opsReadiness.data.kiteDatabase')} value={formatBytes(summary.cloudNative.kiteDatabaseSize)} />
        <Metric label={t('opsReadiness.data.kitePersisted')} value={summary.cloudNative.kiteDatabasePresent ? t('common.yes') : t('common.no')} />
      </div>
      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-text-tertiary">{t('opsReadiness.drill.recent')}</div>
        {restoreDrills.length === 0 ? (
          <div className="text-sm text-text-tertiary">{t('opsReadiness.drill.empty')}</div>
        ) : restoreDrills.slice(0, 3).map((drill) => (
          <div key={drill.id} className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{drill.backup_filename}</div>
                <div className="text-xs text-text-tertiary mt-1 truncate">
                  {drill.verification_status} · {formatTime(drill.completed_at)}
                </div>
              </div>
              <StatusPill status={drill.status === 'passed' ? 'ready' : drill.status === 'failed' ? 'blocked' : 'warning'} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ContainerDrillPanel({
  summary,
  drills,
  canRun,
  isRunning,
  onRun
}: {
  summary: OpsReadinessSummary;
  drills: ContainerRebuildDrill[];
  canRun: boolean;
  isRunning: boolean;
  onRun: () => void;
}) {
  const { t } = useLocale();
  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">{t('opsReadiness.containerDrill.title')}</h2>
        </div>
        {canRun && (
          <button
            disabled={isRunning}
            onClick={onRun}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            {isRunning ? t('opsReadiness.containerDrill.running') : t('opsReadiness.containerDrill.run')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('opsReadiness.containerDrill.count')} value={String(summary.deployment.containerRebuildDrills)} />
        <Metric label={t('opsReadiness.containerDrill.last')} value={formatTime(summary.deployment.lastContainerRebuildDrillAt)} />
        <Metric label={t('opsReadiness.containerDrill.status')} value={summary.deployment.lastContainerRebuildDrillStatus || '-'} />
        <Metric label={t('opsReadiness.metric.workers')} value={`${summary.deployment.healthyHermesWorkers}/${summary.deployment.expectedHermesWorkers}`} />
      </div>
      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-text-tertiary">{t('opsReadiness.containerDrill.recent')}</div>
        {drills.length === 0 ? (
          <div className="text-sm text-text-tertiary">{t('opsReadiness.containerDrill.empty')}</div>
        ) : drills.slice(0, 3).map((drill) => (
          <div key={drill.id} className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{drill.verification_status}</div>
                <div className="text-xs text-text-tertiary mt-1 truncate">{formatTime(drill.completed_at)}</div>
              </div>
              <StatusPill status={drill.status === 'passed' ? 'ready' : drill.status === 'failed' ? 'blocked' : 'warning'} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EnvironmentPanel({ summary }: { summary: OpsReadinessSummary }) {
  const { t } = useLocale();
  const items = [
    [t('opsReadiness.env.nodeEnv'), summary.environment.nodeEnv],
    [t('opsReadiness.env.port'), String(summary.environment.port)],
    [t('opsReadiness.env.database'), summary.environment.databasePath],
    [t('opsReadiness.env.backupDir'), summary.environment.backupDir],
    [t('opsReadiness.env.kiteUrl'), summary.cloudNative.kitePublicUrl || summary.cloudNative.kiteUrl || '-'],
    [t('opsReadiness.env.kiteDataDir'), summary.cloudNative.kiteDataDir || '-'],
    [t('opsReadiness.env.origins'), String(summary.environment.allowedOrigins.length)],
    [t('opsReadiness.env.fallback'), summary.environment.hermesWorkerFallbackEnabled ? t('common.enabled') : t('common.disabled')]
  ];

  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <ServerCog className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-text-primary">{t('opsReadiness.env.title')}</h2>
      </div>
      <div className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-background border border-border px-3 py-2 min-w-0">
            <div className="text-xs text-text-tertiary">{label}</div>
            <div className="text-sm text-text-primary truncate mt-1">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ReadinessStatus }) {
  const { t } = useLocale();
  return (
    <div className={clsx(
      'mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium',
      status === 'ready'
        ? 'bg-status-success/10 text-status-success border-status-success/30'
        : status === 'warning'
          ? 'bg-status-warning/10 text-status-warning border-status-warning/30'
          : 'bg-status-failed/10 text-status-failed border-status-failed/30'
    )}>
      {status === 'ready' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {t(`opsReadiness.status.${status}` as MessageKey)}
    </div>
  );
}

function StatusDot({ status }: { status: ReadinessStatus }) {
  return (
    <span className={clsx(
      'shrink-0 h-2.5 w-2.5 rounded-full',
      status === 'ready' ? 'bg-status-success' : status === 'warning' ? 'bg-status-warning' : 'bg-status-failed'
    )} />
  );
}

function categoryIcon(category: CheckCategory) {
  const icons = {
    deployment: ServerCog,
    runtime: Activity,
    data: Database,
    release: Archive,
    security: ShieldCheck
  };
  return icons[category];
}

function checkLabel(key: string, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const messageKey = `opsReadiness.check.${key}` as MessageKey;
  const translated = t(messageKey);
  return translated === messageKey ? key.replace(/_/g, ' ') : translated;
}

function checkMessage(check: ReadinessCheck, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const messageKey = `opsReadiness.checkMessage.${check.key}` as MessageKey;
  const translated = t(messageKey);
  return translated === messageKey ? check.message : translated;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
