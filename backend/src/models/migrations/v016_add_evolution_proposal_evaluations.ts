import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v016AddEvolutionProposalEvaluations: Migration = {
  id: '20260610000016',
  version: 16,
  name: 'add_evolution_proposal_evaluations',
  description: 'Add evaluation records for controlled Hermes evolution proposals',

  up: async (db: any) => {
    logger.info('Creating evolution proposal evaluation table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_proposal_evaluations (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        passed INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        safety_score INTEGER NOT NULL DEFAULT 0,
        evidence_score INTEGER NOT NULL DEFAULT 0,
        completeness_score INTEGER NOT NULL DEFAULT 0,
        replay_score INTEGER NOT NULL DEFAULT 0,
        replay_sample_count INTEGER NOT NULL DEFAULT 0,
        findings TEXT,
        replay_samples TEXT,
        result_summary TEXT,
        evaluator TEXT NOT NULL DEFAULT 'deterministic-v1',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES evolution_proposals(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_proposal_evaluations_proposal_id ON evolution_proposal_evaluations(proposal_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_evolution_proposal_evaluations_status ON evolution_proposal_evaluations(status);
    `);

    logger.info('Evolution proposal evaluation table created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing evolution proposal evaluation table...');
    db.exec('DROP TABLE IF EXISTS evolution_proposal_evaluations;');
    logger.info('Evolution proposal evaluation table removed');
  }
};

export default v016AddEvolutionProposalEvaluations;
