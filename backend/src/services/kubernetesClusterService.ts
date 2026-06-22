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

interface KubernetesSnapshotNode {
  name: string;
  internal_ip?: string | null;
  external_ip?: string | null;
  role?: string | null;
  status?: string | null;
  kubelet_version?: string | null;
  os_image?: string | null;
  container_runtime?: string | null;
  cpu_capacity?: string | null;
  memory_capacity?: string | null;
  pod_capacity?: number | null;
  server_id?: string | null;
  labels?: unknown;
  annotations?: unknown;
}

interface KubernetesSnapshotNamespace {
  name: string;
  status?: string | null;
  labels?: unknown;
  annotations?: unknown;
}

interface KubernetesSnapshotWorkload {
  namespace?: string | null;
  name: string;
  kind: string;
  replicas?: number | null;
  ready_replicas?: number | null;
  status?: string | null;
  labels?: unknown;
  annotations?: unknown;
}

interface KubernetesSnapshotPod {
  namespace?: string | null;
  name: string;
  phase?: string | null;
  pod_ip?: string | null;
  host_ip?: string | null;
  node_name?: string | null;
  restart_count?: number | null;
  ready?: number | boolean | null;
  labels?: unknown;
  annotations?: unknown;
}

interface KubernetesSnapshotService {
  namespace?: string | null;
  name: string;
  type?: string | null;
  cluster_ip?: string | null;
  external_ip?: string | null;
  ports?: unknown;
  selector?: unknown;
  labels?: unknown;
}

interface KubernetesSnapshotEvent {
  namespace?: string | null;
  involved_kind?: string | null;
  involved_name?: string | null;
  type?: string | null;
  reason?: string | null;
  message?: string | null;
  count?: number | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
}

export interface KubernetesAssetSnapshot {
  nodes?: KubernetesSnapshotNode[];
  namespaces?: KubernetesSnapshotNamespace[];
  workloads?: KubernetesSnapshotWorkload[];
  pods?: KubernetesSnapshotPod[];
  services?: KubernetesSnapshotService[];
  events?: KubernetesSnapshotEvent[];
}

export interface KubernetesSyncResult {
  cluster: KubernetesClusterSummary;
  counts: {
    nodes: number;
    namespaces: number;
    workloads: number;
    pods: number;
    services: number;
    events: number;
    boundServers: number;
  };
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

function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return JSON.stringify(value);
}

function normalizeNamespace(value: string | null | undefined): string {
  return normalizeText(value) || 'default';
}

function normalizeReady(value: number | boolean | null | undefined): number {
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;
  return Number(value) > 0 ? 1 : 0;
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

  syncClusterAssets(id: string, snapshot: KubernetesAssetSnapshot): KubernetesSyncResult | undefined {
    const existing = this.getClusterById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const nodes = snapshot.nodes || [];
    const namespaces = snapshot.namespaces || [];
    const workloads = snapshot.workloads || [];
    const pods = snapshot.pods || [];
    const services = snapshot.services || [];
    const events = snapshot.events || [];

    try {
      db.transaction(() => {
        db.prepare('DELETE FROM kubernetes_events WHERE cluster_id = ?').run(id);
        db.prepare('DELETE FROM kubernetes_services WHERE cluster_id = ?').run(id);
        db.prepare('DELETE FROM kubernetes_pods WHERE cluster_id = ?').run(id);
        db.prepare('DELETE FROM kubernetes_workloads WHERE cluster_id = ?').run(id);
        db.prepare('DELETE FROM kubernetes_namespaces WHERE cluster_id = ?').run(id);
        db.prepare('DELETE FROM kubernetes_nodes WHERE cluster_id = ?').run(id);

        const namespaceIds = new Map<string, string>();
        const nodeIds = new Map<string, string>();
        const namespaceNames = new Set<string>(namespaces.map((namespace) => normalizeNamespace(namespace.name)));

        for (const workload of workloads) namespaceNames.add(normalizeNamespace(workload.namespace));
        for (const pod of pods) namespaceNames.add(normalizeNamespace(pod.namespace));
        for (const service of services) namespaceNames.add(normalizeNamespace(service.namespace));

        const insertNamespace = db.prepare(`
          INSERT INTO kubernetes_namespaces (
            id, cluster_id, name, status, labels, annotations, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const namespaceName of namespaceNames) {
          const source = namespaces.find((namespace) => normalizeNamespace(namespace.name) === namespaceName);
          const namespaceId = randomUUID();
          namespaceIds.set(namespaceName, namespaceId);
          insertNamespace.run(
            namespaceId,
            id,
            namespaceName,
            normalizeText(source?.status) || 'unknown',
            stringifyJson(source?.labels),
            stringifyJson(source?.annotations),
            now
          );
        }

        const insertNode = db.prepare(`
          INSERT INTO kubernetes_nodes (
            id, cluster_id, server_id, name, internal_ip, external_ip, role, status,
            kubelet_version, os_image, container_runtime, cpu_capacity, memory_capacity,
            pod_capacity, labels, annotations, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const node of nodes) {
          const nodeId = randomUUID();
          nodeIds.set(node.name, nodeId);
          const serverId = this.resolveServerId(node.server_id, [node.internal_ip, node.external_ip, node.name]);
          insertNode.run(
            nodeId,
            id,
            serverId,
            node.name,
            normalizeText(node.internal_ip),
            normalizeText(node.external_ip),
            normalizeText(node.role),
            normalizeText(node.status) || 'unknown',
            normalizeText(node.kubelet_version),
            normalizeText(node.os_image),
            normalizeText(node.container_runtime),
            normalizeText(node.cpu_capacity),
            normalizeText(node.memory_capacity),
            node.pod_capacity ?? null,
            stringifyJson(node.labels),
            stringifyJson(node.annotations),
            now
          );
        }

        const insertWorkload = db.prepare(`
          INSERT INTO kubernetes_workloads (
            id, cluster_id, namespace_id, namespace, name, kind, replicas, ready_replicas,
            status, labels, annotations, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const workload of workloads) {
          const namespaceName = normalizeNamespace(workload.namespace);
          insertWorkload.run(
            randomUUID(),
            id,
            namespaceIds.get(namespaceName) || null,
            namespaceName,
            workload.name,
            workload.kind,
            workload.replicas ?? null,
            workload.ready_replicas ?? null,
            normalizeText(workload.status) || 'unknown',
            stringifyJson(workload.labels),
            stringifyJson(workload.annotations),
            now
          );
        }

        const insertPod = db.prepare(`
          INSERT INTO kubernetes_pods (
            id, cluster_id, namespace_id, node_id, namespace, name, phase, pod_ip,
            host_ip, restart_count, ready, labels, annotations, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const pod of pods) {
          const namespaceName = normalizeNamespace(pod.namespace);
          insertPod.run(
            randomUUID(),
            id,
            namespaceIds.get(namespaceName) || null,
            pod.node_name ? nodeIds.get(pod.node_name) || null : null,
            namespaceName,
            pod.name,
            normalizeText(pod.phase) || 'unknown',
            normalizeText(pod.pod_ip),
            normalizeText(pod.host_ip),
            pod.restart_count ?? 0,
            normalizeReady(pod.ready),
            stringifyJson(pod.labels),
            stringifyJson(pod.annotations),
            now
          );
        }

        const insertService = db.prepare(`
          INSERT INTO kubernetes_services (
            id, cluster_id, namespace_id, namespace, name, type, cluster_ip,
            external_ip, ports, selector, labels, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const service of services) {
          const namespaceName = normalizeNamespace(service.namespace);
          insertService.run(
            randomUUID(),
            id,
            namespaceIds.get(namespaceName) || null,
            namespaceName,
            service.name,
            normalizeText(service.type),
            normalizeText(service.cluster_ip),
            normalizeText(service.external_ip),
            stringifyJson(service.ports),
            stringifyJson(service.selector),
            stringifyJson(service.labels),
            now
          );
        }

        const insertEvent = db.prepare(`
          INSERT INTO kubernetes_events (
            id, cluster_id, namespace, involved_kind, involved_name, type, reason,
            message, count, first_seen_at, last_seen_at, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const event of events) {
          insertEvent.run(
            randomUUID(),
            id,
            normalizeText(event.namespace),
            normalizeText(event.involved_kind),
            normalizeText(event.involved_name),
            normalizeText(event.type),
            normalizeText(event.reason),
            normalizeText(event.message),
            event.count ?? 1,
            normalizeText(event.first_seen_at),
            normalizeText(event.last_seen_at),
            now
          );
        }

        db.prepare(`
          UPDATE kubernetes_clusters
          SET status = ?, last_sync_at = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run('synced', now, id);
      })();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync Kubernetes assets';
      db.prepare(`
        UPDATE kubernetes_clusters
        SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run('sync_failed', message, id);
      throw error;
    }

    const cluster = this.getClusterById(id)!;
    return {
      cluster,
      counts: {
        nodes: cluster.node_count,
        namespaces: cluster.namespace_count,
        workloads: cluster.workload_count,
        pods: cluster.pod_count,
        services: cluster.service_count,
        events: cluster.event_count,
        boundServers: cluster.bound_server_count,
      },
    };
  }

  private resolveServerId(explicitServerId: string | null | undefined, candidates: Array<string | null | undefined>): string | null {
    const normalizedExplicit = normalizeText(explicitServerId);
    if (normalizedExplicit) {
      const explicit = db.prepare('SELECT id FROM servers WHERE id = ?').get(normalizedExplicit) as { id: string } | undefined;
      if (explicit) return explicit.id;
    }

    for (const candidate of candidates) {
      const value = normalizeText(candidate);
      if (!value) continue;
      const server = db.prepare(`
        SELECT id FROM servers
        WHERE hostname = ?
           OR ip_address = ?
           OR private_ip = ?
        LIMIT 1
      `).get(value, value, value) as { id: string } | undefined;
      if (server) return server.id;
    }

    return null;
  }
}

export const kubernetesClusterService = new KubernetesClusterService();
