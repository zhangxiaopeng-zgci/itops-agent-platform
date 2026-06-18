import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v022AddEvolutionProposalEnrichmentTask: Migration = {
  id: '20260618000022',
  version: 22,
  name: 'add_evolution_proposal_enrichment_task',
  description: 'Add continuous task for Hermes Evolve proposal enrichment',

  up: async (db: any) => {
    logger.info('Adding Hermes proposal enrichment continuous task...');

    db.prepare(`
      INSERT OR IGNORE INTO evolution_continuous_tasks (
        id, name, kind, schedule, description, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      'evolution-task-proposal-enrichment',
      'Hermes Proposal Evidence Enrichment',
      'proposal_enrichment',
      '10 * * * *',
      'Use Hermes Evolve to enrich feedback-driven proposals with evidence, evaluation plan, risk notes, and structured patch metadata.'
    );

    logger.info('Hermes proposal enrichment continuous task added successfully');
  },

  down: async (db: any) => {
    db.prepare('DELETE FROM evolution_continuous_tasks WHERE id = ?').run('evolution-task-proposal-enrichment');
  }
};

export default v022AddEvolutionProposalEnrichmentTask;
