import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v023AddBackupRestoreDrills: Migration = {
  id: '20260618000023',
  version: 23,
  name: 'add_backup_restore_drills',
  description: 'Add backup restore drill audit records',

  up: async (db: any) => {
    logger.info('Adding backup restore drill records...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_restore_drills (
        id TEXT PRIMARY KEY,
        backup_id TEXT NOT NULL,
        backup_filename TEXT NOT NULL,
        drill_type TEXT NOT NULL DEFAULT 'restore_validation',
        status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        evidence TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_backup_restore_drills_backup_id
        ON backup_restore_drills(backup_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_backup_restore_drills_status
        ON backup_restore_drills(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_backup_restore_drills_created_at
        ON backup_restore_drills(created_at);
    `);

    logger.info('Backup restore drill records added successfully');
  },

  down: async (db: any) => {
    db.exec('DROP TABLE IF EXISTS backup_restore_drills;');
  }
};

export default v023AddBackupRestoreDrills;
