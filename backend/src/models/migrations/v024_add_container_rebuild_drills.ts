import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v024AddContainerRebuildDrills: Migration = {
  id: '20260618000024',
  version: 24,
  name: 'add_container_rebuild_drills',
  description: 'Add container rebuild recovery drill audit records',

  up: async (db: any) => {
    logger.info('Adding container rebuild drill records...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS container_rebuild_drills (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        evidence TEXT,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_container_rebuild_drills_status
        ON container_rebuild_drills(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_container_rebuild_drills_created_at
        ON container_rebuild_drills(created_at);
    `);

    logger.info('Container rebuild drill records added successfully');
  },

  down: async (db: any) => {
    db.exec('DROP TABLE IF EXISTS container_rebuild_drills;');
  }
};

export default v024AddContainerRebuildDrills;
