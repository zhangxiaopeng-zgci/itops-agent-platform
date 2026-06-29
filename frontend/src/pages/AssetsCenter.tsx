import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Braces,
  Key,
  MonitorPlay,
  Network,
  Radar,
  Server,
  Terminal,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface ServerItem {
  id: string;
  name: string;
  hostname: string;
  enabled: number;
  os_type?: string;
}

interface NetworkDevice {
  id: string;
  name: string;
  ip_address: string;
  vendor?: string;
  role?: string;
  status?: string;
}

interface Credential {
  id: string;
  name: string;
  auth_type: 'key' | 'password';
  usage_count?: number;
}

interface KubernetesCluster {
  id: string;
  name: string;
  status?: string;
  node_count?: number;
  pod_count?: number;
  bound_server_count?: number;
}

interface KubernetesBackingHost {
  server_id: string;
  server_name?: string | null;
  server_hostname?: string | null;
}

interface KubernetesClusterAssets {
  backing_hosts?: KubernetesBackingHost[];
}

interface AssetOption {
  id: string;
  rawId: string;
  contextAssetId: string;
  assetType: 'server' | 'network_device' | 'kubernetes_cluster';
  name: string;
  meta: string;
  type: 'host' | 'network' | 'kubernetes';
  typeKey: MessageKey;
  href: string;
  serverIds: string[];
  icon: typeof Server;
}

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

function buildAssetContextPath(basePath: string, asset: AssetOption | null): string {
  if (!asset) return basePath;

  const params = new URLSearchParams();
  params.set('assetId', asset.contextAssetId);
  params.set('assetType', asset.assetType);
  params.set('assetName', asset.name);
  if (asset.serverIds.length > 0) params.set('serverIds', asset.serverIds.join(','));
  if (asset.type === 'kubernetes') params.set('k8sClusterId', asset.rawId);
  return `${basePath}?${params.toString()}`;
}

export default function AssetsCenter() {
  const navigate = useNavigate();
  const { t } = useLocale();
  const [selectedAssetId, setSelectedAssetId] = useState('');

  const { data: servers = [] } = useQuery({
    queryKey: ['assets-center', 'servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerItem>(res.data.data, ['servers', 'items']);
    },
    staleTime: 60000,
  });

  const { data: networkDevices = [] } = useQuery({
    queryKey: ['assets-center', 'network-devices'],
    queryFn: async () => {
      const res = await api.get('/api/network-devices');
      return toArray<NetworkDevice>(res.data.data, ['devices', 'items']);
    },
    staleTime: 60000,
  });

  const { data: credentials = [] } = useQuery({
    queryKey: ['assets-center', 'credentials'],
    queryFn: async () => {
      const res = await api.get('/api/ssh-keys');
      return toArray<Credential>(res.data.data, ['credentials', 'items']);
    },
    staleTime: 60000,
  });

  const { data: kubernetesClusters = [] } = useQuery({
    queryKey: ['assets-center', 'kubernetes-clusters'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-clusters');
      return toArray<KubernetesCluster>(res.data.data, ['clusters', 'items']);
    },
    staleTime: 60000,
  });

  const kubernetesAssetQueries = useQueries({
    queries: kubernetesClusters.map((cluster) => ({
      queryKey: ['assets-center', 'kubernetes-cluster-assets', cluster.id],
      queryFn: async () => {
        const res = await api.get(`/api/kubernetes-clusters/${cluster.id}/assets`);
        return res.data.data as KubernetesClusterAssets;
      },
      staleTime: 60000,
      enabled: Boolean(cluster.id),
    })),
  });

  const kubernetesBackingHosts = new Map<string, KubernetesBackingHost[]>();
  kubernetesAssetQueries.forEach((query, index) => {
    const cluster = kubernetesClusters[index];
    if (!cluster) return;
    kubernetesBackingHosts.set(cluster.id, query.data?.backing_hosts || []);
  });

  const enabledServers = servers.filter((server) => server.enabled === 1);
  const onlineNetworkDevices = networkDevices.filter((device) => ['online', 'active', 'success'].includes(String(device.status || '').toLowerCase()));
  const passwordCredentials = credentials.filter((credential) => credential.auth_type === 'password').length;
  const keyCredentials = credentials.filter((credential) => credential.auth_type === 'key').length;
  const healthyKubernetesClusters = kubernetesClusters.filter((cluster) => ['healthy', 'online', 'active', 'ready'].includes(String(cluster.status || '').toLowerCase())).length;

  const assetFamilies = [
    {
      titleKey: 'assetsCenter.family.hosts.title',
      descriptionKey: 'assetsCenter.family.hosts.desc',
      count: servers.length,
      helper: t('assetsCenter.family.hosts.helper', { count: enabledServers.length }),
      icon: Server,
      href: '/servers',
      tone: 'text-blue-500 bg-blue-500/10',
    },
    {
      titleKey: 'assetsCenter.family.network.title',
      descriptionKey: 'assetsCenter.family.network.desc',
      count: networkDevices.length,
      helper: t('assetsCenter.family.network.helper', { count: onlineNetworkDevices.length }),
      icon: Network,
      href: '/network-devices',
      tone: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      titleKey: 'assetsCenter.family.kubernetes.title',
      descriptionKey: 'assetsCenter.family.kubernetes.desc',
      count: kubernetesClusters.length,
      helper: t('assetsCenter.family.kubernetes.helper', { count: healthyKubernetesClusters }),
      icon: Boxes,
      href: '/kubernetes-clusters',
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      titleKey: 'assetsCenter.family.credentials.title',
      descriptionKey: 'assetsCenter.family.credentials.desc',
      count: credentials.length,
      helper: t('assetsCenter.family.credentials.helper', { keys: keyCredentials, passwords: passwordCredentials }),
      icon: Key,
      href: '/ssh-keys',
      tone: 'text-yellow-500 bg-yellow-500/10',
    },
  ];

  const accessActions = [
    {
      titleKey: 'assetsCenter.action.terminal',
      descriptionKey: 'assetsCenter.action.terminalDesc',
      href: '/terminal',
      icon: Terminal,
    },
    {
      titleKey: 'assetsCenter.action.remoteDesktop',
      descriptionKey: 'assetsCenter.action.remoteDesktopDesc',
      href: '/remote-desktop',
      icon: MonitorPlay,
    },
    {
      titleKey: 'assetsCenter.action.diagnose',
      descriptionKey: 'assetsCenter.action.diagnoseDesc',
      href: '/diagnosis-center',
      icon: Radar,
    },
    {
      titleKey: 'assetsCenter.action.execute',
      descriptionKey: 'assetsCenter.action.executeDesc',
      href: '/execution-center',
      icon: Wrench,
    },
    {
      titleKey: 'assetsCenter.action.kubernetesConsole',
      descriptionKey: 'assetsCenter.action.kubernetesConsoleDesc',
      href: '/kubernetes-console',
      icon: Boxes,
    },
  ];

  const recentAssets: AssetOption[] = [
    ...servers.slice(0, 4).map((server) => ({
      id: `server-${server.id}`,
      rawId: server.id,
      contextAssetId: server.id,
      assetType: 'server' as const,
      name: server.name,
      meta: server.hostname,
      type: 'host' as const,
      typeKey: 'assetsCenter.type.host' as MessageKey,
      href: '/servers',
      serverIds: [server.id],
      icon: Server,
    })),
    ...networkDevices.slice(0, 4).map((device) => ({
      id: `network-${device.id}`,
      rawId: device.id,
      contextAssetId: `network-device:${device.id}`,
      assetType: 'network_device' as const,
      name: device.name,
      meta: device.ip_address,
      type: 'network' as const,
      typeKey: 'assetsCenter.type.network' as MessageKey,
      href: '/network-devices',
      serverIds: [],
      icon: Network,
    })),
    ...kubernetesClusters.slice(0, 4).map((cluster) => ({
      id: `kubernetes-${cluster.id}`,
      rawId: cluster.id,
      contextAssetId: `k8s-cluster:${cluster.id}`,
      assetType: 'kubernetes_cluster' as const,
      name: cluster.name,
      meta: t('assetsCenter.type.kubernetesMeta', {
        nodes: cluster.node_count || 0,
        pods: cluster.pod_count || 0,
        hosts: kubernetesBackingHosts.get(cluster.id)?.length ?? cluster.bound_server_count ?? 0,
      }),
      type: 'kubernetes' as const,
      typeKey: 'assetsCenter.type.kubernetes' as MessageKey,
      href: '/kubernetes-clusters',
      serverIds: (kubernetesBackingHosts.get(cluster.id) || [])
        .map((host) => host.server_id)
        .filter(Boolean),
      icon: Boxes,
    })),
  ].slice(0, 6);
  const selectedAsset = useMemo(() => {
    return recentAssets.find((asset) => asset.id === selectedAssetId) || recentAssets[0] || null;
  }, [recentAssets, selectedAssetId]);
  const selectedAssetType = selectedAsset ? t(selectedAsset.typeKey) : '-';
  const selectedAssetConnectionHref = selectedAsset?.type === 'kubernetes'
    ? `/kubernetes-console?cluster=${encodeURIComponent(selectedAsset.name)}`
    : selectedAsset?.type === 'host'
      ? `/terminal?serverId=${encodeURIComponent(selectedAsset.rawId)}`
      : selectedAsset?.href || '/assets-center';
  const selectedAssetConnectionLabel = selectedAsset?.type === 'kubernetes'
    ? t('assetsCenter.focus.openKite')
    : selectedAsset?.type === 'host'
      ? t('assetsCenter.focus.openTerminal')
      : t('assetsCenter.focus.openAsset');

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <Braces className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('assetsCenter.title')}</h1>
              <p className="text-text-secondary mt-1">{t('assetsCenter.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/servers')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Server className="w-4 h-4" />
            {t('assetsCenter.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {assetFamilies.map((family) => (
            <button
              key={family.titleKey}
              onClick={() => family.href && navigate(family.href)}
              className="text-left bg-surface border border-border rounded-lg p-5 hover:border-primary/60 hover:bg-primary/5 transition-colors disabled:cursor-default disabled:hover:border-border disabled:hover:bg-surface"
              disabled={!family.href}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${family.tone}`}>
                  <family.icon className="w-5 h-5" />
                </div>
                {family.href ? <ArrowRight className="w-4 h-4 text-text-secondary" /> : null}
              </div>
              <p className="font-semibold text-text-primary mt-4">{t(family.titleKey as MessageKey)}</p>
              <p className="text-sm text-text-secondary mt-2 min-h-[40px]">{t(family.descriptionKey as MessageKey)}</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-primary">{family.count}</span>
                <span className="text-xs text-text-secondary">{family.helper}</span>
              </div>
            </button>
          ))}
        </div>

        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{t('assetsCenter.focus.eyebrow')}</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">{t('assetsCenter.focus.title')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('assetsCenter.focus.subtitle')}</p>
            </div>
            <button
              onClick={() => navigate(selectedAsset?.href || '/servers')}
              disabled={!selectedAsset}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              {t('assetsCenter.focus.openInventory')}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] gap-4">
            <div className="rounded-lg border border-border bg-background/50 p-4">
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">{t('assetsCenter.focus.selectedAsset')}</span>
                <select
                  value={selectedAsset?.id || ''}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary focus:outline-none focus:border-primary"
                >
                  {recentAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {t(asset.typeKey)} - {asset.name}
                    </option>
                  ))}
                  {recentAssets.length === 0 && (
                    <option value="">{t('assetsCenter.recent.empty')}</option>
                  )}
                </select>
              </label>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                <AssetFact label={t('assetsCenter.focus.assetType')} value={selectedAssetType} />
                <AssetFact label={t('assetsCenter.focus.assetMeta')} value={selectedAsset?.meta || '-'} />
                {selectedAsset?.type === 'kubernetes' && (
                  <AssetFact
                    label={t('assetsCenter.focus.backingHosts')}
                    value={selectedAsset.serverIds.length > 0 ? String(selectedAsset.serverIds.length) : '0'}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <AssetFocusAction
                icon={Radar}
                title={t('assetsCenter.focus.diagnose')}
                description={t('assetsCenter.focus.diagnoseDesc')}
                onClick={() => navigate(buildAssetContextPath('/diagnosis-center', selectedAsset))}
                disabled={!selectedAsset}
              />
              <AssetFocusAction
                icon={Wrench}
                title={t('assetsCenter.focus.execute')}
                description={t('assetsCenter.focus.executeDesc')}
                onClick={() => navigate(buildAssetContextPath('/execution-center', selectedAsset))}
                disabled={!selectedAsset}
              />
              <AssetFocusAction
                icon={selectedAsset?.type === 'kubernetes' ? Boxes : Terminal}
                title={selectedAssetConnectionLabel}
                description={selectedAsset?.type === 'kubernetes' ? t('assetsCenter.focus.openKiteDesc') : t('assetsCenter.focus.openTerminalDesc')}
                onClick={() => navigate(selectedAssetConnectionHref)}
                disabled={!selectedAsset}
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-surface border border-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-text-primary mb-4">{t('assetsCenter.actions.title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accessActions.map((action) => (
                <button
                  key={action.href}
                  onClick={() => navigate(action.href)}
                  className="text-left rounded-lg border border-border bg-background/50 p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary">{t(action.titleKey as MessageKey)}</p>
                      <p className="text-sm text-text-secondary mt-1">{t(action.descriptionKey as MessageKey)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-text-primary mb-4">{t('assetsCenter.recent.title')}</h2>
            <div className="space-y-3">
              {recentAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => navigate(asset.href)}
                  className="w-full text-left rounded-lg bg-background/60 border border-border p-3 hover:bg-background transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <asset.icon className="w-4 h-4 text-primary mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{asset.name}</p>
                      <p className="text-xs text-text-secondary mt-1">{t(asset.typeKey)} · {asset.meta}</p>
                    </div>
                  </div>
                </button>
              ))}
              {recentAssets.length === 0 && (
                <div className="py-8 text-center">
                  <Server className="w-8 h-8 text-text-secondary mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">{t('assetsCenter.recent.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-lg font-semibold text-text-primary mb-1">{t('assetsCenter.relation.title')}</h2>
          <p className="text-sm text-text-secondary mb-4">{t('assetsCenter.relation.subtitle')}</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {[
              'assetsCenter.relation.resource',
              'assetsCenter.relation.context',
              'assetsCenter.relation.diagnosis',
              'assetsCenter.relation.case',
              'assetsCenter.relation.execution',
            ].map((key, index, list) => (
              <div key={key} className="flex items-center gap-3">
                <div className="flex-1 rounded-lg bg-background/50 border border-border p-3">
                  <p className="text-sm font-medium text-text-primary">{t(key as MessageKey)}</p>
                </div>
                {index < list.length - 1 && (
                  <ArrowRight className="hidden md:block w-4 h-4 text-text-secondary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-sm font-medium text-text-primary truncate" title={value}>{value}</p>
    </div>
  );
}

function AssetFocusAction({
  icon: Icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: typeof Server;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-left rounded-lg border border-border bg-background/50 p-4 hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <p className="font-semibold text-text-primary mt-4">{title}</p>
      <p className="text-sm text-text-secondary mt-2">{description}</p>
    </button>
  );
}
