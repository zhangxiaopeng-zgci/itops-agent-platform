import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v015AddEvolutionProposals: Migration = {
  id: '20260610000015',
  version: 15,
  name: 'add_evolution_proposals',
  description: 'Add controlled Hermes evolution proposal records',

  up: async (db: any) => {
    logger.info('Creating evolution proposal tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_proposals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        priority TEXT NOT NULL DEFAULT 'P2',
        source TEXT NOT NULL DEFAULT 'manual',
        source_ref TEXT,
        target_descriptor TEXT,
        proposal_body TEXT NOT NULL,
        evidence_refs TEXT,
        risk_notes TEXT,
        eval_summary TEXT,
        review_comment TEXT,
        correlation_id TEXT,
        agent_execution_id TEXT,
        hermes_session_id TEXT,
        created_by TEXT,
        reviewed_by TEXT,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_execution_id) REFERENCES agent_executions(id) ON DELETE SET NULL,
        FOREIGN KEY (hermes_session_id) REFERENCES hermes_sessions(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS evolution_proposal_events (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        comment TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES evolution_proposals(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_proposals_status ON evolution_proposals(status);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposals_type ON evolution_proposals(type);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposals_priority ON evolution_proposals(priority);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposals_correlation_id ON evolution_proposals(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposals_created_at ON evolution_proposals(created_at);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposal_events_proposal_id ON evolution_proposal_events(proposal_id);
    `);

    logger.info('Evolution proposal tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing evolution proposal tables...');
    db.exec(`
      DROP TABLE IF EXISTS evolution_proposal_events;
      DROP TABLE IF EXISTS evolution_proposals;
    `);
    logger.info('Evolution proposal tables removed');
  }
};

export default v015AddEvolutionProposals;
