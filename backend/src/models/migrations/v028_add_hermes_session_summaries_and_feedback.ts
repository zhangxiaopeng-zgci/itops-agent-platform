import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v028AddHermesSessionSummariesAndFeedback: Migration = {
  id: '20260618000028',
  version: 28,
  name: 'add_hermes_session_summaries_and_feedback',
  description: 'Add structured Hermes session summaries and board feedback records',

  up: async (db: any) => {
    logger.info('Adding Hermes session summaries and board feedback...');

    const hermesSessionColumns = db.prepare('PRAGMA table_info(hermes_sessions)').all() as Array<{ name: string }>;
    const columnNames = new Set(hermesSessionColumns.map(column => column.name));

    if (!columnNames.has('intent_summary')) {
      db.exec('ALTER TABLE hermes_sessions ADD COLUMN intent_summary TEXT;');
    }
    if (!columnNames.has('evidence_summary')) {
      db.exec('ALTER TABLE hermes_sessions ADD COLUMN evidence_summary TEXT;');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS hermes_board_feedback (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        category TEXT NOT NULL,
        reason TEXT,
        correlation_id TEXT,
        evidence_refs TEXT,
        generated_proposal_id TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (generated_proposal_id) REFERENCES evolution_proposals(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hermes_board_feedback_source
        ON hermes_board_feedback(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_board_feedback_category
        ON hermes_board_feedback(category);
      CREATE INDEX IF NOT EXISTS idx_hermes_board_feedback_correlation
        ON hermes_board_feedback(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_board_feedback_created_at
        ON hermes_board_feedback(created_at DESC);
    `);

    logger.info('Hermes session summaries and board feedback added successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Hermes board feedback table...');
    db.exec(`
      DROP INDEX IF EXISTS idx_hermes_board_feedback_source;
      DROP INDEX IF EXISTS idx_hermes_board_feedback_category;
      DROP INDEX IF EXISTS idx_hermes_board_feedback_correlation;
      DROP INDEX IF EXISTS idx_hermes_board_feedback_created_at;
      DROP TABLE IF EXISTS hermes_board_feedback;
    `);
    logger.info('Hermes board feedback table removed; summary columns are kept for SQLite safety');
  }
};

export default v028AddHermesSessionSummariesAndFeedback;
