import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v031AddOperationCases: Migration = {
  id: '20260623000031',
  version: 31,
  name: 'add_operation_cases',
  description: 'Add closed-loop operation case records and event timeline',

  up: async (db: any) => {
    logger.info('Adding operation case tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS operation_cases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        case_type TEXT NOT NULL DEFAULT 'incident',
        status TEXT NOT NULL DEFAULT 'diagnosing',
        severity TEXT,
        source TEXT NOT NULL DEFAULT 'diagnosis_center',
        asset_id TEXT,
        asset_type TEXT,
        asset_name TEXT,
        alert_id TEXT,
        correlation_id TEXT NOT NULL UNIQUE,
        server_ids TEXT,
        context TEXT,
        summary TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS operation_case_events (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source_type TEXT,
        source_id TEXT,
        correlation_id TEXT,
        payload TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES operation_cases(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_operation_cases_status
        ON operation_cases(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_operation_cases_correlation
        ON operation_cases(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_operation_cases_alert
        ON operation_cases(alert_id);
      CREATE INDEX IF NOT EXISTS idx_operation_cases_asset
        ON operation_cases(asset_type, asset_id);
      CREATE INDEX IF NOT EXISTS idx_operation_case_events_case
        ON operation_case_events(case_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_operation_case_events_correlation
        ON operation_case_events(correlation_id, created_at DESC);
    `);

    logger.info('Operation case tables added successfully');
  },

  down: async (db: any) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_operation_case_events_correlation;
      DROP INDEX IF EXISTS idx_operation_case_events_case;
      DROP INDEX IF EXISTS idx_operation_cases_asset;
      DROP INDEX IF EXISTS idx_operation_cases_alert;
      DROP INDEX IF EXISTS idx_operation_cases_correlation;
      DROP INDEX IF EXISTS idx_operation_cases_status;
      DROP TABLE IF EXISTS operation_case_events;
      DROP TABLE IF EXISTS operation_cases;
    `);
  }
};

export default v031AddOperationCases;
