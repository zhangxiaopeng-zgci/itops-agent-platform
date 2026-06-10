import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v017AddEvolutionReleaseVersions: Migration = {
  id: '20260610000017',
  version: 17,
  name: 'add_evolution_release_versions',
  description: 'Add versioned release records for approved Hermes evolution proposals',

  up: async (db: any) => {
    logger.info('Creating evolution release version tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_release_versions (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        object_type TEXT NOT NULL,
        target_id TEXT,
        version_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        payload TEXT NOT NULL,
        previous_version_id TEXT,
        published_by TEXT,
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        rolled_back_by TEXT,
        rolled_back_at DATETIME,
        rollback_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposal_id) REFERENCES evolution_proposals(id) ON DELETE CASCADE,
        FOREIGN KEY (previous_version_id) REFERENCES evolution_release_versions(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS evolution_release_events (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        proposal_id TEXT,
        event_type TEXT NOT NULL,
        actor_id TEXT,
        comment TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (version_id) REFERENCES evolution_release_versions(id) ON DELETE CASCADE,
        FOREIGN KEY (proposal_id) REFERENCES evolution_proposals(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_release_versions_proposal_id ON evolution_release_versions(proposal_id);
      CREATE INDEX IF NOT EXISTS idx_evolution_release_versions_target ON evolution_release_versions(object_type, target_id, status);
      CREATE INDEX IF NOT EXISTS idx_evolution_release_versions_status ON evolution_release_versions(status);
      CREATE INDEX IF NOT EXISTS idx_evolution_release_events_version_id ON evolution_release_events(version_id);
    `);

    logger.info('Evolution release version tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing evolution release version tables...');
    db.exec(`
      DROP TABLE IF EXISTS evolution_release_events;
      DROP TABLE IF EXISTS evolution_release_versions;
    `);
    logger.info('Evolution release version tables removed');
  }
};

export default v017AddEvolutionReleaseVersions;
