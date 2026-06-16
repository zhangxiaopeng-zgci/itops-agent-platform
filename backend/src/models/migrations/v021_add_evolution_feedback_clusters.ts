import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v021AddEvolutionFeedbackClusters: Migration = {
  id: '20260616000021',
  version: 21,
  name: 'add_evolution_feedback_clusters',
  description: 'Add deterministic feedback clustering fields to evolution review queue',

  up: async (db: any) => {
    logger.info('Adding evolution feedback clustering fields...');

    addColumnIfMissing(db, 'evolution_review_queue', 'cluster_key', 'TEXT');
    addColumnIfMissing(db, 'evolution_review_queue', 'normalized_reason', 'TEXT');

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_evolution_review_queue_cluster_key
        ON evolution_review_queue(cluster_key, created_at);
    `);

    logger.info('Evolution feedback clustering fields added successfully');
  },

  down: async () => {
    logger.info('Skipping feedback clustering column rollback; SQLite column drop is intentionally not destructive');
  }
};

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

export default v021AddEvolutionFeedbackClusters;
