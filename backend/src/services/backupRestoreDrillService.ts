import { randomUUID } from 'crypto';
import db from '../models/database';
import { backupService } from './backupService';

export type BackupRestoreDrillStatus = 'passed' | 'failed' | 'warning';

export interface BackupRestoreDrillRecord {
  id: string;
  backup_id: string;
  backup_filename: string;
  drill_type: string;
  status: BackupRestoreDrillStatus;
  verification_status: string;
  evidence: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export function listBackupRestoreDrills(limit = 20): BackupRestoreDrillRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM backup_restore_drills
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clampLimit(limit, 20, 100)) as Array<Record<string, unknown>>;

  return rows.map(parseDrill);
}

export async function createBackupRestoreDrill(input: {
  backupId: string;
  drillType?: string;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<BackupRestoreDrillRecord> {
  const backup = backupService.getBackupInfo(input.backupId);
  const verification = await backupService.verifyBackupIntegrity(input.backupId);
  const status: BackupRestoreDrillStatus = verification.verified ? 'passed' : 'failed';
  const evidence = {
    mode: 'dry_run_restore_validation',
    noDatabaseMutation: true,
    backup: {
      id: backup.id,
      filename: backup.filename,
      size: backup.size,
      type: backup.type,
      createdAt: backup.createdAt,
      status: backup.status,
      sourceVerified: backup.verified
    },
    verification: {
      fileExists: verification.fileExists,
      integrityCheck: verification.verified ? 'ok' : 'failed',
      checksum: verification.checksum || backup.checksum || null,
      checkedAt: new Date().toISOString()
    },
    restoreBoundary: {
      performedRestore: false,
      reason: 'P10b records restore drill evidence without replacing the active database.'
    }
  };
  const id = randomUUID();

  db.prepare(`
    INSERT INTO backup_restore_drills (
      id, backup_id, backup_filename, drill_type, status, verification_status,
      evidence, notes, created_by, created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    backup.id,
    backup.filename,
    normalizeDrillType(input.drillType),
    status,
    verification.verified ? 'integrity_ok' : 'integrity_failed',
    JSON.stringify(evidence),
    normalizeOptionalText(input.notes, 2000),
    input.createdBy || null
  );

  return getBackupRestoreDrill(id)!;
}

export function getBackupRestoreDrill(id: string): BackupRestoreDrillRecord | null {
  const row = db.prepare('SELECT * FROM backup_restore_drills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseDrill(row) : null;
}

function parseDrill(row: Record<string, unknown>): BackupRestoreDrillRecord {
  return {
    id: String(row.id),
    backup_id: String(row.backup_id || ''),
    backup_filename: String(row.backup_filename || ''),
    drill_type: String(row.drill_type || 'restore_validation'),
    status: normalizeStatus(row.status),
    verification_status: String(row.verification_status || ''),
    evidence: parseJsonField(row.evidence, {}),
    notes: nullableString(row.notes),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    completed_at: nullableString(row.completed_at)
  };
}

function normalizeStatus(value: unknown): BackupRestoreDrillStatus {
  if (value === 'passed' || value === 'failed' || value === 'warning') {
    return value;
  }
  return 'warning';
}

function normalizeDrillType(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'restore_validation';
  }
  return value.trim().slice(0, 80);
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
