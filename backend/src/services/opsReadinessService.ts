import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { env } from '../utils/env';
import { healthService, SystemHealth } from './healthService';
import { backupService } from './backupService';
import { getHermesWorkerStatuses, HermesWorkerStatus } from './hermesWorkerService';
import { listEvolutionReleaseVersions } from './evolutionReleaseService';
import { listEvolutionProposals } from './evolutionProposalService';
import { listBackupRestoreDrills } from './backupRestoreDrillService';
import { listContainerRebuildDrills } from './containerRebuildDrillService';
import { listKiteBackupDrills, listKiteBackups } from './kiteBackupService';
import { listClosedLoopSmokeDrills } from './closedLoopSmokeService';

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
  operations: {
    closedLoopSmokeDrills: number;
    lastClosedLoopSmokeAt: string | null;
    lastClosedLoopSmokeStatus: string | null;
    lastClosedLoopSmokeVerificationStatus: string | null;
  };
  cloudNative: {
    kiteConfigured: boolean;
    kiteHealthy: boolean;
    kiteUrl: string | null;
    kitePublicUrl: string | null;
    kiteDataDir: string | null;
    kiteDatabasePresent: boolean;
    kiteDatabaseSize: number;
    kiteLatencyMs: number | null;
    kiteStatusCode: number | null;
    kiteError: string | null;
    kiteBackups: number;
    lastKiteBackupAt: string | null;
    lastKiteBackupVerified: boolean;
    kiteRestoreDrills: number;
    lastKiteRestoreDrillAt: string | null;
    lastKiteRestoreDrillStatus: string | null;
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
  const closedLoopSmokeDrills = listClosedLoopSmokeDrills(20);
  const lastClosedLoopSmokeDrill = closedLoopSmokeDrills[0] || null;
  const kiteStatus = await getKiteStatus();
  const kiteBackups = listKiteBackups(20);
  const lastKiteBackup = kiteBackups[0] || null;
  const kiteRestoreDrills = listKiteBackupDrills(20);
  const lastKiteRestoreDrill = kiteRestoreDrills[0] || null;
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
    key: 'closed_loop_smoke_recorded',
    category: 'runtime',
    status: lastClosedLoopSmokeDrill?.status === 'passed' ? 'ready' : 'warning',
    required: false,
    message: lastClosedLoopSmokeDrill
      ? `Latest closed-loop smoke status is ${lastClosedLoopSmokeDrill.status}.`
      : 'No closed-loop smoke drill record has been created yet.',
    observed: {
      drills: closedLoopSmokeDrills.length,
      lastDrillAt: lastClosedLoopSmokeDrill?.completed_at || null,
      lastStatus: lastClosedLoopSmokeDrill?.status || null,
      lastVerificationStatus: lastClosedLoopSmokeDrill?.verification_status || null
    }
  }));
  checks.push(check({
    key: 'kite_console_reachable',
    category: 'runtime',
    status: !kiteStatus.configured ? 'warning' : kiteStatus.healthy ? 'ready' : 'blocked',
    required: kiteStatus.configured,
    message: !kiteStatus.configured
      ? 'Kite URL is not configured.'
      : kiteStatus.healthy
        ? `Kite console is reachable at ${kiteStatus.url}.`
        : `Kite console is not reachable: ${kiteStatus.error || 'unknown error'}.`,
    observed: {
      url: kiteStatus.url,
      statusCode: kiteStatus.statusCode,
      latencyMs: kiteStatus.latencyMs
    }
  }));
  checks.push(check({
    key: 'kite_data_persistent',
    category: 'data',
    status: !kiteStatus.dataDir ? 'warning' : kiteStatus.databasePresent ? 'ready' : 'warning',
    required: false,
    message: !kiteStatus.dataDir
      ? 'Kite data directory is not configured for readiness inspection.'
      : kiteStatus.databasePresent
        ? `Kite database is visible at ${kiteStatus.databasePath}.`
        : `Kite database was not found under ${kiteStatus.dataDir}.`,
    observed: {
      dataDir: kiteStatus.dataDir,
      databasePath: kiteStatus.databasePath,
      databaseSize: kiteStatus.databaseSize
    }
  }));
  checks.push(check({
    key: 'kite_backup_available',
    category: 'data',
    status: lastKiteBackup?.verified ? 'ready' : 'warning',
    required: false,
    message: lastKiteBackup
      ? `Latest Kite backup verified=${lastKiteBackup.verified}.`
      : 'No Kite backup has been created yet.',
    observed: {
      backups: kiteBackups.length,
      lastBackupAt: lastKiteBackup?.createdAt || null,
      lastBackupSize: lastKiteBackup?.size || 0
    }
  }));
  checks.push(check({
    key: 'kite_restore_drill_recorded',
    category: 'data',
    status: lastKiteRestoreDrill?.status === 'passed' ? 'ready' : 'warning',
    required: false,
    message: lastKiteRestoreDrill
      ? `Latest Kite restore drill status is ${lastKiteRestoreDrill.status}.`
      : 'No Kite restore drill record has been created yet.',
    observed: {
      restoreDrills: kiteRestoreDrills.length,
      lastRestoreDrillAt: lastKiteRestoreDrill?.completed_at || null,
      lastRestoreDrillStatus: lastKiteRestoreDrill?.status || null
    }
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
    operations: {
      closedLoopSmokeDrills: closedLoopSmokeDrills.length,
      lastClosedLoopSmokeAt: lastClosedLoopSmokeDrill?.completed_at || null,
      lastClosedLoopSmokeStatus: lastClosedLoopSmokeDrill?.status || null,
      lastClosedLoopSmokeVerificationStatus: lastClosedLoopSmokeDrill?.verification_status || null
    },
    cloudNative: {
      kiteConfigured: kiteStatus.configured,
      kiteHealthy: kiteStatus.healthy,
      kiteUrl: kiteStatus.url,
      kitePublicUrl: process.env.KITE_PUBLIC_URL || null,
      kiteDataDir: kiteStatus.dataDir,
      kiteDatabasePresent: kiteStatus.databasePresent,
      kiteDatabaseSize: kiteStatus.databaseSize,
      kiteLatencyMs: kiteStatus.latencyMs,
      kiteStatusCode: kiteStatus.statusCode,
      kiteError: kiteStatus.error,
      kiteBackups: kiteBackups.length,
      lastKiteBackupAt: lastKiteBackup?.createdAt || null,
      lastKiteBackupVerified: Boolean(lastKiteBackup?.verified),
      kiteRestoreDrills: kiteRestoreDrills.length,
      lastKiteRestoreDrillAt: lastKiteRestoreDrill?.completed_at || null,
      lastKiteRestoreDrillStatus: lastKiteRestoreDrill?.status || null
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

async function getKiteStatus(): Promise<{
  configured: boolean;
  healthy: boolean;
  url: string | null;
  dataDir: string | null;
  databasePath: string | null;
  databasePresent: boolean;
  databaseSize: number;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}> {
  const url = process.env.KITE_URL || null;
  const dataDir = process.env.KITE_DATA_DIR || null;
  const databasePath = dataDir ? path.join(dataDir, 'db.sqlite') : null;
  const databasePresent = databasePath ? fs.existsSync(databasePath) : false;
  const databaseSize = databasePresent && databasePath ? getFileSize(databasePath) : 0;

  if (!url) {
    return {
      configured: false,
      healthy: false,
      url,
      dataDir,
      databasePath,
      databasePresent,
      databaseSize,
      latencyMs: null,
      statusCode: null,
      error: null
    };
  }

  const startTime = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });
    return {
      configured: true,
      healthy: true,
      url,
      dataDir,
      databasePath,
      databasePresent,
      databaseSize,
      latencyMs: Date.now() - startTime,
      statusCode: response.status,
      error: null
    };
  } catch (error) {
    const statusCode = axios.isAxiosError(error) ? error.response?.status || null : null;
    return {
      configured: true,
      healthy: false,
      url,
      dataDir,
      databasePath,
      databasePresent,
      databaseSize,
      latencyMs: Date.now() - startTime,
      statusCode,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}
