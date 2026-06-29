import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v032AddClosedLoopSmokeDrills: Migration = {
  id: '20260629000032',
  version: 32,
  name: 'add_closed_loop_smoke_drills',
  description: 'Add closed-loop smoke drill readiness evidence records',

  up: async (db: any) => {
    logger.info('Adding closed-loop smoke drill records...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS closed_loop_smoke_drills (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        case_id TEXT,
        task_id TEXT,
        final_case_status TEXT,
        verification_passed INTEGER NOT NULL DEFAULT 0,
        cleaned_up INTEGER NOT NULL DEFAULT 0,
        trace_counts TEXT,
        event_types TEXT,
        evidence TEXT,
        error TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_closed_loop_smoke_drills_status
        ON closed_loop_smoke_drills(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_closed_loop_smoke_drills_correlation
        ON closed_loop_smoke_drills(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_closed_loop_smoke_drills_created_at
        ON closed_loop_smoke_drills(created_at);
    `);

    logger.info('Closed-loop smoke drill records added successfully');
  },

  down: async (db: any) => {
    db.exec('DROP TABLE IF EXISTS closed_loop_smoke_drills;');
  }
};

export default v032AddClosedLoopSmokeDrills;
