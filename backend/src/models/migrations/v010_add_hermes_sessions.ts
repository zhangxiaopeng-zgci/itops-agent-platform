import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v010AddHermesSessions: Migration = {
  id: '20260610000010',
  version: 10,
  name: 'add_hermes_sessions',
  description: 'Add persisted Hermes assistant sessions for trace and retrospective review',

  up: async (db: any) => {
    logger.info('Creating Hermes sessions table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS hermes_sessions (
        id TEXT PRIMARY KEY,
        agent_execution_id TEXT,
        agent_id TEXT,
        agent_name TEXT,
        mode TEXT,
        input TEXT NOT NULL,
        output TEXT,
        selected_context TEXT,
        trace TEXT,
        extracted_refs TEXT,
        correlation_id TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hermes_sessions_agent_execution_id ON hermes_sessions(agent_execution_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_sessions_correlation_id ON hermes_sessions(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_sessions_mode ON hermes_sessions(mode);
      CREATE INDEX IF NOT EXISTS idx_hermes_sessions_created_at ON hermes_sessions(created_at DESC);
    `);

    logger.info('Hermes sessions table created successfully');
  },

  down: async (db: any) => {
    logger.info('Dropping Hermes sessions table...');
    db.exec(`
      DROP INDEX IF EXISTS idx_hermes_sessions_agent_execution_id;
      DROP INDEX IF EXISTS idx_hermes_sessions_correlation_id;
      DROP INDEX IF EXISTS idx_hermes_sessions_mode;
      DROP INDEX IF EXISTS idx_hermes_sessions_created_at;
      DROP TABLE IF EXISTS hermes_sessions;
    `);
    logger.info('Hermes sessions table dropped');
  }
};

export default v010AddHermesSessions;
