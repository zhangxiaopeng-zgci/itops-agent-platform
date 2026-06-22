import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
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

const emptyForm = {
  name: '',
  api_server_url: '',
  environment: 'production',
  distribution: '',
  version: '',
  auth_type: 'kubeconfig' as KubernetesCluster['auth_type'],
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
  const [formData, setFormData] = useState(emptyForm);
  const isAdmin = user?.role === 'admin';

  useEscapeKey({ onEscape: () => setIsModalOpen(false), enabled: isModalOpen });
  useEscapeKey({ onEscape: () => setDeleteTarget(null), enabled: !!deleteTarget });

  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ['kubernetes-clusters'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-clusters');
      return res.data.data as KubernetesCluster[];
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
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('kubernetes.add')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard icon={Cloud} label={t('kubernetes.metric.clusters')} value={clusters.length} />
          <MetricCard icon={Server} label={t('kubernetes.metric.nodes')} value={totals.nodes} />
          <MetricCard icon={Boxes} label={t('kubernetes.metric.workloads')} value={totals.workloads} />
          <MetricCard icon={Link2} label={t('kubernetes.metric.boundServers')} value={totals.boundServers} />
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
