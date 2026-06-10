import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v014AddHermesWorkerObservability: Migration = {
  id: '20260610000014',
  version: 14,
  name: 'add_hermes_worker_observability',
  description: 'Add Hermes worker registry, heartbeat, and run history tables',

  up: async (db: any) => {
    logger.info('Creating Hermes worker observability tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS hermes_workers (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        channel_type TEXT NOT NULL,
        url TEXT,
        configured INTEGER NOT NULL DEFAULT 0,
        healthy INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        model TEXT,
        upstream_configured INTEGER NOT NULL DEFAULT 0,
        last_latency_ms INTEGER,
        last_error TEXT,
        last_checked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hermes_worker_heartbeats (
        id TEXT PRIMARY KEY,
        worker_role TEXT NOT NULL,
        worker_url TEXT,
        healthy INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        latency_ms INTEGER,
        model TEXT,
        upstream_configured INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hermes_worker_runs (
        id TEXT PRIMARY KEY,
        worker_role TEXT,
        worker_url TEXT,
        agent_id TEXT,
        channel_id TEXT,
        correlation_id TEXT,
        status TEXT NOT NULL,
        latency_ms INTEGER,
        fallback_used INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_hermes_workers_role ON hermes_workers(role);
      CREATE INDEX IF NOT EXISTS idx_hermes_worker_heartbeats_role_time ON hermes_worker_heartbeats(worker_role, checked_at);
      CREATE INDEX IF NOT EXISTS idx_hermes_worker_runs_role_time ON hermes_worker_runs(worker_role, created_at);
      CREATE INDEX IF NOT EXISTS idx_hermes_worker_runs_correlation_id ON hermes_worker_runs(correlation_id);
    `);

    logger.info('Hermes worker observability tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Hermes worker observability tables...');
    db.exec(`
      DROP TABLE IF EXISTS hermes_worker_runs;
      DROP TABLE IF EXISTS hermes_worker_heartbeats;
      DROP TABLE IF EXISTS hermes_workers;
    `);
    logger.info('Hermes worker observability tables removed');
  }
};

export default v014AddHermesWorkerObservability;
