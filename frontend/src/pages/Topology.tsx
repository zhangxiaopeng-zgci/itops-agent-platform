import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, RefreshCw, Plus, ArrowDown, X } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import TopologyGraph from '../components/TopologyGraph';
import type { TopologyNode, TopologyEdge } from '../components/TopologyGraph';
import { useToast } from '../contexts/ToastContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface Dependency {
  id?: string;
  source: string;
  target: string;
  type: string;
  protocol: string;
  status: 'active' | 'inactive' | 'degraded';
  call_count?: number;
  avg_latency?: number;
}

interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

interface ApiTopologyNode {
  id: string;
  server_id?: string;
  server_name?: string;
  server_ip?: string;
  name?: string;
  ip?: string;
  status?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  x?: number;
  y?: number;
}

interface ApiTopologyEdge {
  id?: string;
  source: string;
  target: string;
  dependency_type?: string;
  type?: string;
  protocol?: string;
  status?: TopologyEdge['status'];
}

interface Server {
  id: string;
  name: string;
  hostname: string;
}

const protocolColors: Record<string, string> = {
  http: 'bg-blue-100 text-blue-700',
  https: 'bg-blue-100 text-blue-700',
  grpc: 'bg-purple-100 text-purple-700',
  tcp: 'bg-gray-100 text-gray-700',
  mysql: 'bg-orange-100 text-orange-700',
  redis: 'bg-red-100 text-red-700',
  kafka: 'bg-green-100 text-green-700',
  amqp: 'bg-yellow-100 text-yellow-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  degraded: 'bg-yellow-100 text-yellow-700',
};

function DeleteDependencyButton({ dependencyId }: { dependencyId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useLocale();
  
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/api/topology/dependency/${dependencyId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topology'] });
      toast.success(t('topology.toast.dependencyDeleted'));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || t('topology.toast.deleteFailed'));
    },
  });

  return (
    <button
      onClick={() => deleteMutation.mutate()}
      disabled={deleteMutation.isPending}
      className="px-3 py-1 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50"
    >
      {deleteMutation.isPending ? t('topology.action.deleting') : t('common.delete')}
    </button>
  );
}

export default function Topology() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useLocale();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    source_server_id: '',
    target_server_id: '',
    dependency_type: '',
    protocol: 'http',
    port: 80,
  });
  const [isDiscovering, setIsDiscovering] = useState(false);

  const { data: topologyData, isLoading: topologyLoading, refetch: refetchTopology } = useQuery({
    queryKey: ['topology', 'global'],
    queryFn: async () => {
      const res = await api.get('/api/topology/global');
      return normalizeTopologyData(res.data.data);
    },
  });

  const { data: dependencies, isLoading: depsLoading } = useQuery({
    queryKey: ['topology', 'dependencies'],
    queryFn: async () => {
      const res = await api.get('/api/topology/dependency');
      return normalizeDependencies(res.data.data);
    },
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as Server[];
    },
  });

  const assetSummary = useMemo(() => buildAssetSummary(topologyData, t), [topologyData, t]);
  const localizedStatusLabels = useMemo(() => ({
    active: t('topology.status.active'),
    inactive: t('topology.status.inactive'),
    degraded: t('topology.status.degraded'),
  }), [t]);

  const addDependencyMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/api/topology/dependency', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topology'] });
      toast.success(t('topology.toast.dependencyAdded'));
      setIsAddModalOpen(false);
      setFormData({
        source_server_id: '',
        target_server_id: '',
        dependency_type: '',
        protocol: 'http',
        port: 80,
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || t('topology.toast.addFailed'));
    },
  });

  const handleDiscoverDependencies = async () => {
    if (!servers || servers.length === 0) {
      toast.warning(t('topology.toast.noServers'));
      return;
    }
    
    setIsDiscovering(true);
    try {
      for (const server of servers) {
        try {
          await api.post(`/api/topology/discover/${server.id}`);
        } catch {
          // 单个服务器失败不影响其他服务器
        }
      }
      queryClient.invalidateQueries({ queryKey: ['topology'] });
      toast.success(t('topology.toast.discoveryDone'));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('topology.toast.discoveryFailed'));
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('topology.title')}</h1>
            <p className="text-text-secondary text-sm mt-0.5">{t('topology.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchTopology()}
            disabled={topologyLoading}
            className="px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-background rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4', topologyLoading && 'animate-spin')} />
            {t('common.refresh')}
          </button>
          <button
            onClick={handleDiscoverDependencies}
            disabled={isDiscovering}
            className="px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-background rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 transition-colors"
          >
            <ArrowDown className={clsx('w-4 h-4', isDiscovering && 'animate-spin')} />
            {t('topology.action.discover')}
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('topology.action.add')}
          </button>
        </div>
      </div>

      {/* 添加依赖模态框 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-text-primary">{t('topology.modal.addDependency')}</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-background rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('topology.field.sourceServer')}</label>
                <select
                  value={formData.source_server_id}
                  onChange={(e) => setFormData({ ...formData, source_server_id: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">{t('topology.placeholder.selectSource')}</option>
                  {servers?.map((server) => (
                    <option key={server.id} value={server.id}>{server.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('topology.field.targetServer')}</label>
                <select
                  value={formData.target_server_id}
                  onChange={(e) => setFormData({ ...formData, target_server_id: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">{t('topology.placeholder.selectTarget')}</option>
                  {servers?.map((server) => (
                    <option key={server.id} value={server.id}>{server.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('topology.field.dependencyType')}</label>
                <input
                  type="text"
                  value={formData.dependency_type}
                  onChange={(e) => setFormData({ ...formData, dependency_type: e.target.value })}
                  placeholder={t('topology.placeholder.dependencyType')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('topology.field.protocol')}</label>
                  <select
                    value={formData.protocol}
                    onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="tcp">TCP</option>
                    <option value="mysql">MySQL</option>
                    <option value="redis">Redis</option>
                    <option value="kafka">Kafka</option>
                    <option value="grpc">gRPC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('topology.field.port')}</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-background rounded-lg transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => addDependencyMutation.mutate(formData)}
                  disabled={addDependencyMutation.isPending || !formData.source_server_id || !formData.target_server_id || !formData.dependency_type}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addDependencyMutation.isPending ? t('topology.action.adding') : t('topology.action.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        <div className="grid gap-3 md:grid-cols-4">
          {assetSummary.map((item) => (
            <div key={item.key} className="rounded-lg border border-border bg-surface p-4">
              <div className="text-xs text-text-secondary">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-text-primary">{item.value}</div>
              <div className="mt-1 text-xs text-text-tertiary">{item.helper}</div>
            </div>
          ))}
        </div>

        <div className="bg-surface rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary mb-3">{t('topology.view.title')}</h2>
          {topologyLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <TopologyGraph
              nodes={topologyData?.nodes || []}
              edges={topologyData?.edges || []}
              height={500}
            />
          )}
        </div>

        <div className="bg-surface rounded-xl border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-text-primary">{t('topology.dependencies.title')}</h2>
          </div>
          {depsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('topology.table.source')}</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('topology.table.target')}</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('topology.table.type')}</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('topology.table.protocol')}</th>
                    <th className="text-left px-4 py-3 font-medium text-text-secondary">{t('topology.table.status')}</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">{t('topology.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dependencies?.map((dep, idx) => {
                    const sourceServer = servers?.find((s) => s.id === dep.source);
                    const targetServer = servers?.find((s) => s.id === dep.target);
                    return (
                      <tr
                        key={dep.id || idx}
                        className="border-b border-border/50 hover:bg-background/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-text-primary font-medium">{sourceServer?.name || dep.source}</td>
                        <td className="px-4 py-3 text-text-primary">{targetServer?.name || dep.target}</td>
                        <td className="px-4 py-3 text-text-secondary">{dep.type}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', protocolColors[dep.protocol?.toLowerCase()] || 'bg-gray-100 text-gray-700')}>
                            {(dep.protocol || '').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', statusColors[dep.status] || 'bg-gray-100 text-gray-700')}>
                            {localizedStatusLabels[dep.status] || dep.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {dep.id && (
                            <DeleteDependencyButton dependencyId={dep.id} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {dependencies?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                        {t('topology.empty.dependencies')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function normalizeTopologyData(value: unknown): TopologyData {
  const data = value && typeof value === 'object' ? value as { nodes?: ApiTopologyNode[]; edges?: ApiTopologyEdge[] } : {};

  return {
    nodes: Array.isArray(data.nodes)
      ? data.nodes.map((node) => ({
        id: node.id,
        name: node.name || node.server_name || node.server_id || node.id,
        status: normalizeGraphStatus(node.status),
        ip: node.ip || node.server_ip,
        assetType: node.type || 'server',
        metadata: node.metadata,
        x: node.x,
        y: node.y
      }))
      : [],
    edges: Array.isArray(data.edges)
      ? data.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        protocol: edge.protocol || edge.type || edge.dependency_type,
        status: edge.status || 'active'
      }))
      : []
  };
}

function normalizeGraphStatus(status?: string): TopologyNode['status'] {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'root_cause' || normalized === 'affected') return normalized;
  if (['online', 'offline', 'warning', 'error'].includes(normalized)) return normalized as TopologyNode['status'];
  if (['active', 'healthy', 'ready', 'running', 'succeeded'].includes(normalized)) return 'online';
  if (['failed', 'unhealthy', 'notready'].includes(normalized)) return 'error';
  if (['disabled', 'stopped', 'terminated'].includes(normalized)) return 'offline';
  return 'warning';
}

function buildAssetSummary(topologyData: TopologyData | undefined, t: (key: MessageKey) => string): Array<{ key: string; label: string; value: number; helper: string }> {
  const nodes = topologyData?.nodes || [];
  const edges = topologyData?.edges || [];
  const count = (predicate: (node: TopologyNode) => boolean) => nodes.filter(predicate).length;

  return [
    {
      key: 'servers',
      label: t('topology.summary.servers'),
      value: count((node) => node.assetType === 'server'),
      helper: t('topology.summary.serversHelper'),
    },
    {
      key: 'network',
      label: t('topology.summary.network'),
      value: count((node) => node.assetType === 'network_device'),
      helper: t('topology.summary.networkHelper'),
    },
    {
      key: 'clusters',
      label: t('topology.summary.clusters'),
      value: count((node) => node.assetType === 'kubernetes_cluster'),
      helper: t('topology.summary.clustersHelper'),
    },
    {
      key: 'edges',
      label: t('topology.summary.edges'),
      value: edges.length,
      helper: t('topology.summary.edgesHelper'),
    },
  ];
}

function normalizeDependencies(value: unknown): Dependency[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((dep: ApiTopologyEdge) => ({
    id: dep.id,
    source: dep.source,
    target: dep.target,
    type: dep.type || dep.dependency_type || '-',
    protocol: dep.protocol || '-',
    status: dep.status || 'active'
  }));
}
