import { useQuery } from '@tanstack/react-query';
import { Activity, Archive, CheckCircle2, Database, RefreshCw, ServerCog, ShieldCheck, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

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
  };
  data: {
    backupEnabled: boolean;
    totalBackups: number;
    lastBackupAt?: string | null;
    lastBackupVerified: boolean;
    totalBackupSize: number;
    databaseSize: number;
  };
  release: {
    activeReleases: number;
    approvedProposals: number;
    pendingApprovalProposals: number;
  };
  health: {
    status: string;
    uptime: number;
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; output?: string }>;
  };
  hermesWorkers: HermesWorkerStatus[];
  generatedAt: string;
}

const panelClass = 'rounded-xl border border-border bg-surface/95 shadow-sm';
const categories: CheckCategory[] = ['deployment', 'runtime', 'data', 'release', 'security'];

export default function OpsReadiness() {
  const { t } = useLocale();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ops-readiness-summary'],
    queryFn: async () => {
      const res = await api.get('/api/ops-readiness/summary');
      return res.data.data as OpsReadinessSummary;
    },
    refetchInterval: 30000
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
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Metric label={t('opsReadiness.metric.workers')} value={`${data.deployment.healthyHermesWorkers}/${data.deployment.expectedHermesWorkers}`} />
                <Metric label={t('opsReadiness.metric.backups')} value={String(data.data.totalBackups)} />
                <Metric label={t('opsReadiness.metric.activeReleases')} value={String(data.release.activeReleases)} />
                <Metric label={t('opsReadiness.metric.health')} value={data.health.status} />
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

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <WorkersPanel workers={data.hermesWorkers} />
            <DataPanel summary={data} />
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

function DataPanel({ summary }: { summary: OpsReadinessSummary }) {
  const { t } = useLocale();
  return (
    <section className={`${panelClass} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-text-primary">{t('opsReadiness.data.title')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label={t('opsReadiness.data.databaseSize')} value={formatBytes(summary.data.databaseSize)} />
        <Metric label={t('opsReadiness.data.backupSize')} value={formatBytes(summary.data.totalBackupSize)} />
        <Metric label={t('opsReadiness.data.lastBackup')} value={formatTime(summary.data.lastBackupAt)} />
        <Metric label={t('opsReadiness.data.verified')} value={summary.data.lastBackupVerified ? t('common.yes') : t('common.no')} />
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
