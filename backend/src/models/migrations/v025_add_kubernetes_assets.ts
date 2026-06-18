import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const v025AddKubernetesAssets: Migration = {
  id: '20260618000025',
  version: 25,
  name: 'add_kubernetes_assets',
  description: 'Add Kubernetes cluster asset inventory tables',

  up: async (db: any) => {
    logger.info('Creating Kubernetes asset inventory tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS kubernetes_clusters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        api_server_url TEXT,
        environment TEXT,
        distribution TEXT,
        version TEXT,
        auth_type TEXT NOT NULL DEFAULT 'kubeconfig',
        credential_id TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_sync_at DATETIME,
        last_error TEXT,
        description TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS kubernetes_nodes (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        server_id TEXT,
        name TEXT NOT NULL,
        internal_ip TEXT,
        external_ip TEXT,
        role TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        kubelet_version TEXT,
        os_image TEXT,
        container_runtime TEXT,
        cpu_capacity TEXT,
        memory_capacity TEXT,
        pod_capacity INTEGER,
        labels TEXT,
        annotations TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cluster_id, name),
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS kubernetes_namespaces (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown',
        labels TEXT,
        annotations TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cluster_id, name),
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS kubernetes_workloads (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        namespace_id TEXT,
        namespace TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        replicas INTEGER,
        ready_replicas INTEGER,
        status TEXT NOT NULL DEFAULT 'unknown',
        labels TEXT,
        annotations TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cluster_id, namespace, kind, name),
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE,
        FOREIGN KEY (namespace_id) REFERENCES kubernetes_namespaces(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS kubernetes_pods (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        namespace_id TEXT,
        node_id TEXT,
        namespace TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        phase TEXT NOT NULL DEFAULT 'unknown',
        pod_ip TEXT,
        host_ip TEXT,
        restart_count INTEGER NOT NULL DEFAULT 0,
        ready INTEGER NOT NULL DEFAULT 0,
        labels TEXT,
        annotations TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cluster_id, namespace, name),
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE,
        FOREIGN KEY (namespace_id) REFERENCES kubernetes_namespaces(id) ON DELETE SET NULL,
        FOREIGN KEY (node_id) REFERENCES kubernetes_nodes(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS kubernetes_services (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        namespace_id TEXT,
        namespace TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        type TEXT,
        cluster_ip TEXT,
        external_ip TEXT,
        ports TEXT,
        selector TEXT,
        labels TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cluster_id, namespace, name),
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE,
        FOREIGN KEY (namespace_id) REFERENCES kubernetes_namespaces(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS kubernetes_events (
        id TEXT PRIMARY KEY,
        cluster_id TEXT NOT NULL,
        namespace TEXT,
        involved_kind TEXT,
        involved_name TEXT,
        type TEXT,
        reason TEXT,
        message TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen_at DATETIME,
        last_seen_at DATETIME,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cluster_id) REFERENCES kubernetes_clusters(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_kubernetes_clusters_status ON kubernetes_clusters(status, enabled);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_nodes_cluster_id ON kubernetes_nodes(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_nodes_server_id ON kubernetes_nodes(server_id);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_nodes_internal_ip ON kubernetes_nodes(internal_ip);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_namespaces_cluster_id ON kubernetes_namespaces(cluster_id);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_workloads_cluster_namespace ON kubernetes_workloads(cluster_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_pods_cluster_namespace ON kubernetes_pods(cluster_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_pods_node_id ON kubernetes_pods(node_id);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_services_cluster_namespace ON kubernetes_services(cluster_id, namespace);
      CREATE INDEX IF NOT EXISTS idx_kubernetes_events_cluster_last_seen ON kubernetes_events(cluster_id, last_seen_at);
    `);

    logger.info('Kubernetes asset inventory tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing Kubernetes asset inventory tables...');
    db.exec(`
      DROP TABLE IF EXISTS kubernetes_events;
      DROP TABLE IF EXISTS kubernetes_services;
      DROP TABLE IF EXISTS kubernetes_pods;
      DROP TABLE IF EXISTS kubernetes_workloads;
      DROP TABLE IF EXISTS kubernetes_namespaces;
      DROP TABLE IF EXISTS kubernetes_nodes;
      DROP TABLE IF EXISTS kubernetes_clusters;
    `);
    logger.info('Kubernetes asset inventory tables removed');
  }
};

export default v025AddKubernetesAssets;
