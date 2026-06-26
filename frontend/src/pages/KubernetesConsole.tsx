import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

interface KiteBridgeCluster {
  id: string;
  name: string;
  status: string;
  enabled: number;
  auth_type: string;
  node_count: number;
  pod_count: number;
  last_sync_at?: string | null;
  has_kubeconfig: number;
}

interface KiteBridgeStatus {
  kite: {
    configured: boolean;
    publicUrl?: string | null;
    reachable: boolean;
    initialized: boolean;
    authProviders: string[];
    userPresent: boolean;
    loginRequired: boolean;
    sessionBridgeConfigured: boolean;
    error?: string | null;
  };
  bridge: {
    kubeconfigPresent: boolean;
    kubeconfigUpdatedAt?: string | null;
    syncedClusterId?: string | null;
    syncedClusterName?: string | null;
    syncedAt?: string | null;
    restartRequired: boolean;
  };
  clusters: {
    registered: number;
    eligible: number;
    items: KiteBridgeCluster[];
  };
}

function getKiteUrl(): string {
  if (typeof window === 'undefined') return 'http://10.1.132.58:3002';
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '10.1.132.58';
  return `${protocol}//${hostname}:3002`;
}

export default function KubernetesConsole() {
  const { t } = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const kiteUrl = useMemo(() => getKiteUrl(), []);
  const canSyncKite = user?.role === 'admin' || user?.role === 'operator';
  const canCreateKiteSession = canSyncKite;
  const [kiteFrameNonce, setKiteFrameNonce] = useState(0);
  const autoSessionAttemptedRef = useRef(false);

  const { data: bridgeStatus, isLoading } = useQuery({
    queryKey: ['kite-bridge-status'],
    queryFn: async () => {
      const res = await api.get('/api/kite-bridge/status');
      return res.data.data as KiteBridgeStatus;
    },
    staleTime: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: async (clusterId?: string | null) => {
      const res = await api.post('/api/kite-bridge/sync-bootstrap', { clusterId });
      return res.data.data as { clusterId: string; clusterName: string; syncedAt: string; clusters?: Array<{ id: string; name: string }> };
    },
    onSuccess: (result) => {
      toast.success(t('kubernetesConsole.bridge.syncSuccess', { name: result.clusterName, count: result.clusters?.length || 1 }));
      queryClient.invalidateQueries({ queryKey: ['kite-bridge-status'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('kubernetesConsole.bridge.syncFailed'));
    },
  });

  const sessionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/kite-bridge/session');
      return res.data.data as { publicUrl?: string | null; username: string; userPresent: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kite-bridge-status'] });
      setKiteFrameNonce(Date.now());
      toast.success(t('kubernetesConsole.bridge.sessionCreated'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('kubernetesConsole.bridge.sessionFailed'));
    },
  });

  const eligibleClusters = bridgeStatus?.clusters.items.filter((cluster) => (
    cluster.enabled === 1
    && cluster.auth_type === 'kubeconfig'
    && cluster.has_kubeconfig === 1
  )) || [];
  const selectedClusterId = bridgeStatus?.bridge.syncedClusterId || eligibleClusters[0]?.id || null;

  useEffect(() => {
    if (
      autoSessionAttemptedRef.current
      || !canCreateKiteSession
      || !bridgeStatus?.kite.sessionBridgeConfigured
      || !bridgeStatus?.kite.loginRequired
      || sessionMutation.isPending
    ) {
      return;
    }

    autoSessionAttemptedRef.current = true;
    sessionMutation.mutate();
  }, [
    bridgeStatus?.kite.loginRequired,
    bridgeStatus?.kite.sessionBridgeConfigured,
    canCreateKiteSession,
    sessionMutation,
  ]);

  const openKite = async () => {
    const target = window.open('about:blank', '_blank');
    const fallbackUrl = bridgeStatus?.kite.publicUrl || kiteUrl;
    if (target) {
      target.document.write(`<title>Kite</title><body style="font-family: sans-serif; padding: 24px;">${t('kubernetesConsole.bridge.creatingSession')}</body>`);
      target.document.close();
    }

    if (!canCreateKiteSession || !bridgeStatus?.kite.sessionBridgeConfigured) {
      if (target) target.location.href = fallbackUrl;
      else window.location.href = fallbackUrl;
      return;
    }

    try {
      const result = await sessionMutation.mutateAsync();
      if (target) target.location.href = result.publicUrl || fallbackUrl;
      else window.location.href = result.publicUrl || fallbackUrl;
    } catch {
      if (target) target.location.href = fallbackUrl;
      else window.location.href = fallbackUrl;
    }
  };
  const frameUrl = kiteFrameNonce > 0
    ? `${kiteUrl}${kiteUrl.includes('?') ? '&' : '?'}aioSession=${kiteFrameNonce}`
    : kiteUrl;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('kubernetesConsole.title')}</h1>
              <p className="text-text-secondary mt-1">{t('kubernetesConsole.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openKite}
            disabled={sessionMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {sessionMutation.isPending ? t('kubernetesConsole.bridge.creatingSession') : t('kubernetesConsole.open')}
          </button>
        </div>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{t('kubernetesConsole.bridge.eyebrow')}</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">{t('kubernetesConsole.bridge.title')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('kubernetesConsole.bridge.subtitle')}</p>
            </div>
            <button
              onClick={() => syncMutation.mutate(selectedClusterId)}
              disabled={!canSyncKite || !selectedClusterId || syncMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? t('kubernetesConsole.bridge.syncing') : t('kubernetesConsole.bridge.syncAll')}
            </button>
            <button
              onClick={() => sessionMutation.mutate()}
              disabled={!canCreateKiteSession || !bridgeStatus?.kite.sessionBridgeConfigured || sessionMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-background disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {sessionMutation.isPending ? t('kubernetesConsole.bridge.creatingSession') : t('kubernetesConsole.bridge.createSession')}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <BridgeFact
              ok={(bridgeStatus?.clusters.registered || 0) > 0}
              label={t('kubernetesConsole.bridge.registered')}
              value={isLoading ? t('common.loading') : String(bridgeStatus?.clusters.registered || 0)}
              helper={t('kubernetesConsole.bridge.registeredHelper')}
            />
            <BridgeFact
              ok={(bridgeStatus?.clusters.eligible || 0) > 0}
              label={t('kubernetesConsole.bridge.eligible')}
              value={isLoading ? t('common.loading') : String(bridgeStatus?.clusters.eligible || 0)}
              helper={t('kubernetesConsole.bridge.eligibleHelper')}
            />
            <BridgeFact
              ok={Boolean(bridgeStatus?.bridge.kubeconfigPresent)}
              label={t('kubernetesConsole.bridge.synced')}
              value={bridgeStatus?.bridge.syncedClusterName || '-'}
              helper={bridgeStatus?.bridge.syncedAt || t('kubernetesConsole.bridge.notSynced')}
            />
            <BridgeFact
              ok={Boolean(bridgeStatus?.kite.initialized)}
              label={t('kubernetesConsole.bridge.kiteReady')}
              value={bridgeStatus?.kite.reachable ? t('common.online') : t('common.offline')}
              helper={
                bridgeStatus?.kite.loginRequired
                  ? (bridgeStatus?.kite.sessionBridgeConfigured ? t('kubernetesConsole.bridge.sessionBridgeReady') : t('kubernetesConsole.bridge.loginRequired'))
                  : t('kubernetesConsole.bridge.sessionReady')
              }
            />
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">{t('kubernetesConsole.bridge.clusterList')}</h3>
                <p className="mt-1 text-xs text-text-secondary">{t('kubernetesConsole.bridge.clusterListDesc')}</p>
              </div>
              {bridgeStatus?.bridge.restartRequired && (
                <span className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600">
                  {t('kubernetesConsole.bridge.restartHint')}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(bridgeStatus?.clusters.items || []).map((cluster) => (
                <div key={cluster.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{cluster.name}</p>
                      <p className="mt-1 text-xs text-text-secondary">{cluster.node_count} nodes / {cluster.pod_count} pods</p>
                    </div>
                    {cluster.id === bridgeStatus?.bridge.syncedClusterId ? (
                      <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-text-tertiary">
                    {cluster.auth_type} · {cluster.has_kubeconfig ? t('kubernetesConsole.bridge.hasKubeconfig') : t('kubernetesConsole.bridge.noKubeconfig')}
                  </p>
                  {canSyncKite && cluster.enabled === 1 && cluster.auth_type === 'kubeconfig' && cluster.has_kubeconfig === 1 && (
                    <button
                      onClick={() => syncMutation.mutate(cluster.id)}
                      disabled={syncMutation.isPending}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-background disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t('kubernetesConsole.bridge.syncThis')}
                    </button>
                  )}
                </div>
              ))}
              {!isLoading && (bridgeStatus?.clusters.items || []).length === 0 && (
                <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
                  {t('kubernetesConsole.bridge.noClusters')}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CapabilityCard
            icon={Monitor}
            title={t('kubernetesConsole.capability.dashboard')}
            description={t('kubernetesConsole.capability.dashboardDesc')}
          />
          <CapabilityCard
            icon={Workflow}
            title={t('kubernetesConsole.capability.resources')}
            description={t('kubernetesConsole.capability.resourcesDesc')}
          />
          <CapabilityCard
            icon={ShieldCheck}
            title={t('kubernetesConsole.capability.boundary')}
            description={t('kubernetesConsole.capability.boundaryDesc')}
          />
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t('kubernetesConsole.preview.title')}</h2>
              <p className="text-sm text-text-secondary mt-1">{t('kubernetesConsole.preview.desc')}</p>
            </div>
            <span className="text-xs text-text-secondary break-all">{kiteUrl}</span>
          </div>
          <iframe
            title="Kite Kubernetes Console"
            src={frameUrl}
            className="w-full min-h-[680px] bg-background"
          />
        </div>
      </div>
    </div>
  );
}

function CapabilityCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Boxes;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <p className="font-semibold text-text-primary mt-4">{title}</p>
      <p className="text-sm text-text-secondary mt-2">{description}</p>
    </div>
  );
}

function BridgeFact({
  ok,
  label,
  value,
  helper,
}: {
  ok: boolean;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-secondary">{label}</p>
          <p className="mt-1 text-sm font-semibold text-text-primary break-words">{value}</p>
        </div>
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        )}
      </div>
      <p className="mt-2 text-xs text-text-tertiary break-words">{helper}</p>
    </div>
  );
}
