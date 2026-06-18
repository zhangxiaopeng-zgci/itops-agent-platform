import { randomUUID } from 'crypto';
import db from '../models/database';
import { env } from '../utils/env';
import { healthService } from './healthService';
import { getHermesWorkerStatuses } from './hermesWorkerService';
import { backupService } from './backupService';
import { listBackupRestoreDrills } from './backupRestoreDrillService';

export type ContainerRebuildDrillStatus = 'passed' | 'failed' | 'warning';

export interface ContainerRebuildDrillRecord {
  id: string;
  status: ContainerRebuildDrillStatus;
  verification_status: string;
  evidence: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

interface DrillCheck {
  key: string;
  passed: boolean;
  required: boolean;
  message: string;
}

const EXPECTED_WORKER_ALIASES: Record<string, string> = {
  HERMES_WORKER_DIAGNOSE_URL: 'hermes-diagnose',
  HERMES_WORKER_REMEDIATE_URL: 'hermes-remediate',
  HERMES_WORKER_EVOLVE_URL: 'hermes-evolve'
};

export function listContainerRebuildDrills(limit = 20): ContainerRebuildDrillRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM container_rebuild_drills
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clampLimit(limit, 20, 100)) as Array<Record<string, unknown>>;

  return rows.map(parseDrill);
}

export async function createContainerRebuildDrill(input: {
  notes?: string | null;
  createdBy?: string | null;
  externalRecreatePerformed?: boolean;
}): Promise<ContainerRebuildDrillRecord> {
  const health = await healthService.checkHealth();
  const workers = await getHermesWorkerStatuses();
  const backupStatus = backupService.getStatus();
  const restoreDrills = listBackupRestoreDrills(5);
  const latestRestoreDrill = restoreDrills[0] || null;
  const workerAliasChecks = buildWorkerAliasChecks();
  const checks: DrillCheck[] = [
    {
      key: 'backend_health_ready',
      passed: health.status === 'healthy',
      required: true,
      message: `Backend health is ${health.status}.`
    },
    {
      key: 'hermes_workers_healthy',
      passed: workers.length === 3 && workers.every(worker => worker.configured && worker.healthy),
      required: true,
      message: `${workers.filter(worker => worker.healthy).length}/3 Hermes workers are healthy.`
    },
    {
      key: 'compose_network_aliases_configured',
      passed: workerAliasChecks.every(item => item.passed),
      required: true,
      message: `${workerAliasChecks.filter(item => item.passed).length}/${workerAliasChecks.length} worker aliases match compose service names.`
    },
    {
      key: 'database_volume_persistent',
      passed: isPersistentPath(env.DATABASE_PATH),
      required: true,
      message: `Database path is ${env.DATABASE_PATH}.`
    },
    {
      key: 'backup_volume_persistent',
      passed: isPersistentPath(backupStatus.config.backupDir),
      required: true,
      message: `Backup directory is ${backupStatus.config.backupDir}.`
    },
    {
      key: 'backup_restore_drill_available',
      passed: latestRestoreDrill?.status === 'passed',
      required: false,
      message: latestRestoreDrill
        ? `Latest restore drill is ${latestRestoreDrill.status}.`
        : 'No restore drill is recorded yet.'
    }
  ];
  const requiredFailed = checks.filter(check => check.required && !check.passed);
  const optionalFailed = checks.filter(check => !check.required && !check.passed);
  const status: ContainerRebuildDrillStatus = requiredFailed.length > 0
    ? 'failed'
    : optionalFailed.length > 0
      ? 'warning'
      : 'passed';
  const evidence = {
    mode: 'container_rebuild_recovery_validation',
    externalRecreatePerformed: Boolean(input.externalRecreatePerformed),
    noContainerMutationByBackend: true,
    recommendedHostCommand: 'docker compose -f docker-compose.hermes.yml up -d --force-recreate backend frontend hermes-diagnose hermes-remediate hermes-evolve',
    checks,
    workerAliasChecks,
    health: {
      status: health.status,
      timestamp: health.timestamp,
      databaseSize: health.database.size
    },
    hermesWorkers: workers.map(worker => ({
      role: worker.role,
      url: worker.url || null,
      configured: worker.configured,
      healthy: worker.healthy,
      status: worker.status,
      latencyMs: worker.latencyMs,
      model: worker.model || null
    })),
    persistence: {
      databasePath: env.DATABASE_PATH,
      backupDir: backupStatus.config.backupDir,
      totalBackups: backupStatus.totalBackups,
      latestRestoreDrillId: latestRestoreDrill?.id || null
    },
    checkedAt: new Date().toISOString()
  };
  const id = randomUUID();

  db.prepare(`
    INSERT INTO container_rebuild_drills (
      id, status, verification_status, evidence, notes, created_by, created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    status,
    status === 'passed' ? 'rebuild_recovery_ready' : status === 'warning' ? 'rebuild_recovery_warning' : 'rebuild_recovery_failed',
    JSON.stringify(evidence),
    normalizeOptionalText(input.notes, 2000),
    input.createdBy || null
  );

  return getContainerRebuildDrill(id)!;
}

export function getContainerRebuildDrill(id: string): ContainerRebuildDrillRecord | null {
  const row = db.prepare('SELECT * FROM container_rebuild_drills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseDrill(row) : null;
}

function buildWorkerAliasChecks(): DrillCheck[] {
  return Object.entries(EXPECTED_WORKER_ALIASES).map(([envKey, expectedAlias]) => {
    const value = process.env[envKey] || '';
    const host = readUrlHost(value);
    return {
      key: envKey,
      passed: host === expectedAlias,
      required: true,
      message: `${envKey} host=${host || 'missing'}, expected=${expectedAlias}.`
    };
  });
}

function readUrlHost(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isPersistentPath(value: string): boolean {
  return value.startsWith('/app/data')
    || value.startsWith('/app/backups')
    || value.startsWith('/data')
    || value.startsWith('/var/lib')
    || value.includes('/volumes/')
    || value.includes('/itops-agent-platform/');
}

function parseDrill(row: Record<string, unknown>): ContainerRebuildDrillRecord {
  return {
    id: String(row.id),
    status: normalizeStatus(row.status),
    verification_status: String(row.verification_status || ''),
    evidence: parseJsonField(row.evidence, {}),
    notes: nullableString(row.notes),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    completed_at: nullableString(row.completed_at)
  };
}

function normalizeStatus(value: unknown): ContainerRebuildDrillStatus {
  if (value === 'passed' || value === 'failed' || value === 'warning') {
    return value;
  }
  return 'warning';
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().slice(0, maxLength);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}
