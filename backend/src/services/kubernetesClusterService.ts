import { randomUUID } from 'crypto';
import http from 'http';
import https from 'https';
import db from '../models/database';
import { decrypt } from './encryptionService';
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

interface KubernetesCredential {
  auth_type: string;
  username?: string | null;
  password?: string | null;
  private_key?: string | null;
}

interface DedicatedKubernetesCredential {
  credential_type: string;
  token_secret?: string | null;
  kubeconfig?: string | null;
  client_certificate?: string | null;
  client_key?: string | null;
  server_url?: string | null;
}

interface KubernetesApiAuth {
  token: string;
  apiServerUrl?: string | null;
}

interface KubernetesApiList<T> {
  items?: T[];
}

interface KubernetesApiMetadata {
  name?: string;
  namespace?: string;
  labels?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  creationTimestamp?: string;
}

interface KubernetesApiNode {
  metadata?: KubernetesApiMetadata;
  status?: {
    addresses?: Array<{ type?: string; address?: string }>;
    conditions?: Array<{ type?: string; status?: string }>;
    nodeInfo?: {
      kubeletVersion?: string;
      osImage?: string;
      containerRuntimeVersion?: string;
    };
    capacity?: {
      cpu?: string;
      memory?: string;
      pods?: string;
    };
  };
}

interface KubernetesApiNamespace {
  metadata?: KubernetesApiMetadata;
  status?: { phase?: string };
}

interface KubernetesApiWorkload {
  kind?: string;
  metadata?: KubernetesApiMetadata;
  spec?: { replicas?: number };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    numberReady?: number;
    currentNumberScheduled?: number;
    desiredNumberScheduled?: number;
    availableReplicas?: number;
  };
}

interface KubernetesApiPod {
  metadata?: KubernetesApiMetadata;
  spec?: { nodeName?: string };
  status?: {
    phase?: string;
    podIP?: string;
    hostIP?: string;
    containerStatuses?: Array<{ ready?: boolean; restartCount?: number }>;
  };
}

interface KubernetesApiService {
  metadata?: KubernetesApiMetadata;
  spec?: {
    type?: string;
    clusterIP?: string;
    externalIPs?: string[];
    ports?: unknown;
    selector?: unknown;
  };
}

interface KubernetesApiEvent {
  metadata?: KubernetesApiMetadata;
  involvedObject?: {
    kind?: string;
    name?: string;
  };
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  eventTime?: string;
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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function getNodeAddress(node: KubernetesApiNode, type: string): string | null {
  return node.status?.addresses?.find((address) => address.type === type)?.address || null;
}

function getNodeStatus(node: KubernetesApiNode): string {
  const ready = node.status?.conditions?.find((condition) => condition.type === 'Ready');
  return ready?.status === 'True' ? 'Ready' : 'NotReady';
}

function getNodeRole(node: KubernetesApiNode): string | null {
  const labels = node.metadata?.labels || {};
  const roles = Object.keys(labels)
    .filter((key) => key.startsWith('node-role.kubernetes.io/'))
    .map((key) => key.replace('node-role.kubernetes.io/', '') || 'worker');
  if (roles.length > 0) return roles.join(',');
  return null;
}

function deriveWorkloadStatus(workload: KubernetesApiWorkload): string {
  const replicas = workload.spec?.replicas ?? workload.status?.replicas ?? workload.status?.desiredNumberScheduled ?? 0;
  const ready = workload.status?.readyReplicas ?? workload.status?.numberReady ?? workload.status?.availableReplicas ?? 0;
  return replicas === ready ? 'Ready' : 'Degraded';
}

function sumRestarts(pod: KubernetesApiPod): number {
  return (pod.status?.containerStatuses || []).reduce((total, status) => total + (status.restartCount || 0), 0);
}

function podReady(pod: KubernetesApiPod): boolean {
  const statuses = pod.status?.containerStatuses || [];
  return statuses.length > 0 && statuses.every((status) => status.ready);
}

function requireName(metadata: KubernetesApiMetadata | undefined, fallback: string): string {
  return normalizeText(metadata?.name) || fallback;
}

function stripYamlValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '|' || trimmed === '>') return null;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseKubeconfig(rawKubeconfig: string): KubernetesApiAuth {
  try {
    const kubeconfig = JSON.parse(rawKubeconfig);
    const currentContextName = kubeconfig['current-context'];
    const currentContext = kubeconfig.contexts?.find((item: any) => item.name === currentContextName)?.context || kubeconfig.contexts?.[0]?.context;
    const clusterName = currentContext?.cluster;
    const userName = currentContext?.user;
    const cluster = kubeconfig.clusters?.find((item: any) => item.name === clusterName)?.cluster || kubeconfig.clusters?.[0]?.cluster;
    const user = kubeconfig.users?.find((item: any) => item.name === userName)?.user || kubeconfig.users?.[0]?.user;
    const token = normalizeText(user?.token);
    const apiServerUrl = normalizeText(cluster?.server);
    if (!token) throw new Error('Kubeconfig does not contain a bearer token');
    return { token, apiServerUrl };
  } catch (error) {
    if (error instanceof SyntaxError) {
      const server = stripYamlValue(rawKubeconfig.match(/^\s*server:\s*(.+?)\s*$/m)?.[1]);
      const token = stripYamlValue(rawKubeconfig.match(/^\s*token:\s*(.+?)\s*$/m)?.[1]);
      if (!token) {
        throw new Error('Kubeconfig does not contain a bearer token');
      }
      return { token, apiServerUrl: server };
    }
    throw error;
  }
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

    if (!cluster.api_server_url && cluster.auth_type !== 'kubeconfig') {
      return { success: false, status: 'missing_api_server', message: 'API server URL is not configured' };
    }

    if (!cluster.auth_type) {
      return { success: false, status: 'missing_auth_type', message: 'Authentication type is not configured' };
    }

    if ((cluster.auth_type === 'token' || cluster.auth_type === 'kubeconfig') && !cluster.credential_id) {
      return { success: false, status: 'missing_credential', message: 'Kubernetes credential is not configured' };
    }

    return {
      success: true,
      status: 'configured',
      message: 'Cluster connection metadata is configured. Live Kubernetes API sync can be started from the cluster action bar.',
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

  async syncClusterFromApi(id: string): Promise<KubernetesSyncResult | undefined> {
    const cluster = this.getClusterById(id);
    if (!cluster) return undefined;
    const auth = this.getKubernetesApiAuth(cluster);
    const apiServerUrl = normalizeText(auth.apiServerUrl) || cluster.api_server_url;
    if (!apiServerUrl) {
      throw new Error('Kubernetes API server URL is not configured');
    }

    const apiBase = normalizeBaseUrl(apiServerUrl);
    const [nodes, namespaces, deployments, statefulSets, daemonSets, pods, services, events] = await Promise.all([
      this.kubernetesGet<KubernetesApiList<KubernetesApiNode>>(apiBase, '/api/v1/nodes', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiNamespace>>(apiBase, '/api/v1/namespaces', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiWorkload>>(apiBase, '/apis/apps/v1/deployments', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiWorkload>>(apiBase, '/apis/apps/v1/statefulsets', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiWorkload>>(apiBase, '/apis/apps/v1/daemonsets', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiPod>>(apiBase, '/api/v1/pods', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiService>>(apiBase, '/api/v1/services', auth.token),
      this.kubernetesGet<KubernetesApiList<KubernetesApiEvent>>(apiBase, '/api/v1/events', auth.token),
    ]);

    const snapshot: KubernetesAssetSnapshot = {
      nodes: (nodes.items || []).map((node) => ({
        name: requireName(node.metadata, 'unknown-node'),
        internal_ip: getNodeAddress(node, 'InternalIP'),
        external_ip: getNodeAddress(node, 'ExternalIP'),
        role: getNodeRole(node),
        status: getNodeStatus(node),
        kubelet_version: node.status?.nodeInfo?.kubeletVersion,
        os_image: node.status?.nodeInfo?.osImage,
        container_runtime: node.status?.nodeInfo?.containerRuntimeVersion,
        cpu_capacity: node.status?.capacity?.cpu,
        memory_capacity: node.status?.capacity?.memory,
        pod_capacity: node.status?.capacity?.pods ? Number(node.status.capacity.pods) : null,
        labels: node.metadata?.labels,
        annotations: node.metadata?.annotations,
      })),
      namespaces: (namespaces.items || []).map((namespace) => ({
        name: requireName(namespace.metadata, 'default'),
        status: namespace.status?.phase || 'unknown',
        labels: namespace.metadata?.labels,
        annotations: namespace.metadata?.annotations,
      })),
      workloads: [
        ...(deployments.items || []).map((workload) => this.mapApiWorkload(workload, 'Deployment')),
        ...(statefulSets.items || []).map((workload) => this.mapApiWorkload(workload, 'StatefulSet')),
        ...(daemonSets.items || []).map((workload) => this.mapApiWorkload(workload, 'DaemonSet')),
      ],
      pods: (pods.items || []).map((pod) => ({
        namespace: pod.metadata?.namespace || 'default',
        name: requireName(pod.metadata, 'unknown-pod'),
        phase: pod.status?.phase || 'unknown',
        pod_ip: pod.status?.podIP,
        host_ip: pod.status?.hostIP,
        node_name: pod.spec?.nodeName,
        restart_count: sumRestarts(pod),
        ready: podReady(pod),
        labels: pod.metadata?.labels,
        annotations: pod.metadata?.annotations,
      })),
      services: (services.items || []).map((service) => ({
        namespace: service.metadata?.namespace || 'default',
        name: requireName(service.metadata, 'unknown-service'),
        type: service.spec?.type,
        cluster_ip: service.spec?.clusterIP,
        external_ip: service.spec?.externalIPs?.join(','),
        ports: service.spec?.ports,
        selector: service.spec?.selector,
        labels: service.metadata?.labels,
      })),
      events: (events.items || []).map((event) => ({
        namespace: event.metadata?.namespace,
        involved_kind: event.involvedObject?.kind,
        involved_name: event.involvedObject?.name,
        type: event.type,
        reason: event.reason,
        message: event.message,
        count: event.count,
        first_seen_at: event.firstTimestamp || event.metadata?.creationTimestamp,
        last_seen_at: event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp,
      })),
    };

    return this.syncClusterAssets(id, snapshot);
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

  private mapApiWorkload(workload: KubernetesApiWorkload, kind: string): KubernetesSnapshotWorkload {
    const desired = workload.spec?.replicas ?? workload.status?.desiredNumberScheduled ?? workload.status?.currentNumberScheduled ?? null;
    const ready = workload.status?.readyReplicas ?? workload.status?.numberReady ?? workload.status?.availableReplicas ?? null;
    return {
      namespace: workload.metadata?.namespace || 'default',
      name: requireName(workload.metadata, `unknown-${kind.toLowerCase()}`),
      kind,
      replicas: desired,
      ready_replicas: ready,
      status: deriveWorkloadStatus(workload),
      labels: workload.metadata?.labels,
      annotations: workload.metadata?.annotations,
    };
  }

  private getKubernetesApiAuth(cluster: KubernetesCluster): KubernetesApiAuth {
    const credentialId = normalizeText(cluster.credential_id);
    if (!credentialId) {
      throw new Error('Kubernetes token credential is not configured');
    }

    const dedicatedCredential = db.prepare(`
      SELECT credential_type, token_secret, kubeconfig, client_certificate, client_key, server_url
      FROM kubernetes_credentials
      WHERE id = ?
    `).get(credentialId) as DedicatedKubernetesCredential | undefined;

    if (dedicatedCredential) {
      if (dedicatedCredential.credential_type === 'token') {
        if (!dedicatedCredential.token_secret) {
          throw new Error('Kubernetes token credential has no token secret');
        }
        return {
          token: decrypt(dedicatedCredential.token_secret),
          apiServerUrl: dedicatedCredential.server_url,
        };
      }
      if (dedicatedCredential.credential_type === 'kubeconfig') {
        if (!dedicatedCredential.kubeconfig) {
          throw new Error('Kubernetes kubeconfig credential has no kubeconfig data');
        }
        const parsed = parseKubeconfig(decrypt(dedicatedCredential.kubeconfig));
        return {
          ...parsed,
          apiServerUrl: parsed.apiServerUrl || dedicatedCredential.server_url,
        };
      }
      throw new Error('Live Kubernetes API sync currently supports token and bearer-token kubeconfig credentials');
    }

    const credential = db.prepare(`
      SELECT auth_type, username, password, private_key
      FROM ssh_keys
      WHERE id = ?
    `).get(credentialId) as KubernetesCredential | undefined;
    if (!credential) {
      throw new Error('Kubernetes token credential not found');
    }

    const encryptedToken = credential.auth_type === 'password' ? credential.password : credential.private_key;
    if (!encryptedToken) {
      throw new Error('Kubernetes token credential has no secret value');
    }

    return { token: decrypt(encryptedToken) };
  }

  private kubernetesGet<T>(baseUrl: string, path: string, token: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url,
        {
          method: 'GET',
          timeout: 15000,
          rejectUnauthorized: false,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              return reject(new Error(`Kubernetes API ${path} returned ${res.statusCode}: ${text.slice(0, 300)}`));
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new Error(`Kubernetes API ${path} returned invalid JSON`));
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error(`Kubernetes API ${path} timed out`));
      });
      req.on('error', reject);
      req.end();
    });
  }
}

export const kubernetesClusterService = new KubernetesClusterService();
