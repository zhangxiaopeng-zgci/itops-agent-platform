import db from '../models/database';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { executeCommand } from './sshService';

export interface DependencyInput {
  source_server_id: string;
  target_server_id: string;
  dependency_type: string;
  protocol?: string;
  port?: number;
  metadata?: Record<string, unknown>;
}

export interface TopologyNode {
  id: string;
  server_id?: string;
  server_name?: string;
  server_ip?: string;
  name?: string;
  ip?: string;
  type: string;
  status?: string;
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  dependency_type: string;
  protocol?: string;
  port?: number;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface AffectedService {
  server_id: string;
  server_name?: string;
  server_ip?: string;
  direction: 'upstream' | 'downstream' | 'both';
  distance: number;
  path: string[];
}

interface ServerDB {
  id: string;
  name: string;
  hostname: string;
  ip_address?: string | null;
  private_ip?: string | null;
  enabled?: number;
}

interface NetworkDeviceDB {
  id: string;
  name: string;
  ip_address: string;
  vendor: string;
  model: string | null;
  role: string | null;
  location: string | null;
  status: string | null;
}

interface KubernetesClusterDB {
  id: string;
  name: string;
  environment: string | null;
  distribution: string | null;
  version: string | null;
  status: string;
  enabled: number;
}

interface KubernetesNodeDB {
  id: string;
  cluster_id: string;
  server_id: string | null;
  name: string;
  internal_ip: string | null;
  external_ip: string | null;
  role: string | null;
  status: string;
}

interface ClusterServerGroupMappingDB {
  server_id: string;
  group_name: string;
}

interface KubernetesNamespaceDB {
  id: string;
  cluster_id: string;
  name: string;
  status: string;
}

interface KubernetesWorkloadDB {
  id: string;
  cluster_id: string;
  namespace_id: string | null;
  namespace: string;
  name: string;
  kind: string;
  replicas: number | null;
  ready_replicas: number | null;
  status: string;
  labels: string | null;
}

interface KubernetesPodDB {
  id: string;
  cluster_id: string;
  namespace_id: string | null;
  node_id: string | null;
  namespace: string;
  name: string;
  phase: string;
  pod_ip: string | null;
  host_ip: string | null;
  restart_count: number;
  ready: number;
  labels: string | null;
}

interface KubernetesServiceDB {
  id: string;
  cluster_id: string;
  namespace_id: string | null;
  namespace: string;
  name: string;
  type: string | null;
  cluster_ip: string | null;
  external_ip: string | null;
  selector: string | null;
}

interface DependencyDB {
  id: string;
  source_server_id: string;
  target_server_id: string;
  dependency_type: string;
  protocol: string | null;
  port: number | null;
  status: string;
  last_verified_at: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

class TopologyService {
  async discoverDependencies(serverId: string): Promise<DependencyInput[]> {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerDB | undefined;
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const commands = [
      'netstat -tunapl 2>/dev/null || ss -tunapl 2>/dev/null',
      'lsof -i -P -n 2>/dev/null',
      'cat /etc/hosts 2>/dev/null',
    ];

    const discovered: DependencyInput[] = [];
    const allServers = db.prepare('SELECT id, hostname FROM servers').all() as ServerDB[];

    for (const cmd of commands) {
      try {
        const result = await executeCommand(serverId, cmd, { logHistory: false });
        if (result.success && result.stdout) {
          for (const other of allServers) {
            if (other.id === serverId) continue;
            const pattern = new RegExp(`\\b${this.escapeRegExp(other.hostname)}\\b`);
            if (pattern.test(result.stdout)) {
              const dependencyType = cmd.includes('netstat') || cmd.includes('ss') ? 'network' : 'dns';
              discovered.push({
                source_server_id: serverId,
                target_server_id: other.id,
                dependency_type: dependencyType,
                protocol: 'tcp',
                metadata: { discovered_by: 'auto', command: cmd },
              });
            }
          }
        }
      } catch (error) {
        logger.warn(`Dependency discovery command failed for server ${serverId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return discovered;
  }

  addDependency(input: DependencyInput): TopologyEdge {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO service_topologies (id, source_server_id, target_server_id, dependency_type, protocol, port, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      id,
      input.source_server_id,
      input.target_server_id,
      input.dependency_type,
      input.protocol || null,
      input.port || null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now
    );

    return this.edgeToTopologyEdge(this.getDependencyById(id)!);
  }

  getServerTopology(serverId: string): TopologyGraph {
    const server = db.prepare('SELECT id, name, hostname FROM servers WHERE id = ?').get(serverId) as ServerDB | undefined;
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];

    nodes.push({
      id: server.id,
      server_id: server.id,
      server_name: server.name,
      server_ip: server.hostname,
      type: 'server',
    });

    const deps = db.prepare(`
      SELECT st.*, 
        s1.name as source_name, s1.hostname as source_ip,
        s2.name as target_name, s2.hostname as target_ip
      FROM service_topologies st
      LEFT JOIN servers s1 ON st.source_server_id = s1.id
      LEFT JOIN servers s2 ON st.target_server_id = s2.id
      WHERE st.source_server_id = ? OR st.target_server_id = ?
    `).all(serverId, serverId) as (DependencyDB & { source_name: string | null; source_ip: string | null; target_name: string | null; target_ip: string | null })[];

    const serverIds = new Set<string>([serverId]);

    for (const dep of deps) {
      edges.push(this.dependencyToEdge(dep));

      if (dep.source_server_id !== serverId && !serverIds.has(dep.source_server_id)) {
        serverIds.add(dep.source_server_id);
        nodes.push({
          id: dep.source_server_id,
          server_id: dep.source_server_id,
          server_name: dep.source_name || undefined,
          server_ip: dep.source_ip || undefined,
          type: 'server',
        });
      }

      if (dep.target_server_id !== serverId && !serverIds.has(dep.target_server_id)) {
        serverIds.add(dep.target_server_id);
        nodes.push({
          id: dep.target_server_id,
          server_id: dep.target_server_id,
          server_name: dep.target_name || undefined,
          server_ip: dep.target_ip || undefined,
          type: 'server',
        });
      }
    }

    return { nodes, edges };
  }

  getGlobalTopology(): TopologyGraph {
    const servers = db.prepare('SELECT id, name, hostname, ip_address, private_ip, enabled FROM servers').all() as ServerDB[];
    const deps = db.prepare(`
      SELECT st.*, 
        s1.name as source_name, s1.hostname as source_ip,
        s2.name as target_name, s2.hostname as target_ip
      FROM service_topologies st
      LEFT JOIN servers s1 ON st.source_server_id = s1.id
      LEFT JOIN servers s2 ON st.target_server_id = s2.id
    `).all() as (DependencyDB & { source_name: string | null; source_ip: string | null; target_name: string | null; target_ip: string | null })[];

    const nodes: TopologyNode[] = servers.map(s => this.serverToNode(s));

    const edges: TopologyEdge[] = deps.map(dep => this.dependencyToEdge(dep));
    const cloudNativeTopology = this.getCloudNativeTopology(servers);

    nodes.push(...this.getNetworkDeviceNodes(), ...cloudNativeTopology.nodes);
    edges.push(...cloudNativeTopology.edges);

    return { nodes, edges };
  }

  async verifyDependencies(): Promise<Array<{ id: string; source_server_id: string; target_server_id: string; status: string; verified_at: string }>> {
    const deps = db.prepare('SELECT * FROM service_topologies WHERE status = \'active\'').all() as DependencyDB[];
    const results: Array<{ id: string; source_server_id: string; target_server_id: string; status: string; verified_at: string }> = [];

    for (const dep of deps) {
      let status = 'inactive';
      const now = new Date().toISOString();

      try {
        const target = db.prepare('SELECT hostname FROM servers WHERE id = ?').get(dep.target_server_id) as { hostname: string } | undefined;
        if (target) {
          const result = await executeCommand(dep.source_server_id, `ping -c 1 -W 2 ${target.hostname}`, { logHistory: false });
          status = result.success ? 'active' : 'inactive';
        }
      } catch {
        status = 'unknown';
      }

      db.prepare(`
        UPDATE service_topologies SET status = ?, last_verified_at = ?, updated_at = ? WHERE id = ?
      `).run(status, now, now, dep.id);

      results.push({
        id: dep.id,
        source_server_id: dep.source_server_id,
        target_server_id: dep.target_server_id,
        status,
        verified_at: now,
      });
    }

    return results;
  }

  getAffectedServices(alertId: string): { upstream: AffectedService[]; downstream: AffectedService[] } {
    const alert = db.prepare('SELECT server_id FROM alerts WHERE id = ?').get(alertId) as { server_id: string } | undefined;
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    const upstream = this.findUpstream(alert.server_id);
    const downstream = this.findDownstream(alert.server_id);

    return { upstream, downstream };
  }

  deleteDependency(id: string): boolean {
    const result = db.prepare('DELETE FROM service_topologies WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getDependenciesByServer(serverId: string): TopologyEdge[] {
    const deps = db.prepare(`
      SELECT st.*, 
        s1.name as source_name, s1.hostname as source_ip,
        s2.name as target_name, s2.hostname as target_ip
      FROM service_topologies st
      LEFT JOIN servers s1 ON st.source_server_id = s1.id
      LEFT JOIN servers s2 ON st.target_server_id = s2.id
      WHERE st.source_server_id = ? OR st.target_server_id = ?
    `).all(serverId, serverId) as (DependencyDB & { source_name: string | null; source_ip: string | null; target_name: string | null; target_ip: string | null })[];

    return deps.map(dep => this.dependencyToEdge(dep));
  }

  getAllDependencies(): TopologyEdge[] {
    const deps = db.prepare(`
      SELECT st.*, 
        s1.name as source_name, s1.hostname as source_ip,
        s2.name as target_name, s2.hostname as target_ip
      FROM service_topologies st
      LEFT JOIN servers s1 ON st.source_server_id = s1.id
      LEFT JOIN servers s2 ON st.target_server_id = s2.id
    `).all() as (DependencyDB & { source_name: string | null; source_ip: string | null; target_name: string | null; target_ip: string | null })[];

    return deps.map(dep => this.dependencyToEdge(dep));
  }

  private findUpstream(serverId: string, visited: Set<string> = new Set(), distance = 0, path: string[] = [], maxDepth = 10): AffectedService[] {
    if (visited.has(serverId) || distance >= maxDepth) return [];
    visited.add(serverId);

    const server = db.prepare('SELECT id, name, hostname FROM servers WHERE id = ?').get(serverId) as ServerDB | undefined;
    if (!server) return [];

    const deps = db.prepare(`
      SELECT st.*, s.name as source_name, s.hostname as source_ip
      FROM service_topologies st
      LEFT JOIN servers s ON st.source_server_id = s.id
      WHERE st.target_server_id = ? AND st.status = 'active'
    `).all(serverId) as (DependencyDB & { source_name: string | null; source_ip: string | null })[];

    const results: AffectedService[] = [];

    for (const dep of deps) {
      const newPath = [...path, serverId];
      const childResults = this.findUpstream(dep.source_server_id, visited, distance + 1, newPath, maxDepth);

      if (distance === 0) {
        results.push({
          server_id: dep.source_server_id,
          server_name: dep.source_name || undefined,
          server_ip: dep.source_ip || undefined,
          direction: 'upstream',
          distance: 1,
          path: newPath,
        });
      }

      results.push(...childResults);
    }

    return results;
  }

  private findDownstream(serverId: string, visited: Set<string> = new Set(), distance = 0, path: string[] = [], maxDepth = 10): AffectedService[] {
    if (visited.has(serverId) || distance >= maxDepth) return [];
    visited.add(serverId);

    const server = db.prepare('SELECT id, name, hostname FROM servers WHERE id = ?').get(serverId) as ServerDB | undefined;
    if (!server) return [];

    const deps = db.prepare(`
      SELECT st.*, s.name as target_name, s.hostname as target_ip
      FROM service_topologies st
      LEFT JOIN servers s ON st.target_server_id = s.id
      WHERE st.source_server_id = ? AND st.status = 'active'
    `).all(serverId) as (DependencyDB & { target_name: string | null; target_ip: string | null })[];

    const results: AffectedService[] = [];

    for (const dep of deps) {
      const newPath = [...path, serverId];
      const childResults = this.findDownstream(dep.target_server_id, visited, distance + 1, newPath, maxDepth);

      if (distance === 0) {
        results.push({
          server_id: dep.target_server_id,
          server_name: dep.target_name || undefined,
          server_ip: dep.target_ip || undefined,
          direction: 'downstream',
          distance: 1,
          path: newPath,
        });
      }

      results.push(...childResults);
    }

    return results;
  }

  private getDependencyById(id: string): DependencyDB | undefined {
    return db.prepare('SELECT * FROM service_topologies WHERE id = ?').get(id) as DependencyDB | undefined;
  }

  private serverToNode(server: ServerDB): TopologyNode {
    return {
      id: server.id,
      server_id: server.id,
      server_name: server.name,
      server_ip: server.ip_address || server.private_ip || server.hostname,
      name: server.name,
      ip: server.ip_address || server.private_ip || server.hostname,
      type: 'server',
      status: server.enabled === 0 ? 'offline' : 'online',
      metadata: {
        hostname: server.hostname,
        ip_address: server.ip_address,
        private_ip: server.private_ip,
      },
    };
  }

  private getNetworkDeviceNodes(): TopologyNode[] {
    const devices = db.prepare(`
      SELECT id, name, ip_address, vendor, model, role, location, status
      FROM network_devices
      ORDER BY name
    `).all() as NetworkDeviceDB[];

    return devices.map((device) => ({
      id: `network-device:${device.id}`,
      name: device.name,
      ip: device.ip_address,
      type: 'network_device',
      status: this.normalizeAssetStatus(device.status),
      metadata: {
        asset_id: device.id,
        vendor: device.vendor,
        model: device.model,
        role: device.role,
        location: device.location,
      },
    }));
  }

  private getCloudNativeTopology(servers: ServerDB[]): TopologyGraph {
    const nodes: TopologyNode[] = [];
    const edges: TopologyEdge[] = [];

    const clusters = db.prepare(`
      SELECT id, name, environment, distribution, version, status, enabled
      FROM kubernetes_clusters
      ORDER BY name
    `).all() as KubernetesClusterDB[];

    const kubernetesNodes = db.prepare(`
      SELECT id, cluster_id, server_id, name, internal_ip, external_ip, role, status
      FROM kubernetes_nodes
      ORDER BY name
    `).all() as KubernetesNodeDB[];

    for (const cluster of clusters) {
      const clusterNodeId = this.kubernetesAssetId('cluster', cluster.id);
      nodes.push({
        id: clusterNodeId,
        name: cluster.name,
        type: 'kubernetes_cluster',
        status: this.normalizeAssetStatus(cluster.status, cluster.enabled),
        metadata: {
          asset_id: cluster.id,
          environment: cluster.environment,
          distribution: cluster.distribution,
          version: cluster.version,
        },
      });
    }

    const linkedServerIdsByCluster = new Map<string, Set<string>>();
    const addClusterServerEdge = (
      clusterId: string,
      serverId: string,
      source: string,
      metadata: Record<string, unknown> = {}
    ) => {
      if (!linkedServerIdsByCluster.has(clusterId)) {
        linkedServerIdsByCluster.set(clusterId, new Set());
      }
      const linkedServerIds = linkedServerIdsByCluster.get(clusterId)!;
      if (linkedServerIds.has(serverId)) return;
      linkedServerIds.add(serverId);
      edges.push(this.assetEdge(
        `k8s-cluster-server:${clusterId}:${serverId}`,
        this.kubernetesAssetId('cluster', clusterId),
        serverId,
        'backed_by',
        'active',
        { source, ...metadata }
      ));
    };

    for (const node of kubernetesNodes) {
      const serverId = this.findServerForKubernetesNode(node, servers);
      if (!serverId) continue;
      addClusterServerEdge(
        node.cluster_id,
        serverId,
        node.server_id ? 'kubernetes_node_binding' : 'kubernetes_node_match',
        { node_id: node.id, node_name: node.name }
      );
    }

    for (const cluster of clusters) {
      const groupServers = this.findServerIdsForKubernetesClusterGroups(cluster);
      for (const groupServer of groupServers) {
        addClusterServerEdge(
          cluster.id,
          groupServer.server_id,
          'server_group_cluster_match',
          { group_name: groupServer.group_name }
        );
      }
    }

    return { nodes, edges };
  }

  private kubernetesAssetId(kind: 'cluster' | 'node' | 'namespace' | 'workload' | 'pod' | 'service', id: string): string {
    return `k8s-${kind}:${id}`;
  }

  private assetEdge(id: string, source: string, target: string, dependencyType: string, status: string, metadata?: Record<string, unknown>): TopologyEdge {
    return {
      id,
      source,
      target,
      dependency_type: dependencyType,
      protocol: dependencyType,
      status,
      metadata,
    };
  }

  private normalizeAssetStatus(status?: string | null, enabled = 1): string {
    if (enabled === 0) return 'offline';
    const value = String(status || '').toLowerCase();
    if (!value || value === 'unknown' || value === 'pending') return 'warning';
    if (['online', 'active', 'healthy', 'ready', 'running', 'succeeded'].includes(value)) return 'online';
    if (['offline', 'disabled', 'stopped', 'terminated'].includes(value)) return 'offline';
    if (['failed', 'error', 'unhealthy', 'notready', 'crashloopbackoff'].includes(value)) return 'error';
    return 'warning';
  }

  private findServerForKubernetesNode(node: KubernetesNodeDB | undefined, servers: ServerDB[]): string | null {
    if (!node) return null;
    if (node.server_id) {
      const boundServer = servers.find((server) => server.id === node.server_id);
      return boundServer && this.isKubernetesNodeAddressMatch(node, boundServer) ? boundServer.id : null;
    }

    const candidates = [node.internal_ip, node.external_ip]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    const matched = servers.find((server) => {
      const serverCandidates = [server.id, server.hostname, server.ip_address, server.private_ip]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return candidates.some((candidate) => serverCandidates.includes(candidate));
    });

    return matched?.id || null;
  }

  private isKubernetesNodeAddressMatch(node: KubernetesNodeDB, server: ServerDB): boolean {
    const nodeAddresses = [node.internal_ip, node.external_ip]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    if (nodeAddresses.length === 0) return false;

    const serverAddresses = [server.hostname, server.ip_address, server.private_ip]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    return nodeAddresses.some((address) => serverAddresses.includes(address));
  }

  private findServerIdsForKubernetesClusterGroups(cluster: KubernetesClusterDB): ClusterServerGroupMappingDB[] {
    const clusterName = this.normalizeClusterAssociationName(cluster.name);
    if (!clusterName) return [];

    const mappings = db.prepare(`
      SELECT sgm.server_id, sg.name AS group_name
      FROM server_group_mapping sgm
      JOIN server_groups sg ON sg.id = sgm.group_id
      JOIN servers s ON s.id = sgm.server_id
      WHERE s.enabled != 0
      ORDER BY sg.name, s.name
    `).all() as ClusterServerGroupMappingDB[];

    return mappings.filter((mapping) => {
      const groupName = this.normalizeClusterAssociationName(mapping.group_name);
      if (!groupName) return false;
      return clusterName === groupName || clusterName.includes(groupName) || groupName.includes(clusterName);
    });
  }

  private normalizeClusterAssociationName(value: string | null | undefined): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/kubernetes/g, 'k8s')
      .replace(/\bcluster\b/g, '')
      .replace(/集群/g, '')
      .replace(/[\s_-]+/g, '');
  }

  private findServerByHostIp(hostIp: string | null, servers: ServerDB[]): string | null {
    if (!hostIp) return null;
    const normalizedHostIp = hostIp.trim().toLowerCase();
    const matched = servers.find((server) => [server.hostname, server.ip_address, server.private_ip]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
      .includes(normalizedHostIp));
    return matched?.id || null;
  }

  private findWorkloadForPod(pod: KubernetesPodDB, workloads: KubernetesWorkloadDB[]): KubernetesWorkloadDB | undefined {
    const podLabels = this.parseJsonObject(pod.labels);
    return workloads.find((workload) => {
      if (workload.cluster_id !== pod.cluster_id || workload.namespace !== pod.namespace) return false;
      if (pod.name.startsWith(`${workload.name}-`)) return true;
      return this.labelValueMatchesWorkloadName(podLabels, workload.name);
    });
  }

  private findWorkloadForService(service: KubernetesServiceDB, workloads: KubernetesWorkloadDB[]): KubernetesWorkloadDB | undefined {
    const selector = this.parseJsonObject(service.selector);
    return workloads.find((workload) => {
      if (workload.cluster_id !== service.cluster_id || workload.namespace !== service.namespace) return false;
      const workloadLabels = this.parseJsonObject(workload.labels);
      const selectorEntries = Object.entries(selector);
      if (selectorEntries.length > 0 && selectorEntries.every(([key, value]) => workloadLabels[key] === value)) {
        return true;
      }
      return this.labelValueMatchesWorkloadName(selector, workload.name);
    });
  }

  private labelValueMatchesWorkloadName(labels: Record<string, unknown>, workloadName: string): boolean {
    return ['app', 'app.kubernetes.io/name', 'app.kubernetes.io/instance', 'component'].some((key) => labels[key] === workloadName);
  }

  private parseJsonObject(value: string | null): Record<string, unknown> {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  private dependencyToEdge(dep: DependencyDB & { source_name?: string | null; source_ip?: string | null; target_name?: string | null; target_ip?: string | null }): TopologyEdge {
    return {
      id: dep.id,
      source: dep.source_server_id,
      target: dep.target_server_id,
      dependency_type: dep.dependency_type,
      protocol: dep.protocol || undefined,
      port: dep.port || undefined,
      status: dep.status,
    };
  }

  private edgeToTopologyEdge(dep: DependencyDB): TopologyEdge {
    return {
      id: dep.id,
      source: dep.source_server_id,
      target: dep.target_server_id,
      dependency_type: dep.dependency_type,
      protocol: dep.protocol || undefined,
      port: dep.port || undefined,
      status: dep.status,
    };
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const topologyService = new TopologyService();
