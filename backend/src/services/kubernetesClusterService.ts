import { randomUUID } from 'crypto';
import db from '../models/database';
import { logger } from '../utils/logger';

export type KubernetesAuthType = 'kubeconfig' | 'token' | 'certificate';

export interface KubernetesCluster {
  id: string;
  name: string;
  api_server_url?: string | null;
  environment?: string | null;
  distribution?: string | null;
  version?: string | null;
  auth_type: KubernetesAuthType;
  credential_id?: string | null;
  status: string;
  enabled: number;
  last_sync_at?: string | null;
  last_error?: string | null;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface KubernetesClusterSummary extends KubernetesCluster {
  node_count: number;
  namespace_count: number;
  workload_count: number;
  pod_count: number;
  service_count: number;
  event_count: number;
  bound_server_count: number;
}

export interface CreateKubernetesClusterRequest {
  name: string;
  api_server_url?: string;
  environment?: string;
  distribution?: string;
  version?: string;
  auth_type?: KubernetesAuthType;
  credential_id?: string;
  enabled?: number | boolean;
  description?: string;
  created_by?: string;
}

export interface UpdateKubernetesClusterRequest {
  name?: string;
  api_server_url?: string | null;
  environment?: string | null;
  distribution?: string | null;
  version?: string | null;
  auth_type?: KubernetesAuthType;
  credential_id?: string | null;
  enabled?: number | boolean;
  status?: string;
  description?: string | null;
}

function normalizeEnabled(enabled: number | boolean | undefined): number {
  if (enabled === undefined) return 1;
  return enabled === true || enabled === 1 ? 1 : 0;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

class KubernetesClusterService {
  getAllClusters(): KubernetesClusterSummary[] {
    return db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT n.id) as node_count,
        COUNT(DISTINCT ns.id) as namespace_count,
        COUNT(DISTINCT w.id) as workload_count,
        COUNT(DISTINCT p.id) as pod_count,
        COUNT(DISTINCT svc.id) as service_count,
        COUNT(DISTINCT ev.id) as event_count,
        COUNT(DISTINCT n.server_id) as bound_server_count
      FROM kubernetes_clusters c
      LEFT JOIN kubernetes_nodes n ON n.cluster_id = c.id
      LEFT JOIN kubernetes_namespaces ns ON ns.cluster_id = c.id
      LEFT JOIN kubernetes_workloads w ON w.cluster_id = c.id
      LEFT JOIN kubernetes_pods p ON p.cluster_id = c.id
      LEFT JOIN kubernetes_services svc ON svc.cluster_id = c.id
      LEFT JOIN kubernetes_events ev ON ev.cluster_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all() as KubernetesClusterSummary[];
  }

  getClusterById(id: string): KubernetesClusterSummary | undefined {
    return db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT n.id) as node_count,
        COUNT(DISTINCT ns.id) as namespace_count,
        COUNT(DISTINCT w.id) as workload_count,
        COUNT(DISTINCT p.id) as pod_count,
        COUNT(DISTINCT svc.id) as service_count,
        COUNT(DISTINCT ev.id) as event_count,
        COUNT(DISTINCT n.server_id) as bound_server_count
      FROM kubernetes_clusters c
      LEFT JOIN kubernetes_nodes n ON n.cluster_id = c.id
      LEFT JOIN kubernetes_namespaces ns ON ns.cluster_id = c.id
      LEFT JOIN kubernetes_workloads w ON w.cluster_id = c.id
      LEFT JOIN kubernetes_pods p ON p.cluster_id = c.id
      LEFT JOIN kubernetes_services svc ON svc.cluster_id = c.id
      LEFT JOIN kubernetes_events ev ON ev.cluster_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as KubernetesClusterSummary | undefined;
  }

  createCluster(data: CreateKubernetesClusterRequest): KubernetesClusterSummary {
    const id = randomUUID();

    db.prepare(`
      INSERT INTO kubernetes_clusters (
        id, name, api_server_url, environment, distribution, version,
        auth_type, credential_id, status, enabled, description, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name.trim(),
      normalizeText(data.api_server_url),
      normalizeText(data.environment),
      normalizeText(data.distribution),
      normalizeText(data.version),
      data.auth_type || 'kubeconfig',
      normalizeText(data.credential_id),
      'unknown',
      normalizeEnabled(data.enabled),
      normalizeText(data.description),
      normalizeText(data.created_by)
    );

    logger.info(`Kubernetes cluster created: ${data.name}`);
    return this.getClusterById(id)!;
  }

  updateCluster(id: string, data: UpdateKubernetesClusterRequest): KubernetesClusterSummary | undefined {
    const existing = this.getClusterById(id);
    if (!existing) return undefined;

    const updates: Array<{ column: string; value: unknown }> = [];
    if (data.name !== undefined) updates.push({ column: 'name', value: data.name.trim() });
    if (data.api_server_url !== undefined) updates.push({ column: 'api_server_url', value: normalizeText(data.api_server_url) });
    if (data.environment !== undefined) updates.push({ column: 'environment', value: normalizeText(data.environment) });
    if (data.distribution !== undefined) updates.push({ column: 'distribution', value: normalizeText(data.distribution) });
    if (data.version !== undefined) updates.push({ column: 'version', value: normalizeText(data.version) });
    if (data.auth_type !== undefined) updates.push({ column: 'auth_type', value: data.auth_type });
    if (data.credential_id !== undefined) updates.push({ column: 'credential_id', value: normalizeText(data.credential_id) });
    if (data.enabled !== undefined) updates.push({ column: 'enabled', value: normalizeEnabled(data.enabled) });
    if (data.status !== undefined) updates.push({ column: 'status', value: normalizeText(data.status) || 'unknown' });
    if (data.description !== undefined) updates.push({ column: 'description', value: normalizeText(data.description) });

    if (updates.length > 0) {
      const setClause = updates.map((item) => `${item.column} = ?`).join(', ');
      db.prepare(`
        UPDATE kubernetes_clusters
        SET ${setClause}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(...updates.map((item) => item.value), id);
    }

    logger.info(`Kubernetes cluster updated: ${id}`);
    return this.getClusterById(id);
  }

  deleteCluster(id: string): boolean {
    const result = db.prepare('DELETE FROM kubernetes_clusters WHERE id = ?').run(id);
    if (result.changes > 0) {
      logger.info(`Kubernetes cluster deleted: ${id}`);
      return true;
    }
    return false;
  }

  getClusterAssets(id: string) {
    const cluster = this.getClusterById(id);
    if (!cluster) return undefined;

    return {
      cluster,
      nodes: db.prepare(`
        SELECT
          n.*,
          s.name AS server_name,
          s.hostname AS server_hostname,
          s.enabled AS server_enabled,
          s.os_type AS server_os_type
        FROM kubernetes_nodes n
        LEFT JOIN servers s ON s.id = n.server_id
        WHERE n.cluster_id = ?
        ORDER BY n.name
      `).all(id),
      namespaces: db.prepare('SELECT * FROM kubernetes_namespaces WHERE cluster_id = ? ORDER BY name').all(id),
      workloads: db.prepare('SELECT * FROM kubernetes_workloads WHERE cluster_id = ? ORDER BY namespace, kind, name').all(id),
      pods: db.prepare('SELECT * FROM kubernetes_pods WHERE cluster_id = ? ORDER BY namespace, name LIMIT 200').all(id),
      services: db.prepare('SELECT * FROM kubernetes_services WHERE cluster_id = ? ORDER BY namespace, name').all(id),
      events: db.prepare('SELECT * FROM kubernetes_events WHERE cluster_id = ? ORDER BY last_seen_at DESC, created_at DESC LIMIT 100').all(id),
    };
  }

  validateConnectionConfig(id: string): { success: boolean; status: string; message: string } {
    const cluster = this.getClusterById(id);
    if (!cluster) {
      return { success: false, status: 'not_found', message: 'Kubernetes cluster not found' };
    }

    if (!cluster.api_server_url) {
      return { success: false, status: 'missing_api_server', message: 'API server URL is not configured' };
    }

    if (!cluster.auth_type) {
      return { success: false, status: 'missing_auth_type', message: 'Authentication type is not configured' };
    }

    return {
      success: true,
      status: 'configured',
      message: 'Cluster connection metadata is configured. Live Kubernetes API probing will be enabled in the sync phase.',
    };
  }
}

export const kubernetesClusterService = new KubernetesClusterService();
