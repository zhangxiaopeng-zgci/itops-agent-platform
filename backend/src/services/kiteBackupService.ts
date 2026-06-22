import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import Database from 'better-sqlite3';
import db from '../models/database';
import { backupService } from './backupService';

export type KiteBackupDrillStatus = 'passed' | 'failed' | 'warning';

export interface KiteBackupInfo {
  id: string;
  filename: string;
  filePath: string;
  size: number;
  createdAt: string;
  verified: boolean;
  checksum?: string;
}

export interface KiteBackupDrillRecord {
  id: string;
  backup_id: string;
  backup_filename: string;
  status: KiteBackupDrillStatus;
  verification_status: string;
  evidence: Record<string, unknown>;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

const KITE_BACKUP_PREFIX = 'kite-backup-';

export function getKiteBackupDir(): string {
  return process.env.KITE_BACKUP_DIR || path.join(backupService.getConfig().backupDir, 'kite');
}

export function getKiteDatabasePath(): string | null {
  const dataDir = process.env.KITE_DATA_DIR;
  return dataDir ? path.join(dataDir, 'db.sqlite') : null;
}

export function listKiteBackups(limit = 20): KiteBackupInfo[] {
  const backupDir = getKiteBackupDir();
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  return fs.readdirSync(backupDir)
    .filter(file => file.startsWith(KITE_BACKUP_PREFIX) && file.endsWith('.db.gz'))
    .sort()
    .reverse()
    .slice(0, clampLimit(limit, 20, 100))
    .map(filename => {
      const filePath = path.join(backupDir, filename);
      const stats = fs.statSync(filePath);
      return {
        id: filename,
        filename,
        filePath,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
        verified: true
      };
    });
}

export async function createKiteBackup(): Promise<KiteBackupInfo> {
  const sourcePath = getKiteDatabasePath();
  if (!sourcePath) {
    throw new Error('KITE_DATA_DIR is not configured');
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Kite database not found: ${sourcePath}`);
  }

  const backupDir = getKiteBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawFilename = `${KITE_BACKUP_PREFIX}${timestamp}.db`;
  const rawPath = path.join(backupDir, rawFilename);
  const compressedPath = `${rawPath}.gz`;

  fs.copyFileSync(sourcePath, rawPath);
  await gzipFile(rawPath, compressedPath);
  fs.unlinkSync(rawPath);

  const verification = await verifyKiteBackupFile(compressedPath);
  const stats = fs.statSync(compressedPath);
  const checksum = verification.verified ? await calculateChecksum(compressedPath) : undefined;

  return {
    id: path.basename(compressedPath),
    filename: path.basename(compressedPath),
    filePath: compressedPath,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
    verified: verification.verified,
    checksum
  };
}

export function listKiteBackupDrills(limit = 20): KiteBackupDrillRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM kite_backup_drills
    ORDER BY created_at DESC
    LIMIT ?
  `).all(clampLimit(limit, 20, 100)) as Array<Record<string, unknown>>;

  return rows.map(parseDrill);
}

export async function createKiteBackupDrill(input: {
  backupId?: string;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<KiteBackupDrillRecord> {
  const backup = resolveKiteBackup(input.backupId);
  const verification = await verifyKiteBackupFile(backup.filePath);
  const status: KiteBackupDrillStatus = verification.verified ? 'passed' : 'failed';
  const evidence = {
    mode: 'kite_dry_run_restore_validation',
    noKiteMutation: true,
    backup: {
      id: backup.id,
      filename: backup.filename,
      size: backup.size,
      createdAt: backup.createdAt,
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
      reason: 'Kite backup drills validate restoreability without replacing the active Kite database.'
    }
  };
  const id = randomUUID();

  db.prepare(`
    INSERT INTO kite_backup_drills (
      id, backup_id, backup_filename, status, verification_status,
      evidence, notes, created_by, created_at, completed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    id,
    backup.id,
    backup.filename,
    status,
    verification.verified ? 'integrity_ok' : 'integrity_failed',
    JSON.stringify(evidence),
    normalizeOptionalText(input.notes, 2000),
    input.createdBy || null
  );

  return getKiteBackupDrill(id)!;
}

export function getKiteBackupDrill(id: string): KiteBackupDrillRecord | null {
  const row = db.prepare('SELECT * FROM kite_backup_drills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseDrill(row) : null;
}

export async function verifyKiteBackupFile(filePath: string): Promise<{
  verified: boolean;
  fileExists: boolean;
  checksum?: string;
}> {
  if (!fs.existsSync(filePath)) {
    return { verified: false, fileExists: false };
  }

  const tempPath = path.join('/tmp', `${randomUUID()}-kite-restore.db`);
  try {
    await gunzipFile(filePath, tempPath);
    const tempDb = new Database(tempPath, { readonly: true, fileMustExist: true });
    try {
      const integrity = tempDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const verified = integrity[0]?.integrity_check === 'ok';
      return {
        verified,
        fileExists: true,
        checksum: verified ? await calculateChecksum(filePath) : undefined
      };
    } finally {
      tempDb.close();
    }
  } catch {
    return { verified: false, fileExists: true };
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function resolveKiteBackup(backupId?: string): KiteBackupInfo {
  const backups = listKiteBackups(100);
  const backup = backupId
    ? backups.find(item => item.id === backupId || item.filename === backupId)
    : backups[0];
  if (!backup) {
    throw new Error('Kite backup not found');
  }
  return backup;
}

function parseDrill(row: Record<string, unknown>): KiteBackupDrillRecord {
  return {
    id: String(row.id),
    backup_id: String(row.backup_id || ''),
    backup_filename: String(row.backup_filename || ''),
    status: normalizeStatus(row.status),
    verification_status: String(row.verification_status || ''),
    evidence: parseJsonField(row.evidence, {}),
    notes: nullableString(row.notes),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || ''),
    completed_at: nullableString(row.completed_at)
  };
}

function normalizeStatus(value: unknown): KiteBackupDrillStatus {
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

async function gzipFile(src: string, dest: string): Promise<void> {
  await pipeline(fs.createReadStream(src), createGzip(), fs.createWriteStream(dest));
}

async function gunzipFile(src: string, dest: string): Promise<void> {
  await pipeline(fs.createReadStream(src), createGunzip(), fs.createWriteStream(dest));
}

async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
