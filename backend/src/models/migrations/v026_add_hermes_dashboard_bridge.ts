import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v026AddHermesDashboardBridge: Migration = {
  id: '20260618000026',
  version: 26,
  name: 'add_hermes_dashboard_bridge',
  description: 'Add Hermes Dashboard bridge settings and external link table',

  up: async (db: any) => {
    logger.info('Creating Hermes Dashboard bridge tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS hermes_external_links (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        correlation_id TEXT,
        external_system TEXT NOT NULL DEFAULT 'hermes_dashboard',
        external_url TEXT NOT NULL,
        external_card_id TEXT,
        external_run_id TEXT,
        external_state TEXT,
        title TEXT,
        metadata TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_type, source_id, external_system, external_card_id)
      );

      CREATE INDEX IF NOT EXISTS idx_hermes_external_links_source
        ON hermes_external_links(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_external_links_correlation
        ON hermes_external_links(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_hermes_external_links_external_card
        ON hermes_external_links(external_system, external_card_id);
    `);

    const insertSetting = db.prepare(`
      INSERT OR IGNORE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    insertSetting.run('HERMES_DASHBOARD_ENABLED', 'false');
    insertSetting.run('HERMES_DASHBOARD_URL', '');
    insertSetting.run('HERMES_DASHBOARD_EMBED_MODE', 'link');
    insertSetting.run('HERMES_DASHBOARD_AUTH_MODE', 'none');
    insertSetting.run('HERMES_DASHBOARD_ALLOWED_ORIGINS', '');

    logger.info('Hermes Dashboard bridge tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Hermes Dashboard bridge tables...');
    db.exec(`
      DELETE FROM settings
      WHERE key IN (
        'HERMES_DASHBOARD_ENABLED',
        'HERMES_DASHBOARD_URL',
        'HERMES_DASHBOARD_EMBED_MODE',
        'HERMES_DASHBOARD_AUTH_MODE',
        'HERMES_DASHBOARD_ALLOWED_ORIGINS'
      );
      DROP TABLE IF EXISTS hermes_external_links;
    `);
    logger.info('Hermes Dashboard bridge tables removed');
  }
};

export default v026AddHermesDashboardBridge;
