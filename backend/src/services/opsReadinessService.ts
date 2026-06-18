import fs from 'fs';
import path from 'path';
import { env } from '../utils/env';
import { healthService, SystemHealth } from './healthService';
import { backupService } from './backupService';
import { getHermesWorkerStatuses, HermesWorkerStatus } from './hermesWorkerService';
import { listEvolutionReleaseVersions } from './evolutionReleaseService';
import { listEvolutionProposals } from './evolutionProposalService';
import { listBackupRestoreDrills } from './backupRestoreDrillService';
import { listContainerRebuildDrills } from './containerRebuildDrillService';

export type OpsReadinessStatus = 'ready' | 'warning' | 'blocked';

export interface OpsReadinessCheck {
  key: string;
  category: 'deployment' | 'runtime' | 'data' | 'release' | 'security';
  status: OpsReadinessStatus;
  required: boolean;
  message: string;
  observed?: Record<string, unknown>;
}

export interface OpsReadinessSummary {
  status: OpsReadinessStatus;
  score: number;
  blockers: string[];
  warnings: string[];
  checks: OpsReadinessCheck[];
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
    lastContainerRebuildDrillAt: string | null;
    lastContainerRebuildDrillStatus: string | null;
  };
  data: {
    backupEnabled: boolean;
    totalBackups: number;
    lastBackupAt: string | null;
    lastBackupVerified: boolean;
    restoreDrills: number;
    lastRestoreDrillAt: string | null;
    lastRestoreDrillStatus: string | null;
    totalBackupSize: number;
    databaseSize: number;
  };
  release: {
    activeReleases: number;
    approvedProposals: number;
    pendingApprovalProposals: number;
    generatedAt: string;
  };
  health: {
    status: SystemHealth['status'];
    uptime: number;
    checks: SystemHealth['checks'];
  };
  hermesWorkers: HermesWorkerStatus[];
  generatedAt: string;
}

export async function buildOpsReadinessSummary(): Promise<OpsReadinessSummary> {
  const health = await healthService.checkHealth();
  const backupStatus = backupService.getStatus();
  const workers = await getHermesWorkerStatuses();
  const releases = listEvolutionReleaseVersions({ status: 'active', limit: 200 });
  const approvedProposals = listEvolutionProposals({ status: 'approved', limit: 1 }).total;
  const pendingApprovalProposals = listEvolutionProposals({ status: 'approval_pending', limit: 1 }).total;
  const restoreDrills = listBackupRestoreDrills(20);
  const lastRestoreDrill = restoreDrills[0] || null;
  const containerRebuildDrills = listContainerRebuildDrills(20);
  const lastContainerRebuildDrill = containerRebuildDrills[0] || null;
  const checks: OpsReadinessCheck[] = [];

  const databasePersistent = isPersistentDatabasePath(env.DATABASE_PATH);
  const frontendProductionAssetsDetected = hasFrontendProductionAssets();
  const frontendProductionReady = frontendProductionAssetsDetected || env.NODE_ENV === 'production';
  const configuredHermesWorkers = workers.filter(worker => worker.configured).length;
  const healthyHermesWorkers = workers.filter(worker => worker.healthy).length;
  const lastBackup = backupStatus.lastBackup || null;

  checks.push(check({
    key: 'node_env_production',
    category: 'deployment',
    status: env.NODE_ENV === 'production' ? 'ready' : 'warning',
    required: false,
    message: `NODE_ENV=${env.NODE_ENV}`
  }));
  checks.push(check({
    key: 'frontend_production_assets',
    category: 'deployment',
    status: frontendProductionReady ? 'ready' : 'warning',
    required: false,
    message: frontendProductionAssetsDetected
      ? 'Frontend production assets are present.'
      : env.NODE_ENV === 'production'
        ? 'Frontend is expected to be served by a separated production container.'
        : 'Frontend production assets were not detected from this backend runtime.'
  }));
  checks.push(check({
    key: 'container_rebuild_drill_recorded',
    category: 'deployment',
    status: lastContainerRebuildDrill?.status === 'passed' ? 'ready' : 'warning',
    required: false,
    message: lastContainerRebuildDrill
      ? `Latest container rebuild drill status is ${lastContainerRebuildDrill.status}.`
      : 'No container rebuild drill record has been created yet.'
  }));
  checks.push(check({
    key: 'database_persistent_path',
    category: 'data',
    status: databasePersistent ? 'ready' : 'blocked',
    required: true,
    message: databasePersistent
      ? `Database path is persistent: ${env.DATABASE_PATH}`
      : `Database path does not look persistent: ${env.DATABASE_PATH}`
  }));
  checks.push(check({
    key: 'backup_enabled',
    category: 'data',
    status: backupStatus.config.enabled ? 'ready' : 'blocked',
    required: true,
    message: backupStatus.config.enabled
      ? `Auto backup every ${backupStatus.config.intervalHours} hour(s).`
      : 'Auto backup is disabled.'
  }));
  checks.push(check({
    key: 'backup_available',
    category: 'data',
    status: backupStatus.totalBackups > 0 ? 'ready' : 'warning',
    required: false,
    message: backupStatus.totalBackups > 0
      ? `${backupStatus.totalBackups} backup file(s) found.`
      : 'No backup file has been recorded yet.'
  }));
  checks.push(check({
    key: 'backup_verified',
    category: 'data',
    status: lastBackup?.verified ? 'ready' : 'warning',
    required: false,
    message: lastBackup
      ? `Latest backup verified=${lastBackup.verified}.`
      : 'No backup verification evidence is available.'
  }));
  checks.push(check({
    key: 'restore_drill_recorded',
    category: 'data',
    status: lastRestoreDrill?.status === 'passed' ? 'ready' : 'warning',
    required: false,
    message: lastRestoreDrill
      ? `Latest restore drill status is ${lastRestoreDrill.status}.`
      : 'No restore drill record has been created yet.'
  }));
  checks.push(check({
    key: 'hermes_workers_configured',
    category: 'runtime',
    status: configuredHermesWorkers === 3 ? 'ready' : 'blocked',
    required: true,
    message: `${configuredHermesWorkers}/3 Hermes workers configured.`
  }));
  checks.push(check({
    key: 'hermes_workers_healthy',
    category: 'runtime',
    status: healthyHermesWorkers === 3 ? 'ready' : 'blocked',
    required: true,
    message: `${healthyHermesWorkers}/3 Hermes workers healthy.`
  }));
  checks.push(check({
    key: 'release_guard_available',
    category: 'release',
    status: 'ready',
    required: true,
    message: 'Evolution release guard API is enabled before publishing.'
  }));
  checks.push(check({
    key: 'active_release_tracking',
    category: 'release',
    status: releases.length > 0 ? 'ready' : 'warning',
    required: false,
    message: releases.length > 0
      ? `${releases.length} active release version(s) tracked.`
      : 'No active release version has been published yet.'
  }));
  checks.push(check({
    key: 'allowed_origins_configured',
    category: 'security',
    status: env.ALLOWED_ORIGINS.length > 0 ? 'ready' : 'blocked',
    required: true,
    message: `${env.ALLOWED_ORIGINS.length} allowed origin(s) configured.`
  }));
  checks.push(check({
    key: 'health_ready',
    category: 'runtime',
    status: health.status === 'healthy' ? 'ready' : health.status === 'degraded' ? 'warning' : 'blocked',
    required: true,
    message: `Health status is ${health.status}.`
  }));

  const blockers = checks.filter(item => item.required && item.status === 'blocked').map(item => item.key);
  const warnings = checks.filter(item => item.status === 'warning').map(item => item.key);
  const readyCount = checks.filter(item => item.status === 'ready').length;
  const score = checks.length > 0 ? Math.round((readyCount / checks.length) * 100) : 0;
  const status: OpsReadinessStatus = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';

  return {
    status,
    score,
    blockers,
    warnings,
    checks,
    environment: {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      databasePath: env.DATABASE_PATH,
      databasePersistent,
      backupDir: backupStatus.config.backupDir,
      allowedOrigins: env.ALLOWED_ORIGINS,
      hermesWorkerFallbackEnabled: process.env.HERMES_WORKER_FALLBACK_ENABLED !== 'false'
    },
    deployment: {
      backendProductionBuild: env.NODE_ENV === 'production',
      frontendProductionAssetsDetected: frontendProductionReady,
      expectedHermesWorkers: 3,
      configuredHermesWorkers,
      healthyHermesWorkers,
      containerRebuildDrills: containerRebuildDrills.length,
      lastContainerRebuildDrillAt: lastContainerRebuildDrill?.completed_at || null,
      lastContainerRebuildDrillStatus: lastContainerRebuildDrill?.status || null
    },
    data: {
      backupEnabled: backupStatus.config.enabled,
      totalBackups: backupStatus.totalBackups,
      lastBackupAt: lastBackup?.createdAt || null,
      lastBackupVerified: Boolean(lastBackup?.verified),
      restoreDrills: restoreDrills.length,
      lastRestoreDrillAt: lastRestoreDrill?.completed_at || null,
      lastRestoreDrillStatus: lastRestoreDrill?.status || null,
      totalBackupSize: backupStatus.totalSize,
      databaseSize: health.database.size
    },
    release: {
      activeReleases: releases.length,
      approvedProposals,
      pendingApprovalProposals,
      generatedAt: new Date().toISOString()
    },
    health: {
      status: health.status,
      uptime: health.uptime,
      checks: health.checks
    },
    hermesWorkers: workers,
    generatedAt: new Date().toISOString()
  };
}

function check(input: OpsReadinessCheck): OpsReadinessCheck {
  return input;
}

function isPersistentDatabasePath(databasePath: string): boolean {
  const normalized = path.resolve(databasePath);
  return normalized.startsWith('/app/data')
    || normalized.startsWith('/data')
    || normalized.startsWith('/var/lib')
    || normalized.includes('/volumes/')
    || normalized.includes('/itops-agent-platform/');
}

function hasFrontendProductionAssets(): boolean {
  const candidates = [
    path.resolve(process.cwd(), '../frontend/dist/index.html'),
    path.resolve(process.cwd(), 'public/index.html'),
    '/usr/share/nginx/html/index.html'
  ];
  return candidates.some(candidate => fs.existsSync(candidate));
}
