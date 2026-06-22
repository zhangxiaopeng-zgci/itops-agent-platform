import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v030AddKubernetesCredentials: Migration = {
  id: '20260622000030',
  version: 30,
  name: 'add_kubernetes_credentials',
  description: 'Add dedicated Kubernetes credential registry',

  up: async (db: any) => {
    logger.info('Adding Kubernetes credential registry...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS kubernetes_credentials (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        credential_type TEXT NOT NULL,
        username TEXT,
        token_secret TEXT,
        kubeconfig TEXT,
        client_certificate TEXT,
        client_key TEXT,
        ca_certificate TEXT,
        server_url TEXT,
        description TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_kubernetes_credentials_type
        ON kubernetes_credentials(credential_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_credentials_name
        ON kubernetes_credentials(name);
    `);

    logger.info('Kubernetes credential registry added successfully');
  },

  down: async (db: any) => {
    db.exec('DROP TABLE IF EXISTS kubernetes_credentials;');
  }
};

export default v030AddKubernetesCredentials;
