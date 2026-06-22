import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v029AddKiteBackupDrills: Migration = {
  id: '20260618000029',
  version: 29,
  name: 'add_kite_backup_drills',
  description: 'Add Kite backup restore drill records',

  up: async (db: any) => {
    logger.info('Adding Kite backup restore drill records...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS kite_backup_drills (
        id TEXT PRIMARY KEY,
        backup_id TEXT NOT NULL,
        backup_filename TEXT NOT NULL,
        status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        evidence TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_kite_backup_drills_backup_id
        ON kite_backup_drills(backup_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_kite_backup_drills_status
        ON kite_backup_drills(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_kite_backup_drills_created_at
        ON kite_backup_drills(created_at);
    `);

    logger.info('Kite backup restore drill records added successfully');
  },

  down: async (db: any) => {
    db.exec('DROP TABLE IF EXISTS kite_backup_drills;');
  }
};

export default v029AddKiteBackupDrills;
