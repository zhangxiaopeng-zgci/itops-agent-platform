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
  Link2,
  Loader2,
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
  bound_server_count: number;
}

interface KubernetesNode {
  id: string;
  name: string;
  internal_ip?: string | null;
  role?: string | null;
  status: string;
  server_id?: string | null;
  server_name?: string | null;
  server_hostname?: string | null;
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

interface KubernetesClusterAssets {
  cluster: KubernetesCluster;
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
  description?: string | null;
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
  server_url: '',
  description: '',
};

const inputClass = 'w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary';

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
  const [assetSnapshotText, setAssetSnapshotText] = useState('');
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [credentialForm, setCredentialForm] = useState(emptyCredentialForm);
  const isAdmin = user?.role === 'admin';

  useEscapeKey({ onEscape: () => setIsModalOpen(false), enabled: isModalOpen });
  useEscapeKey({ onEscape: () => setDeleteTarget(null), enabled: !!deleteTarget });
  useEscapeKey({ onEscape: () => setDetailCluster(null), enabled: !!detailCluster });
  useEscapeKey({ onEscape: () => setSyncTarget(null), enabled: !!syncTarget });
  useEscapeKey({ onEscape: () => setIsCredentialModalOpen(false), enabled: isCredentialModalOpen });

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

  const createCredentialMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/kubernetes-credentials', credentialForm);
      return res.data.data as { id: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credentials', 'kubernetes'] });
      setCredentialForm(emptyCredentialForm);
      setIsCredentialModalOpen(false);
      setFormData((current) => ({ ...current, auth_type: 'token', credential_id: result.id }));
      toast.success(t('kubernetes.credential.toast.created'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.credential.toast.createFailed'));
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
      return res.data.data as { counts: { nodes: number; namespaces: number; workloads: number; pods: number; services: number; events: number; boundServers: number } };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      setSyncTarget(null);
      setAssetSnapshotText('');
      toast.success(t('kubernetes.toast.synced', { nodes: result.counts.nodes, pods: result.counts.pods }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.toast.syncFailed'));
    },
  });

  const syncLiveMutation = useMutation({
    mutationFn: async (clusterId: string) => {
      const res = await api.post(`/api/kubernetes-clusters/${clusterId}/sync-live`);
      return res.data.data as { counts: { nodes: number; namespaces: number; workloads: number; pods: number; services: number; events: number; boundServers: number } };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kubernetes-clusters'] });
      queryClient.invalidateQueries({ queryKey: ['kubernetes-cluster-assets'] });
      toast.success(t('kubernetes.toast.liveSynced', { nodes: result.counts.nodes, pods: result.counts.pods }));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.response?.data?.message || t('kubernetes.toast.liveSyncFailed'));
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
        boundServers: acc.boundServers + cluster.bound_server_count,
      }),
      { nodes: 0, pods: 0, workloads: 0, boundServers: 0 }
    );
  }, [clusters]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate();
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
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('kubernetes.add')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard icon={Cloud} label={t('kubernetes.metric.clusters')} value={clusters.length} />
          <MetricCard icon={Server} label={t('kubernetes.metric.nodes')} value={totals.nodes} />
          <MetricCard icon={Boxes} label={t('kubernetes.metric.workloads')} value={totals.workloads} />
          <MetricCard icon={Link2} label={t('kubernetes.metric.boundServers')} value={totals.boundServers} />
        </div>

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
              </div>
            ))}
          </div>
        </div>

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
                        disabled={!isAdmin && user?.role !== 'operator'}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className="w-4 h-4" />
                        {t('kubernetes.action.syncAssets')}
                      </button>
                      <button
                        onClick={() => syncLiveMutation.mutate(cluster.id)}
                        disabled={syncLiveMutation.isPending || cluster.auth_type !== 'token' || !cluster.credential_id || (!isAdmin && user?.role !== 'operator')}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-60"
                        title={cluster.auth_type !== 'token' || !cluster.credential_id ? t('kubernetes.liveSync.requiresToken') : undefined}
                      >
                        {syncLiveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {t('kubernetes.action.syncLive')}
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-xl">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{t('kubernetes.modal.title')}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-lg hover:bg-background">
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
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-background">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('common.create')}
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
                  </select>
                </Field>
                <Field label={t('kubernetes.credential.field.username')}>
                  <input className={inputClass} value={credentialForm.username} onChange={(event) => setCredentialForm({ ...credentialForm, username: event.target.value })} placeholder="bearer" />
                </Field>
                <Field label={t('kubernetes.credential.field.serverUrl')}>
                  <input className={inputClass} value={credentialForm.server_url} onChange={(event) => setCredentialForm({ ...credentialForm, server_url: event.target.value })} placeholder="https://kubernetes.example:6443" />
                </Field>
              </div>
              <Field label={t('kubernetes.credential.field.token')} required>
                <textarea className={`${inputClass} min-h-[120px] font-mono text-xs`} value={credentialForm.token} onChange={(event) => setCredentialForm({ ...credentialForm, token: event.target.value })} required />
              </Field>
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
                    <SmallMetric label={t('kubernetes.metric.namespaces')} value={clusterAssets.namespaces.length} />
                    <SmallMetric label={t('kubernetes.metric.workloads')} value={clusterAssets.workloads.length} />
                    <SmallMetric label={t('kubernetes.metric.pods')} value={clusterAssets.pods.length} />
                    <SmallMetric label={t('kubernetes.metric.services')} value={clusterAssets.services.length} />
                    <SmallMetric label={t('kubernetes.metric.events')} value={clusterAssets.events.length} />
                  </div>

                  <DetailSection title={t('kubernetes.detail.nodes')} empty={t('kubernetes.detail.emptyNodes')}>
                    {clusterAssets.nodes.slice(0, 8).map((node) => (
                      <AssetRow
                        key={node.id}
                        title={node.name}
                        meta={[node.role || '-', node.internal_ip || '-', node.status].join(' · ')}
                        extra={node.server_name ? t('kubernetes.detail.boundServer', { name: node.server_name, host: node.server_hostname || '-' }) : t('kubernetes.detail.unboundServer')}
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

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/60 border border-border p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-text-primary mt-1">{value}</p>
    </div>
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
