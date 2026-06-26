import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Eye,
  ExternalLink,
  KeyRound,
  Layers3,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface KubernetesCluster {
  id: string;
  name: string;
  api_server_url?: string | null;
  environment?: string | null;
  distribution?: string | null;
  version?: string | null;
  auth_type: 'kubeconfig' | 'token' | 'certificate';
  credential_id?: string | null;
  status: string;
  enabled: number;
  last_sync_at?: string | null;
  last_error?: string | null;
  description?: string | null;
  node_count: number;
  namespace_count: number;
  workload_count: number;
  pod_count: number;
  service_count: number;
  event_count: number;
  node_bound_count: number;
  bound_server_count: number;
}

interface KubernetesNode {
  id: string;
  name: string;
  internal_ip?: string | null;
  external_ip?: string | null;
  role?: string | null;
  status: string;
  server_id?: string | null;
  server_name?: string | null;
  server_hostname?: string | null;
  server_ip_address?: string | null;
  server_private_ip?: string | null;
  binding_source?: 'auto' | 'manual' | 'stale' | 'unbound' | string;
}

interface KubernetesNamespace {
  id: string;
  name: string;
  status: string;
}

interface KubernetesWorkload {
  id: string;
  namespace: string;
  name: string;
  kind: string;
  replicas?: number | null;
  ready_replicas?: number | null;
  status: string;
}

interface KubernetesPod {
  id: string;
  namespace: string;
  name: string;
  phase: string;
  ready: number;
  restart_count: number;
}

interface KubernetesServiceItem {
  id: string;
  namespace: string;
  name: string;
  type?: string | null;
  cluster_ip?: string | null;
}

interface KubernetesEvent {
  id: string;
  namespace?: string | null;
  involved_kind?: string | null;
  involved_name?: string | null;
  type?: string | null;
  reason?: string | null;
  message?: string | null;
  last_seen_at?: string | null;
}

interface KubernetesBackingHost {
  server_id: string;
  server_name: string;
  server_hostname: string;
  server_ip_address?: string | null;
  server_private_ip?: string | null;
  server_enabled?: number;
  source: 'kubernetes_node_binding' | 'kubernetes_node_match' | 'server_group_cluster_match' | string;
  node_name?: string | null;
  group_name?: string | null;
}

interface KubernetesClusterAssets {
  cluster: KubernetesCluster;
  backing_hosts?: KubernetesBackingHost[];
  nodes: KubernetesNode[];
  namespaces: KubernetesNamespace[];
  workloads: KubernetesWorkload[];
  pods: KubernetesPod[];
  services: KubernetesServiceItem[];
  events: KubernetesEvent[];
}

interface CredentialOption {
  id: string;
  name: string;
  credential_type: 'token' | 'kubeconfig' | 'certificate';
  username?: string | null;
  usage_count?: number;
  has_token?: number;
  has_kubeconfig?: number;
  has_certificate?: number;
  description?: string | null;
  server_url?: string | null;
}

interface CredentialClusterUsage {
  id: string;
  name: string;
  environment?: string | null;
  auth_type: KubernetesCluster['auth_type'];
  api_server_url?: string | null;
  last_sync_at?: string | null;
}

interface CredentialDetail extends CredentialOption {
  created_at?: string;
  updated_at?: string;
  parsed_server_url?: string | null;
  clusters: CredentialClusterUsage[];
}

interface ServerOption {
  id: string;
  name: string;
  hostname?: string | null;
  ip_address?: string | null;
  private_ip?: string | null;
  enabled: number;
}

const emptyForm = {
  name: '',
  api_server_url: '',
  environment: 'production',
  distribution: '',
  version: '',
  auth_type: 'kubeconfig' as KubernetesCluster['auth_type'],
  credential_id: '',
  description: '',
};

const emptyCredentialForm = {
  name: '',
  credential_type: 'token' as CredentialOption['credential_type'],
  username: '',
  token: '',
  kubeconfig: '',
  server_url: '',
  description: '',
};

const inputClass = 'w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary';
type KubernetesSection = 'overview' | 'clusters' | 'credentials';

function toArray<T>(value: unknown, keys: string[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export default function KubernetesClusters() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KubernetesCluster | null>(null);
  const [detailCluster, setDetailCluster] = useState<KubernetesCluster | null>(null);
  const [syncTarget, setSyncTarget] = useState<KubernetesCluster | null>(null);
  const [editingCluster, setEditingCluster] = useState<KubernetesCluster | null>(null);
  const [assetSnapshotText, setAssetSnapshotText] = useState('');
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [credentialDetail, setCredentialDetail] = useState<CredentialDetail | null>(null);
  const [deleteCredentialTarget, setDeleteCredentialTarget] = useState<CredentialOption | null>(null);
  const [bindingTarget, setBindingTarget] = useState<KubernetesNode | null>(null);
  const [bindingServerId, setBindingServerId] = useState('');
  const [activeSection, setActiveSection] = useState<KubernetesSection>('overview');
  const [formData, setFormData] = useState(emptyForm);
  const [credentialForm, setCredentialForm] = useState(emptyCredentialForm);
  const isAdmin = user?.role === 'admin';
  const canOperateBindings = isAdmin || user?.role === 'operator';

  useEscapeKey({
    onEscape: () => {
      setIsModalOpen(false);
      setEditingCluster(null);
      setFormData(emptyForm);
    },
    enabled: isModalOpen,
  });
  useEscapeKey({ onEscape: () => setDeleteTarget(null), enabled: !!deleteTarget });
  useEscapeKey({ onEscape: () => setDetailCluster(null), enabled: !!detailCluster });
  useEscapeKey({ onEscape: () => setSyncTarget(null), enabled: !!syncTarget });
  useEscapeKey({ onEscape: () => setIsCredentialModalOpen(false), enabled: isCredentialModalOpen });
  useEscapeKey({ onEscape: () => setCredentialDetail(null), enabled: !!credentialDetail });
  useEscapeKey({ onEscape: () => setDeleteCredentialTarget(null), enabled: !!deleteCredentialTarget });
  useEscapeKey({ onEscape: () => setBindingTarget(null), enabled: !!bindingTarget });

  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ['kubernetes-clusters'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-clusters');
      return res.data.data as KubernetesCluster[];
    },
  });
  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials', 'kubernetes'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-credentials');
      return res.data.data as CredentialOption[];
    },
  });
  const { data: servers = [] } = useQuery({
    queryKey: ['servers', 'kubernetes-binding'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerOption>(res.data.data, ['servers', 'items']);
    },
  });
  const { data: clusterAssets, isFetching: isFetchingAssets } = useQuery({
    queryKey: ['kubernetes-cluster-assets', detailCluster?.id],
    enabled: Boolean(detailCluster),
    queryFn: async () => {
      const res = await api.get(`/api/kubernetes-clusters/${detailCluster!.id}/assets`);
      return res.data.data as KubernetesClusterAssets;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/kubernetes-clusters', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      setFormData(emptyForm);
      setIsModalOpen(false);
      toast.success(t('kubernetes.toast.created'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('kubernetes.toast.createFailed'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCluster) throw new Error('No cluster selected');
      const res = await api.put(`/api/kubernetes-clusters/${editingCluster.id}`, formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      closeClusterModal();
      toast.success(t('kubernetes.toast.updated'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('kubernetes.toast.updateFailed'));
    },
  });

  const createCredentialMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/kubernetes-credentials', credentialForm);
      return res.data.data as { id: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credentials', 'kubernetes'] });
      const createdType = credentialForm.credential_type;
      setCredentialForm(emptyCredentialForm);
      setIsCredentialModalOpen(false);
      setFormData((current) => ({ ...current, auth_type: createdType, credential_id: result.id }));
      toast.success(t('kubernetes.credential.toast.created'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.credential.toast.createFailed'));
    },
  });

  const credentialDetailMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/api/kubernetes-credentials/${id}`);
      return res.data.data as CredentialDetail;
    },
    onSuccess: (result) => {
      setCredentialDetail(result);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.credential.toast.detailFailed'));
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/kubernetes-credentials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials', 'kubernetes'] });
      setDeleteCredentialTarget(null);
      toast.success(t('kubernetes.credential.toast.deleted'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.credential.toast.deleteFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/kubernetes-clusters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      setDeleteTarget(null);
      toast.success(t('kubernetes.toast.deleted'));
    },
    onError: () => {
      toast.error(t('kubernetes.toast.deleteFailed'));
    },
  });

  const testMutation = useMutation({
    mutationFn: async (cluster: KubernetesCluster) => {
      const res = await api.post(`/api/kubernetes-clusters/${cluster.id}/test-connection`);
      return res.data.data as { success: boolean; message: string };
    },
    onSuccess: (result) => {
      toast.success(result.message || t('kubernetes.toast.configReady'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.data?.message || error?.response?.data?.error || t('kubernetes.toast.configInvalid'));
    },
  });

  const syncAssetsMutation = useMutation({
    mutationFn: async ({ clusterId, snapshot }: { clusterId: string; snapshot: unknown }) => {
      const res = await api.post(`/api/kubernetes-clusters/${clusterId}/sync-assets`, snapshot);
      return res.data.data as { counts: { nodes: number; namespaces: number; workloads: number; pods: number; services: number; events: number; boundServers: number; autoCreatedHosts: number } };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      setSyncTarget(null);
      setAssetSnapshotText('');
      toast.success(t('kubernetes.toast.synced', {
        nodes: result.counts.nodes,
        pods: result.counts.pods,
        bound: result.counts.boundServers,
        created: result.counts.autoCreatedHosts,
      }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.toast.syncFailed'));
    },
  });

  const syncLiveMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const res = await api.post(`/api/kubernetes-clusters/${clusterId}/sync-live`);
      return res.data.data as { counts: { nodes: number; namespaces: number; workloads: number; pods: number; services: number; events: number; boundServers: number; autoCreatedHosts: number } };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      toast.success(t('kubernetes.toast.liveSynced', {
        nodes: result.counts.nodes,
        pods: result.counts.pods,
        bound: result.counts.boundServers,
        created: result.counts.autoCreatedHosts,
      }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.toast.liveSyncFailed'));
    },
  });

  const reconcileBindingsMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const res = await api.post(`/api/kubernetes-clusters/${clusterId}/reconcile-bindings`);
      return res.data.data as { matched: number; unresolved: number; alreadyBound: number; totalNodes: number; autoCreatedHosts: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'ops-overview'] });
      toast.success(t('kubernetes.binding.toast.reconciled', {
        matched: result.matched,
        unresolved: result.unresolved,
        created: result.autoCreatedHosts,
      }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.binding.toast.reconcileFailed'));
    },
  });

  const updateBindingMutation = useMutation({
    mutationFn: async ({ clusterId, nodeId, serverId }: { clusterId: string; nodeId: string; serverId: string | null }) => {
      const res = await api.patch(`/api/kubernetes-clusters/${clusterId}/nodes/${nodeId}/binding`, { server_id: serverId });
      return res.data.data as KubernetesNode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'ops-overview'] });
      setBindingTarget(null);
      setBindingServerId('');
      toast.success(t('kubernetes.binding.toast.updated'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.binding.toast.updateFailed'));
    },
  });

  const filteredClusters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return clusters;
    return clusters.filter((cluster) =>
      [cluster.name, cluster.api_server_url, cluster.environment, cluster.distribution, cluster.version]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [clusters, searchQuery]);

  const totals = useMemo(() => {
    return clusters.reduce(
      (acc, cluster) => ({
        nodes: acc.nodes + cluster.node_count,
        pods: acc.pods + cluster.pod_count,
        workloads: acc.workloads + cluster.workload_count,
        nodeBound: acc.nodeBound + (cluster.node_bound_count ?? cluster.bound_server_count),
        boundServers: acc.boundServers + cluster.bound_server_count,
      }),
      { nodes: 0, pods: 0, workloads: 0, nodeBound: 0, boundServers: 0 }
    );
  }, [clusters]);

  const bindingStats = useMemo(() => {
    const unbound = Math.max(totals.nodes - totals.nodeBound, 0);
    const ratio = totals.nodes > 0 ? Math.round((totals.nodeBound / totals.nodes) * 100) : 100;
    return { unbound, ratio };
  }, [totals]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (editingCluster) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const handleCredentialSubmit = (event: FormEvent) => {
    event.preventDefault();
    createCredentialMutation.mutate();
  };

  const openSyncModal = (cluster: KubernetesCluster) => {
    setSyncTarget(cluster);
    setAssetSnapshotText(`{
  "nodes": [
    {
      "name": "k8s-node01",
      "internal_ip": "10.1.132.58",
      "role": "worker",
      "status": "Ready",
      "kubelet_version": "v1.29.0"
    }
  ],
  "namespaces": [
    { "name": "default", "status": "Active" }
  ],
  "workloads": [
    { "namespace": "default", "kind": "Deployment", "name": "nginx", "replicas": 2, "ready_replicas": 2, "status": "Ready" }
  ],
  "pods": [
    { "namespace": "default", "name": "nginx-0", "phase": "Running", "node_name": "k8s-node01", "ready": true, "restart_count": 0 }
  ],
  "services": [
    { "namespace": "default", "name": "nginx", "type": "ClusterIP", "cluster_ip": "10.96.0.10" }
  ],
  "events": []
}`);
  };

  const handleSyncAssets = () => {
    if (!syncTarget) return;
    try {
      const snapshot = JSON.parse(assetSnapshotText);
      syncAssetsMutation.mutate({ clusterId: syncTarget.id, snapshot });
    } catch {
      toast.error(t('kubernetes.toast.invalidSnapshot'));
    }
  };

  const openHermesDiagnosis = (cluster: KubernetesCluster) => {
    const prompt = t('kubernetes.hermesPrompt', {
      name: cluster.name,
      environment: cluster.environment || t('common.unknown'),
      apiServer: cluster.api_server_url || t('kubernetes.noApiServer'),
    });
    navigate(`/hermes?mode=diagnose&prompt=${encodeURIComponent(prompt)}&knowledgeCategory=${encodeURIComponent('kubernetes')}`);
  };

  const openCreateClusterModal = () => {
    setEditingCluster(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEditClusterModal = (cluster: KubernetesCluster) => {
    setEditingCluster(cluster);
    setFormData({
      name: cluster.name || '',
      api_server_url: cluster.api_server_url || '',
      environment: cluster.environment || '',
      distribution: cluster.distribution || '',
      version: cluster.version || '',
      auth_type: cluster.auth_type || 'kubeconfig',
      credential_id: cluster.credential_id || '',
      description: cluster.description || '',
    });
    setIsModalOpen(true);
  };

  const closeClusterModal = () => {
    setIsModalOpen(false);
    setEditingCluster(null);
    setFormData(emptyForm);
  };

  const openBindingModal = (node: KubernetesNode) => {
    setBindingTarget(node);
    setBindingServerId(node.server_id || '');
  };

  const submitBinding = () => {
    if (!detailCluster || !bindingTarget) return;
    updateBindingMutation.mutate({
      clusterId: detailCluster.id,
      nodeId: bindingTarget.id,
      serverId: bindingServerId || null,
    });
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('kubernetes.title')}</h1>
              <p className="text-text-secondary mt-1">{t('kubernetes.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/kubernetes-console')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t('kubernetes.openConsole')}
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => setIsCredentialModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('kubernetes.credential.add')}
                </button>
                <button
                  onClick={openCreateClusterModal}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('kubernetes.add')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
          <SectionTab
            active={activeSection === 'overview'}
            icon={<Layers3 className="w-4 h-4" />}
            label={t('kubernetes.section.overview')}
            onClick={() => setActiveSection('overview')}
          />
          <SectionTab
            active={activeSection === 'clusters'}
            icon={<Cloud className="w-4 h-4" />}
            label={t('kubernetes.section.clusters')}
            onClick={() => setActiveSection('clusters')}
          />
          <SectionTab
            active={activeSection === 'credentials'}
            icon={<KeyRound className="w-4 h-4" />}
            label={t('kubernetes.section.credentials')}
            onClick={() => setActiveSection('credentials')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard icon={Cloud} label={t('kubernetes.metric.clusters')} value={clusters.length} />
          <MetricCard icon={Server} label={t('kubernetes.metric.nodes')} value={totals.nodes} />
          <MetricCard icon={Boxes} label={t('kubernetes.metric.workloads')} value={totals.workloads} />
          <MetricCard icon={Link2} label={t('kubernetes.metric.boundServers')} value={totals.boundServers} />
        </div>

        <section className="bg-surface border border-border rounded-lg p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.binding.title')}</h2>
              <p className="text-sm text-text-secondary mt-1">
                {t('kubernetes.binding.subtitle')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                <span className="rounded-full border border-border bg-background/60 px-2.5 py-1">{t('kubernetes.binding.workflow.auto')}</span>
                <span className="rounded-full border border-border bg-background/60 px-2.5 py-1">{t('kubernetes.binding.workflow.manual')}</span>
                <span className="rounded-full border border-border bg-background/60 px-2.5 py-1">{t('kubernetes.binding.workflow.topology')}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <BindingStat label={t('kubernetes.binding.boundRatio')} value={`${bindingStats.ratio}%`} />
              <BindingStat label={t('kubernetes.binding.unboundNodes')} value={bindingStats.unbound} />
              <BindingStat label={t('kubernetes.binding.boundServers')} value={totals.boundServers} />
            </div>
          </div>
        </section>

        {activeSection === 'overview' && (
          <div className="bg-surface border border-border rounded-lg">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.overview.title')}</h2>
              <p className="text-sm text-text-secondary mt-1">{t('kubernetes.overview.subtitle')}</p>
            </div>
            {clusters.length === 0 ? (
              <div className="p-8 text-center">
                <Boxes className="w-10 h-10 text-text-secondary mx-auto mb-3" />
                <p className="font-semibold text-text-primary">{t('kubernetes.empty.title')}</p>
                <p className="text-sm text-text-secondary mt-1">{t('kubernetes.empty.desc')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {clusters.map((cluster) => (
                  <div key={cluster.id} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary truncate">{cluster.name}</h3>
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-text-secondary">
                          {cluster.environment || t('common.unknown')}
                        </span>
                        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-text-secondary">
                          {cluster.auth_type}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary break-all">{cluster.api_server_url || t('kubernetes.noApiServer')}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
                      <MiniMetric label={t('kubernetes.metric.nodes')} value={cluster.node_count} />
                      <MiniMetric label={t('kubernetes.metric.boundServers')} value={cluster.bound_server_count} />
                      <MiniMetric label={t('kubernetes.field.lastSync')} value={cluster.last_sync_at ? t('kubernetes.synced') : t('kubernetes.neverSynced')} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setDetailCluster(cluster)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-text-primary hover:bg-background"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t('common.details')}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => openEditClusterModal(cluster)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-text-primary hover:bg-background"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {t('common.edit')}
                        </button>
                      )}
                      <button
                        onClick={() => openHermesDiagnosis(cluster)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-xs text-primary hover:bg-primary/10"
                      >
                        <BrainCircuit className="w-3.5 h-3.5" />
                        {t('kubernetes.action.diagnose')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'credentials' && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.credential.title')}</h2>
              <p className="text-sm text-text-secondary mt-1">{t('kubernetes.credential.subtitle')}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setIsCredentialModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('kubernetes.credential.add')}
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {credentials.length === 0 ? (
              <div className="md:col-span-3 rounded-lg bg-background/60 border border-border p-4 text-sm text-text-secondary">
                {t('kubernetes.credential.empty')}
              </div>
            ) : credentials.map((credential) => (
              <div key={credential.id} className="rounded-lg bg-background/60 border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{credential.name}</div>
                    <div className="text-xs text-text-secondary mt-1">{credential.credential_type}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {t('kubernetes.credential.usage', { count: credential.usage_count || 0 })}
                  </span>
                </div>
                {credential.description ? <p className="text-xs text-text-secondary mt-3 line-clamp-2">{credential.description}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => credentialDetailMutation.mutate(credential.id)}
                    disabled={credentialDetailMutation.isPending}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs text-text-primary hover:bg-surface transition-colors disabled:opacity-60"
                  >
                    {credentialDetailMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    {t('common.details')}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteCredentialTarget(credential)}
                      disabled={(credential.usage_count || 0) > 0}
                      title={(credential.usage_count || 0) > 0 ? t('kubernetes.credential.delete.blocked') : undefined}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {activeSection === 'clusters' && (
        <div className="bg-surface border border-border rounded-lg">
          <div className="p-4 border-b border-border flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.listTitle')}</h2>
              <p className="text-sm text-text-secondary mt-1">{t('kubernetes.listSubtitle')}</p>
            </div>
            <div className="relative md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('kubernetes.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredClusters.length === 0 ? (
            <div className="py-16 text-center">
              <Boxes className="w-10 h-10 text-text-secondary mx-auto mb-3" />
              <p className="font-semibold text-text-primary">{t('kubernetes.empty.title')}</p>
              <p className="text-sm text-text-secondary mt-1">{t('kubernetes.empty.desc')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredClusters.map((cluster) => (
                <div key={cluster.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">{cluster.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-500">
                          {cluster.environment || t('common.unknown')}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-background border border-border text-text-secondary">
                          {cluster.auth_type}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary mt-2 break-all">
                        {cluster.api_server_url || t('kubernetes.noApiServer')}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
                        <span>{t('kubernetes.field.distribution')}: {cluster.distribution || t('common.unknown')}</span>
                        <span>{t('kubernetes.field.version')}: {cluster.version || t('common.unknown')}</span>
                        <span>{t('kubernetes.field.lastSync')}: {cluster.last_sync_at || t('kubernetes.neverSynced')}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setDetailCluster(cluster)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        {t('common.details')}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => openEditClusterModal(cluster)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                          {t('common.edit')}
                        </button>
                      )}
                      <button
                        onClick={() => openHermesDiagnosis(cluster)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                      >
                        <BrainCircuit className="w-4 h-4" />
                        {t('kubernetes.action.diagnose')}
                      </button>
                      <button
                        onClick={() => navigate('/kubernetes-console')}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('kubernetes.action.openKite')}
                      </button>
                      <button
                        onClick={() => openSyncModal(cluster)}
                        disabled={!canOperateBindings}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className="w-4 h-4" />
                        {t('kubernetes.action.syncAssets')}
                      </button>
                      <button
                        onClick={() => syncLiveMutation.mutate(cluster.id)}
                        disabled={syncLiveMutation.isPending || !['token', 'kubeconfig'].includes(cluster.auth_type) || !cluster.credential_id || (!isAdmin && user?.role !== 'operator')}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-60"
                        title={!['token', 'kubeconfig'].includes(cluster.auth_type) || !cluster.credential_id ? t('kubernetes.liveSync.requiresToken') : undefined}
                      >
                        {syncLiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {t('kubernetes.action.syncLive')}
                      </button>
                      <button
                        onClick={() => reconcileBindingsMutation.mutate(cluster.id)}
                        disabled={reconcileBindingsMutation.isPending || !canOperateBindings}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10 transition-colors disabled:opacity-60"
                      >
                        {reconcileBindingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        {t('kubernetes.binding.reconcile')}
                      </button>
                      <button
                        onClick={() => testMutation.mutate(cluster)}
                        disabled={testMutation.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors disabled:opacity-60"
                      >
                        {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {t('kubernetes.action.testConfig')}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteTarget(cluster)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-4">
                    <SmallMetric label={t('kubernetes.metric.nodes')} value={cluster.node_count} />
                    <SmallMetric label={t('kubernetes.metric.namespaces')} value={cluster.namespace_count} />
                    <SmallMetric label={t('kubernetes.metric.workloads')} value={cluster.workload_count} />
                    <SmallMetric label={t('kubernetes.metric.pods')} value={cluster.pod_count} />
                    <SmallMetric label={t('kubernetes.metric.services')} value={cluster.service_count} />
                    <SmallMetric label={t('kubernetes.metric.events')} value={cluster.event_count} />
                  </div>
                  <ClusterBindingBar
                    bound={cluster.node_bound_count ?? cluster.bound_server_count}
                    total={cluster.node_count}
                    label={t('kubernetes.binding.clusterStatus', {
                      hosts: cluster.bound_server_count,
                      bound: cluster.node_bound_count ?? cluster.bound_server_count,
                      total: cluster.node_count,
                      unbound: Math.max(cluster.node_count - (cluster.node_bound_count ?? cluster.bound_server_count), 0),
                    })}
                    helper={t('kubernetes.binding.clusterHelper')}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{editingCluster ? t('kubernetes.modal.editTitle') : t('kubernetes.modal.title')}</h2>
              <button onClick={closeClusterModal} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('kubernetes.field.name')} required>
                  <input className={inputClass} value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
                </Field>
                <Field label={t('kubernetes.field.environment')}>
                  <input className={inputClass} value={formData.environment} onChange={(event) => setFormData({ ...formData, environment: event.target.value })} />
                </Field>
                <Field label={t('kubernetes.field.apiServer')}>
                  <input className={inputClass} value={formData.api_server_url} onChange={(event) => setFormData({ ...formData, api_server_url: event.target.value })} placeholder="https://kubernetes.default.svc:6443" />
                </Field>
                <Field label={t('kubernetes.field.authType')}>
                  <select className={inputClass} value={formData.auth_type} onChange={(event) => setFormData({ ...formData, auth_type: event.target.value as KubernetesCluster['auth_type'] })}>
                    <option value="kubeconfig">kubeconfig</option>
                    <option value="token">token</option>
                    <option value="certificate">certificate</option>
                  </select>
                </Field>
                <Field label={t('kubernetes.field.credential')}>
                  <select className={inputClass} value={formData.credential_id} onChange={(event) => setFormData({ ...formData, credential_id: event.target.value })}>
                    <option value="">{t('kubernetes.credential.none')}</option>
                    {credentials.map((credential) => (
                      <option key={credential.id} value={credential.id}>
                        {credential.name} · {credential.credential_type}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('kubernetes.field.distribution')}>
                  <input className={inputClass} value={formData.distribution} onChange={(event) => setFormData({ ...formData, distribution: event.target.value })} placeholder="EKS / ACK / K3s / OpenShift" />
                </Field>
                <Field label={t('kubernetes.field.version')}>
                  <input className={inputClass} value={formData.version} onChange={(event) => setFormData({ ...formData, version: event.target.value })} placeholder="v1.29" />
                </Field>
              </div>
              <Field label={t('kubernetes.field.description')}>
                <textarea className={`${inputClass} min-h-[84px]`} value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeClusterModal} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2">
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingCluster ? t('common.save') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.delete.title')}</h2>
            <p className="text-sm text-text-secondary mt-2">{t('kubernetes.delete.desc', { name: deleteTarget.name })}</p>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                {t('common.cancel')}
              </button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600">
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCredentialModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.credential.modal.title')}</h2>
              <button onClick={() => setIsCredentialModalOpen(false)} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <form onSubmit={handleCredentialSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('kubernetes.credential.field.name')} required>
                  <input className={inputClass} value={credentialForm.name} onChange={(event) => setCredentialForm({ ...credentialForm, name: event.target.value })} required />
                </Field>
                <Field label={t('kubernetes.credential.field.type')}>
                  <select className={inputClass} value={credentialForm.credential_type} onChange={(event) => setCredentialForm({ ...credentialForm, credential_type: event.target.value as CredentialOption['credential_type'] })}>
                    <option value="token">token</option>
                    <option value="kubeconfig">kubeconfig</option>
                  </select>
                </Field>
                <Field label={t('kubernetes.credential.field.username')}>
                  <input className={inputClass} value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} placeholder="bearer" />
                </Field>
                <Field label={t('kubernetes.credential.field.serverUrl')}>
                  <input className={inputClass} value={credentialForm.server_url} onChange={(event) => setCredentialForm({ ...credentialForm, server_url: event.target.value })} placeholder="https://kubernetes.example:6443" />
                </Field>
              </div>
              {credentialForm.credential_type === 'token' ? (
                <Field label={t('kubernetes.credential.field.token')} required>
                  <textarea className={`${inputClass} min-h-[120px] font-mono text-xs`} value={credentialForm.token} onChange={(event) => setCredentialForm({ ...credentialForm, token: event.target.value })} required />
                </Field>
              ) : (
                <Field label={t('kubernetes.credential.field.kubeconfig')} required>
                  <textarea className={`${inputClass} min-h-[220px] font-mono text-xs`} value={credentialForm.kubeconfig} onChange={(event) => setCredentialForm({ ...credentialForm, kubeconfig: event.target.value })} required placeholder="apiVersion: v1&#10;clusters:&#10;- cluster:&#10;    server: https://kubernetes.example:6443&#10;  name: default&#10;users:&#10;- name: bearer&#10;  user:&#10;    token: ..." />
                </Field>
              )}
              <Field label={t('kubernetes.field.description')}>
                <textarea className={`${inputClass} min-h-[72px]`} value={credentialForm.description} onChange={(event) => setCredentialForm({ ...credentialForm, description: event.target.value })} />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsCredentialModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={createCredentialMutation.isPending} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2">
                  {createCredentialMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentialDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text-primary truncate">{credentialDetail.name}</h2>
                <p className="text-sm text-text-secondary mt-1">{t('kubernetes.credential.detail.title')}</p>
              </div>
              <button onClick={() => setCredentialDetail(null)} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 overflow-auto max-h-[calc(90vh-88px)] space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InfoTile label={t('kubernetes.credential.field.type')} value={credentialDetail.credential_type} />
                <InfoTile label={t('kubernetes.credential.field.username')} value={credentialDetail.username || t('common.unknown')} />
                <InfoTile label={t('kubernetes.credential.detail.apiServer')} value={credentialDetail.server_url || credentialDetail.parsed_server_url || t('common.unknown')} />
                <InfoTile label={t('kubernetes.credential.detail.usedClusterCount')} value={t('kubernetes.credential.usage', { count: credentialDetail.usage_count || 0 })} />
              </div>

              <section className="rounded-lg border border-border bg-background/40 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('kubernetes.credential.detail.secretState')}</h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <StatusPill active={Boolean(credentialDetail.has_token)} label={t('kubernetes.credential.detail.hasToken')} />
                  <StatusPill active={Boolean(credentialDetail.has_kubeconfig)} label={t('kubernetes.credential.detail.hasKubeconfig')} />
                  <StatusPill active={Boolean(credentialDetail.has_certificate)} label={t('kubernetes.credential.detail.hasCertificate')} />
                </div>
              </section>

              <section className="rounded-lg border border-border bg-background/40 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('kubernetes.credential.detail.usedBy')}</h3>
                <div className="mt-3 space-y-2">
                  {credentialDetail.clusters.length === 0 ? (
                    <div className="text-sm text-text-secondary">{t('kubernetes.credential.detail.noClusters')}</div>
                  ) : credentialDetail.clusters.map((cluster) => (
                    <AssetRow
                      key={cluster.id}
                      title={cluster.name}
                      meta={[cluster.environment || t('common.unknown'), cluster.auth_type, cluster.last_sync_at || t('kubernetes.neverSynced')].join(' · ')}
                      extra={cluster.api_server_url || t('kubernetes.noApiServer')}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {deleteCredentialTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.credential.delete.title')}</h2>
            <p className="text-sm text-text-secondary mt-2">{t('kubernetes.credential.delete.desc', { name: deleteCredentialTarget.name })}</p>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setDeleteCredentialTarget(null)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteCredentialMutation.mutate(deleteCredentialTarget.id)}
                disabled={deleteCredentialMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {deleteCredentialMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {syncTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.sync.title')}</h2>
                <p className="text-sm text-text-secondary mt-1">{t('kubernetes.sync.desc', { name: syncTarget.name })}</p>
              </div>
              <button onClick={() => setSyncTarget(null)} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                {t('kubernetes.sync.notice')}
              </div>
              <textarea
                value={assetSnapshotText}
                onChange={(event) => setAssetSnapshotText(event.target.value)}
                spellCheck={false}
                className={`${inputClass} min-h-[360px] font-mono text-xs leading-relaxed`}
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setSyncTarget(null)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSyncAssets}
                  disabled={syncAssetsMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {syncAssetsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {t('kubernetes.action.syncAssets')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bindingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.binding.modal.title')}</h2>
                <p className="text-sm text-text-secondary mt-1 truncate">{bindingTarget.name}</p>
              </div>
              <button onClick={() => setBindingTarget(null)} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-border bg-background/50 p-3 text-sm text-text-secondary">
                {t('kubernetes.binding.modal.hint', {
                  internalIp: bindingTarget.internal_ip || '-',
                  externalIp: bindingTarget.external_ip || '-',
                })}
              </div>
              <Field label={t('kubernetes.binding.modal.server')}>
                <select className={inputClass} value={bindingServerId} onChange={(event) => setBindingServerId(event.target.value)}>
                  <option value="">{t('kubernetes.binding.modal.unbound')}</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name} · {server.hostname || server.ip_address || server.private_ip || server.id}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setBindingTarget(null)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={submitBinding}
                  disabled={updateBindingMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {updateBindingMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {detailCluster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-text-primary truncate">{detailCluster.name}</h2>
                <p className="text-sm text-text-secondary mt-1 break-all">{detailCluster.api_server_url || t('kubernetes.noApiServer')}</p>
              </div>
              <button onClick={() => setDetailCluster(null)} className="p-2 rounded-lg hover:bg-background">
                <X className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="p-5 overflow-auto max-h-[calc(90vh-88px)] space-y-5">
              {isFetchingAssets || !clusterAssets ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <SmallMetric label={t('kubernetes.metric.nodes')} value={clusterAssets.nodes.length} />
                    <SmallMetric label={t('kubernetes.metric.boundServers')} value={(clusterAssets.backing_hosts || []).length} />
                    <SmallMetric label={t('kubernetes.metric.namespaces')} value={clusterAssets.namespaces.length} />
                    <SmallMetric label={t('kubernetes.metric.workloads')} value={clusterAssets.workloads.length} />
                    <SmallMetric label={t('kubernetes.metric.pods')} value={clusterAssets.pods.length} />
                    <SmallMetric label={t('kubernetes.metric.services')} value={clusterAssets.services.length} />
                  </div>

                  <section className="rounded-lg border border-border bg-background/40 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">{t('kubernetes.binding.detailTitle')}</h3>
                        <p className="text-xs text-text-secondary mt-1">
                          {t('kubernetes.binding.detailDesc', {
                            hosts: (clusterAssets.backing_hosts || []).length,
                            bound: clusterAssets.nodes.filter((node) => node.server_id).length,
                            total: clusterAssets.nodes.length,
                            unbound: clusterAssets.nodes.filter((node) => !node.server_id).length,
                          })}
                        </p>
                        <p className="text-xs text-text-secondary mt-2">{t('kubernetes.binding.detailHint')}</p>
                      </div>
                      <button
                        onClick={() => reconcileBindingsMutation.mutate(detailCluster.id)}
                        disabled={reconcileBindingsMutation.isPending || !canOperateBindings}
                        className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/10 transition-colors disabled:opacity-60"
                      >
                        {reconcileBindingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {t('kubernetes.binding.reconcile')}
                      </button>
                    </div>
                  </section>

                  <DetailSection title={t('kubernetes.detail.backingHosts')} empty={t('kubernetes.detail.emptyBackingHosts')}>
                    {(clusterAssets.backing_hosts || []).map((host) => (
                      <BackingHostRow key={host.server_id} host={host} />
                    ))}
                  </DetailSection>

                  <DetailSection title={t('kubernetes.detail.nodes')} empty={t('kubernetes.detail.emptyNodes')}>
                    {clusterAssets.nodes.map((node) => (
                      <NodeBindingRow
                        key={node.id}
                        node={node}
                        canOperate={canOperateBindings}
                        onBind={() => openBindingModal(node)}
                      />
                    ))}
                  </DetailSection>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DetailSection title={t('kubernetes.detail.workloads')} empty={t('kubernetes.detail.emptyWorkloads')}>
                      {clusterAssets.workloads.slice(0, 6).map((workload) => (
                        <AssetRow
                          key={workload.id}
                          title={`${workload.kind}/${workload.name}`}
                          meta={`${workload.namespace} · ${workload.status}`}
                          extra={`${workload.ready_replicas ?? '-'} / ${workload.replicas ?? '-'}`}
                        />
                      ))}
                    </DetailSection>
                    <DetailSection title={t('kubernetes.detail.pods')} empty={t('kubernetes.detail.emptyPods')}>
                      {clusterAssets.pods.slice(0, 6).map((pod) => (
                        <AssetRow
                          key={pod.id}
                          title={pod.name}
                          meta={`${pod.namespace} · ${pod.phase}`}
                          extra={`${t('kubernetes.detail.restarts')}: ${pod.restart_count}`}
                        />
                      ))}
                    </DetailSection>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DetailSection title={t('kubernetes.detail.services')} empty={t('kubernetes.detail.emptyServices')}>
                      {clusterAssets.services.slice(0, 6).map((service) => (
                        <AssetRow
                          key={service.id}
                          title={service.name}
                          meta={`${service.namespace} · ${service.type || '-'}`}
                          extra={service.cluster_ip || '-'}
                        />
                      ))}
                    </DetailSection>
                    <DetailSection title={t('kubernetes.detail.events')} empty={t('kubernetes.detail.emptyEvents')}>
                      {clusterAssets.events.slice(0, 6).map((event) => (
                        <AssetRow
                          key={event.id}
                          title={[event.involved_kind, event.involved_name].filter(Boolean).join('/') || event.reason || '-'}
                          meta={[event.namespace, event.type, event.reason].filter(Boolean).join(' · ')}
                          extra={event.message || event.last_seen_at || '-'}
                        />
                      ))}
                    </DetailSection>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button onClick={() => openHermesDiagnosis(detailCluster)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">
                      <BrainCircuit className="w-4 h-4" />
                      {t('kubernetes.action.diagnose')}
                    </button>
                    <button onClick={() => navigate('/kubernetes-console')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                      <ExternalLink className="w-4 h-4" />
                      {t('kubernetes.action.openKite')}
                    </button>
                    <button onClick={() => navigate('/topology')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                      <Link2 className="w-4 h-4" />
                      {t('kubernetes.action.openTopology')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-text-secondary hover:bg-background hover:text-text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Cloud; label: string; value: number }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 text-primary" />
        <span className="text-2xl font-semibold text-text-primary">{value}</span>
      </div>
      <p className="text-sm text-text-secondary mt-3">{label}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
      <p className="text-[11px] text-text-secondary truncate">{label}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary truncate">{value}</p>
    </div>
  );
}

function BindingStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[120px] rounded-lg border border-border bg-background/60 px-4 py-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function ClusterBindingBar({ bound, total, label, helper }: { bound: number; total: number; label: string; helper?: string }) {
  const ratio = total > 0 ? Math.round((bound / total) * 100) : 100;
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-semibold text-text-primary">{ratio}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-border/60">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
      </div>
      {helper ? <p className="mt-2 text-xs text-text-tertiary">{helper}</p> : null}
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-text-primary mt-1">{value}</p>
    </div>
  );
}

function NodeBindingRow({ node, canOperate, onBind }: { node: KubernetesNode; canOperate: boolean; onBind: () => void }) {
  const { t } = useLocale();
  const serverLabel = node.server_name
    ? t('kubernetes.detail.boundServer', { name: node.server_name, host: node.server_hostname || node.server_ip_address || '-' })
    : t('kubernetes.detail.unboundServer');

  return (
    <div className="rounded-lg bg-surface border border-border px-3 py-3 min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-text-primary truncate">{node.name}</div>
            <BindingSourcePill source={node.binding_source || (node.server_id ? 'manual' : 'unbound')} />
          </div>
          <div className="text-xs text-text-secondary mt-1 break-all">
            {[node.role || '-', node.internal_ip || '-', node.external_ip || '-', node.status].join(' · ')}
          </div>
          <div className="text-xs text-text-tertiary mt-2 break-all">{serverLabel}</div>
        </div>
        <button
          onClick={onBind}
          disabled={!canOperate}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-xs text-text-primary hover:bg-background transition-colors disabled:opacity-60"
        >
          <Link2 className="w-3.5 h-3.5" />
          {node.server_id ? t('kubernetes.binding.change') : t('kubernetes.binding.bind')}
        </button>
      </div>
    </div>
  );
}

function BackingHostRow({ host }: { host: KubernetesBackingHost }) {
  const { t } = useLocale();
  const sourceLabel = host.source === 'server_group_cluster_match'
    ? t('kubernetes.binding.source.group')
    : host.source === 'kubernetes_node_match'
      ? t('kubernetes.binding.source.auto')
      : t('kubernetes.binding.source.manual');
  const sourceMeta = host.group_name || host.node_name || '-';
  const address = host.server_ip_address || host.server_private_ip || host.server_hostname || '-';
  return (
    <div className="rounded-lg bg-surface border border-border px-3 py-3 min-w-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{host.server_name}</div>
          <div className="text-xs text-text-secondary mt-1 break-all">{address}</div>
        </div>
        <div className="text-left md:text-right">
          <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            {sourceLabel}
          </span>
          <div className="mt-1 text-xs text-text-tertiary break-all">{sourceMeta}</div>
        </div>
      </div>
    </div>
  );
}

function BindingSourcePill({ source }: { source: string }) {
  const { t } = useLocale();
  const tone = source === 'auto'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : source === 'manual'
      ? 'border-primary/30 bg-primary/10 text-primary'
      : source === 'stale'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
        : 'border-border bg-background text-text-secondary';
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[11px] ${tone}`}>
      {t(`kubernetes.binding.source.${source}` as any)}
    </span>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border p-3 min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm font-medium text-text-primary mt-1 break-all">{value}</p>
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`px-2 py-1 rounded-full border ${active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-background border-border text-text-secondary'}`}>
      {label}
    </span>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-text-primary mb-1">
        {label}
        {required ? <span className="text-red-500 ml-1">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function DetailSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-lg border border-border bg-background/40 p-4">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 space-y-2">
        {hasItems ? children : <div className="text-sm text-text-secondary">{empty}</div>}
      </div>
    </section>
  );
}

function AssetRow({ title, meta, extra }: { title: string; meta: string; extra?: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border px-3 py-2 min-w-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{title}</div>
          <div className="text-xs text-text-secondary mt-1 truncate">{meta}</div>
        </div>
        {extra ? <div className="text-xs text-text-tertiary sm:text-right sm:max-w-[45%] truncate">{extra}</div> : null}
      </div>
    </div>
  );
}
