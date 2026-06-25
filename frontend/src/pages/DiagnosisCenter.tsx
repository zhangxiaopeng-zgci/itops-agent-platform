import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Boxes,
  Brain,
  Cpu,
  FileSearch,
  GitBranch,
  Network,
  Radar,
  Server,
  ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

interface AlertItem {
  id: string;
  severity: string;
  status: string;
  title?: string;
  content?: string;
  source?: string;
  server_id?: string;
}

interface ServerItem {
  id: string;
  name?: string;
  hostname?: string;
  enabled: number;
}

interface HermesWorker {
  role?: string;
  status?: string;
  healthStatus?: string;
  health_status?: string;
}

interface OperationCase {
  id: string;
  correlation_id: string;
}

interface TopologyPayload {
  nodes?: TopologyAssetNode[];
  edges?: TopologyAssetEdge[];
}

interface TopologyAssetNode {
  id: string;
  server_id?: string;
  server_name?: string;
  server_ip?: string;
  name?: string;
  ip?: string;
  type?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface TopologyAssetEdge {
  id?: string;
  source: string;
  target: string;
  dependency_type?: string;
  protocol?: string;
  status?: string;
}

interface ActionItem {
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  href: string;
  icon: typeof Brain;
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

function getAssetDisplayName(node: TopologyAssetNode): string {
  return node.name || node.server_name || node.server_id || node.id;
}

function formatServerName(server: ServerItem): string {
  return server.name || server.hostname || server.id;
}

function splitCsv(value: string | null): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMetadataString(node: TopologyAssetNode, key: string): string | undefined {
  const value = node.metadata?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getAssetTypeLabel(type: string | undefined, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const keys: Record<string, MessageKey> = {
    server: 'topology.asset.server',
    network_device: 'topology.asset.networkDevice',
    kubernetes_cluster: 'topology.asset.kubernetesCluster',
    kubernetes_node: 'topology.asset.kubernetesNode',
    kubernetes_namespace: 'topology.asset.kubernetesNamespace',
    kubernetes_workload: 'topology.asset.kubernetesWorkload',
    kubernetes_pod: 'topology.asset.kubernetesPod',
    kubernetes_service: 'topology.asset.kubernetesService',
  };
  return type && keys[type] ? t(keys[type]) : t('topology.asset.generic');
}

function findContextAsset(
  nodes: TopologyAssetNode[],
  assetId: string | null,
  assetType: string | null,
  serverIds: string[]
): TopologyAssetNode | null {
  const normalizedAssetId = assetId || '';
  const normalizedType = assetType || '';

  if (normalizedAssetId) {
    const exact = nodes.find((node) => node.id === normalizedAssetId);
    if (exact) return exact;

    const byServer = nodes.find((node) => node.server_id === normalizedAssetId || (node.type === 'server' && node.id === normalizedAssetId));
    if (byServer) return byServer;

    const byMetadataAsset = nodes.find((node) => {
      const metadataAssetId = getMetadataString(node, 'asset_id');
      if (metadataAssetId !== normalizedAssetId) return false;
      return !normalizedType || node.type === normalizedType;
    });
    if (byMetadataAsset) return byMetadataAsset;
  }

  if (serverIds.length > 0) {
    const serverIdSet = new Set(serverIds);
    const byServerIds = nodes.find((node) => serverIdSet.has(node.server_id || node.id));
    if (byServerIds) return byServerIds;
  }

  return null;
}

function findRelatedServerIds(asset: TopologyAssetNode, nodes: TopologyAssetNode[], edges: TopologyAssetEdge[]): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const related = new Set<string>();

  const addServerFromNode = (node: TopologyAssetNode | undefined) => {
    if (!node) return;
    if (node.type === 'server') related.add(node.server_id || node.id);
    const boundServerId = node.server_id || (typeof node.metadata?.bound_server_id === 'string' ? node.metadata.bound_server_id : undefined);
    if (boundServerId) related.add(boundServerId);
  };

  addServerFromNode(asset);

  const queue: Array<{ id: string; depth: number }> = [{ id: asset.id, depth: 0 }];
  const visited = new Set<string>([asset.id]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= 3) continue;

    const neighbors = edges
      .filter((edge) => edge.source === current.id || edge.target === current.id)
      .map((edge) => edge.source === current.id ? edge.target : edge.source);

    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const neighbor = nodeById.get(neighborId);
      addServerFromNode(neighbor);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    }
  }

  return Array.from(related);
}

function buildDiagnosisPrompt(
  asset: TopologyAssetNode | null,
  alert: AlertItem | null,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  if (!asset && !alert) {
    return t('diagnosisCenter.workspace.prompt.generic');
  }

  const parts = asset
    ? [
      t('diagnosisCenter.workspace.prompt.asset', { name: getAssetDisplayName(asset), type: getAssetTypeLabel(asset.type, t) }),
    ]
    : [];

  if (alert) {
    parts.push(t('diagnosisCenter.workspace.prompt.alert', {
      severity: alert.severity,
      status: alert.status,
      title: alert.title || alert.id,
    }));
  }

  parts.push(t('diagnosisCenter.workspace.prompt.instruction'));
  return parts.join('\n');
}

function ContextMetric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">{label}</p>
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
      </div>
      <p className="mt-2 text-xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-tertiary truncate" title={helper}>{helper}</p>
    </div>
  );
}

function DiagnosisFocusStep({
  index,
  label,
  helper,
  activeLabel,
  active,
}: {
  index: number;
  label: string;
  helper: string;
  activeLabel: string;
  active: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 min-h-[104px] ${active ? 'border-primary bg-primary/10' : 'border-border bg-background/40'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${active ? 'bg-primary text-white' : 'bg-surface text-text-tertiary border border-border'}`}>
          {index}
        </span>
        {active && <span className="text-xs font-medium text-primary">{activeLabel}</span>}
      </div>
      <p className="mt-3 text-sm font-semibold text-text-primary">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">{helper}</p>
    </div>
  );
}

export default function DiagnosisCenter() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLocale();
  const toast = useToast();
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState(searchParams.get('alertId') || '');
  const [urlContextApplied, setUrlContextApplied] = useState(false);
  const urlAssetId = searchParams.get('assetId');
  const urlAssetType = searchParams.get('assetType');
  const urlAssetName = searchParams.get('assetName') || '';
  const urlServerIds = useMemo(() => splitCsv(searchParams.get('serverIds')), [searchParams]);
  const urlK8sClusterId = searchParams.get('k8sClusterId') || '';

  const { data: alerts = [] } = useQuery({
    queryKey: ['diagnosis-center', 'alerts'],
    queryFn: async () => {
      const res = await api.get('/api/alerts');
      return toArray<AlertItem>(res.data.data, ['alerts', 'items']);
    },
    staleTime: 30000,
  });

  const { data: servers = [] } = useQuery({
    queryKey: ['diagnosis-center', 'servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return toArray<ServerItem>(res.data.data, ['servers', 'items']);
    },
    staleTime: 60000,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['diagnosis-center', 'hermes-workers'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-workers');
      return toArray<HermesWorker>(res.data.data, ['workers', 'items']);
    },
    staleTime: 30000,
  });

  const { data: topology } = useQuery({
    queryKey: ['diagnosis-center', 'topology'],
    queryFn: async () => {
      const res = await api.get('/api/topology/global');
      return res.data.data as TopologyPayload;
    },
    staleTime: 60000,
  });

  const openAlerts = alerts.filter((alert) => ['new', 'active', 'open'].includes(alert.status)).length;
  const criticalAlerts = alerts.filter((alert) => ['critical', 'high'].includes(alert.severity)).length;
  const enabledServers = servers.filter((server) => server.enabled === 1).length;
  const diagnoseWorker = workers.find((worker) => worker.role === 'diagnose');
  const diagnoseHealthy = ['healthy', 'ok', 'online'].includes(
    String(diagnoseWorker?.healthStatus || diagnoseWorker?.health_status || diagnoseWorker?.status || '').toLowerCase()
  );
  const topologyNodes = useMemo(() => topology?.nodes || [], [topology?.nodes]);
  const topologyEdges = useMemo(() => topology?.edges || [], [topology?.edges]);
  const selectedAsset = useMemo(() => {
    return topologyNodes.find((node) => node.id === selectedAssetId) || topologyNodes[0] || null;
  }, [selectedAssetId, topologyNodes]);
  const selectedAlert = useMemo(() => {
    return alerts.find((alert) => alert.id === selectedAlertId) || null;
  }, [alerts, selectedAlertId]);
  const relatedServerIds = useMemo(() => {
    const related = new Set(urlServerIds);
    if (selectedAsset) {
      findRelatedServerIds(selectedAsset, topologyNodes, topologyEdges).forEach((serverId) => related.add(serverId));
    }
    return Array.from(related);
  }, [selectedAsset, topologyNodes, topologyEdges, urlServerIds]);
  const relatedServers = useMemo(() => {
    return servers.filter((server) => relatedServerIds.includes(server.id));
  }, [relatedServerIds, servers]);
  const topologyImpact = useMemo(() => {
    if (!selectedAsset) return { upstream: 0, downstream: 0, nearby: [] as TopologyAssetNode[] };
    const upstreamIds = topologyEdges.filter((edge) => edge.target === selectedAsset.id).map((edge) => edge.source);
    const downstreamIds = topologyEdges.filter((edge) => edge.source === selectedAsset.id).map((edge) => edge.target);
    const nearbyIds = Array.from(new Set([...upstreamIds, ...downstreamIds]));
    return {
      upstream: upstreamIds.length,
      downstream: downstreamIds.length,
      nearby: nearbyIds
        .map((id) => topologyNodes.find((node) => node.id === id))
        .filter((node): node is TopologyAssetNode => Boolean(node))
        .slice(0, 6),
    };
  }, [selectedAsset, topologyEdges, topologyNodes]);
  const diagnosisFocusSteps = [
    {
      labelKey: 'diagnosisCenter.focus.step.select',
      helperKey: 'diagnosisCenter.focus.step.selectHelper',
      active: Boolean(selectedAsset),
    },
    {
      labelKey: 'diagnosisCenter.focus.step.context',
      helperKey: 'diagnosisCenter.focus.step.contextHelper',
      active: relatedServerIds.length > 0 || topologyImpact.upstream + topologyImpact.downstream > 0 || Boolean(selectedAlert),
    },
    {
      labelKey: 'diagnosisCenter.focus.step.case',
      helperKey: 'diagnosisCenter.focus.step.caseHelper',
      active: false,
    },
    {
      labelKey: 'diagnosisCenter.focus.step.handoff',
      helperKey: 'diagnosisCenter.focus.step.handoffHelper',
      active: false,
    },
  ];
  const contextFacts = useMemo(() => {
    if (!selectedAsset) return [];
    const facts = [
      [t('diagnosisCenter.workspace.context.asset'), getAssetDisplayName(selectedAsset)],
      [t('diagnosisCenter.workspace.context.type'), getAssetTypeLabel(selectedAsset.type, t)],
      [t('diagnosisCenter.workspace.context.status'), selectedAsset.status || t('common.unknown')],
      [t('diagnosisCenter.workspace.context.relatedServers'), relatedServers.length > 0 ? relatedServers.map(formatServerName).join(', ') : t('common.unknown')],
      [t('diagnosisCenter.workspace.context.impact'), t('diagnosisCenter.workspace.context.impactValue', { upstream: topologyImpact.upstream, downstream: topologyImpact.downstream })],
    ];
    if (selectedAlert) {
      facts.push([
        t('diagnosisCenter.workspace.context.alert'),
        `[${selectedAlert.severity}/${selectedAlert.status}] ${selectedAlert.title || selectedAlert.id}`,
      ]);
    }
    return facts;
  }, [relatedServers, selectedAlert, selectedAsset, t, topologyImpact.downstream, topologyImpact.upstream]);

  useEffect(() => {
    if (urlContextApplied || topologyNodes.length === 0) return;
    const urlAsset = findContextAsset(topologyNodes, urlAssetId, urlAssetType, urlServerIds);
    if (urlAsset) setSelectedAssetId(urlAsset.id);
    if (searchParams.get('alertId')) setSelectedAlertId(searchParams.get('alertId') || '');
    setUrlContextApplied(true);
  }, [searchParams, topologyNodes, urlAssetId, urlAssetType, urlContextApplied, urlServerIds]);

  const createCaseMutation = useMutation({
    mutationFn: async () => {
      const prompt = buildDiagnosisPrompt(selectedAsset, selectedAlert, t);
      const res = await api.post('/api/operation-cases', {
        title: selectedAsset
          ? `${getAssetDisplayName(selectedAsset)} ${t('diagnosisCenter.workspace.caseTitleSuffix')}`
          : t('diagnosisCenter.workspace.caseTitleGeneric'),
        caseType: 'incident',
        status: 'diagnosing',
        severity: selectedAlert?.severity || undefined,
        source: 'diagnosis_center',
        assetId: selectedAsset?.id || undefined,
        assetType: selectedAsset?.type || undefined,
        assetName: selectedAsset ? getAssetDisplayName(selectedAsset) : urlAssetName || undefined,
        alertId: selectedAlert?.id || undefined,
        serverIds: relatedServerIds,
        context: {
          prompt,
          selectedAsset,
          selectedAlert,
          relatedServerIds,
          handoff: {
            assetId: urlAssetId || selectedAsset?.id || undefined,
            assetType: urlAssetType || selectedAsset?.type || undefined,
            assetName: urlAssetName || (selectedAsset ? getAssetDisplayName(selectedAsset) : undefined),
            k8sClusterId: urlK8sClusterId || undefined,
          },
          topologyImpact: {
            upstream: topologyImpact.upstream,
            downstream: topologyImpact.downstream,
            nearbyAssetIds: topologyImpact.nearby.map((node) => node.id),
          },
        },
      });

      return {
        operationCase: res.data.data as OperationCase,
        prompt,
        serverIds: relatedServerIds,
        alertId: selectedAlert?.id || '',
      };
    },
    onSuccess: ({ operationCase, prompt, serverIds, alertId }) => {
      toast.success(t('diagnosisCenter.workspace.caseCreated'));
      const params = new URLSearchParams();
      params.set('mode', 'diagnose');
      params.set('caseId', operationCase.id);
      params.set('correlationId', operationCase.correlation_id);
      if (serverIds.length > 0) params.set('serverIds', serverIds.join(','));
      if (alertId) params.set('alertId', alertId);
      if (selectedAsset?.id) params.set('assetId', selectedAsset.id);
      if (selectedAsset?.type) params.set('assetType', selectedAsset.type);
      if (selectedAsset) params.set('assetName', getAssetDisplayName(selectedAsset));
      if (urlK8sClusterId) params.set('k8sClusterId', urlK8sClusterId);
      params.set('prompt', prompt);
      navigate(`/hermes?${params.toString()}`);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('diagnosisCenter.workspace.caseCreateFailed'));
    },
  });

  const openHermesDiagnosis = () => {
    createCaseMutation.mutate();
  };

  const openHermesWithoutCase = () => {
    const params = new URLSearchParams();
    params.set('mode', 'diagnose');
    if (relatedServerIds.length > 0) params.set('serverIds', relatedServerIds.join(','));
    if (selectedAlert?.id) params.set('alertId', selectedAlert.id);
    if (selectedAsset?.id) params.set('assetId', selectedAsset.id);
    if (selectedAsset?.type) params.set('assetType', selectedAsset.type);
    if (selectedAsset) params.set('assetName', getAssetDisplayName(selectedAsset));
    if (urlK8sClusterId) params.set('k8sClusterId', urlK8sClusterId);
    params.set('prompt', buildDiagnosisPrompt(selectedAsset, selectedAlert, t));
    navigate(`/hermes?${params.toString()}`);
  };

  const handoffExecution = () => {
    const params = new URLSearchParams();
    if (selectedAsset?.id) params.set('assetId', selectedAsset.id);
    if (selectedAsset?.type) params.set('assetType', selectedAsset.type);
    if (selectedAsset) params.set('assetName', getAssetDisplayName(selectedAsset));
    if (relatedServerIds.length > 0) params.set('serverIds', relatedServerIds.join(','));
    if (urlK8sClusterId) params.set('k8sClusterId', urlK8sClusterId);
    navigate(`/execution-center?${params.toString()}`);
  };

  const statusCards = [
    {
      labelKey: 'diagnosisCenter.metric.alerts',
      value: openAlerts,
      helper: criticalAlerts > 0
        ? t('diagnosisCenter.metric.criticalAlerts', { count: criticalAlerts })
        : t('diagnosisCenter.metric.noCriticalAlerts'),
      icon: Bell,
      tone: criticalAlerts > 0 ? 'text-red-500 bg-red-500/10' : 'text-emerald-500 bg-emerald-500/10',
    },
    {
      labelKey: 'diagnosisCenter.metric.assets',
      value: enabledServers,
      helper: t('diagnosisCenter.metric.assetsDesc'),
      icon: Server,
      tone: 'text-blue-500 bg-blue-500/10',
    },
    {
      labelKey: 'diagnosisCenter.metric.topology',
      value: topology?.nodes?.length || 0,
      helper: t('diagnosisCenter.metric.topologyDesc', { count: topology?.edges?.length || 0 }),
      icon: Network,
      tone: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      labelKey: 'diagnosisCenter.metric.hermes',
      value: diagnoseHealthy ? t('common.online') : t('common.unknown'),
      helper: t('diagnosisCenter.metric.hermesDesc'),
      icon: Brain,
      tone: diagnoseHealthy ? 'text-emerald-500 bg-emerald-500/10' : 'text-yellow-500 bg-yellow-500/10',
    },
  ];

  const primaryActions: ActionItem[] = [
    {
      titleKey: 'diagnosisCenter.action.hermes',
      descriptionKey: 'diagnosisCenter.action.hermesDesc',
      href: '/hermes?mode=diagnose',
      icon: Brain,
    },
    {
      titleKey: 'diagnosisCenter.action.alerts',
      descriptionKey: 'diagnosisCenter.action.alertsDesc',
      href: '/alerts',
      icon: AlertTriangle,
    },
    {
      titleKey: 'diagnosisCenter.action.rca',
      descriptionKey: 'diagnosisCenter.action.rcaDesc',
      href: '/root-cause-analysis',
      icon: FileSearch,
    },
    {
      titleKey: 'diagnosisCenter.action.topology',
      descriptionKey: 'diagnosisCenter.action.topologyDesc',
      href: '/topology',
      icon: GitBranch,
    },
    {
      titleKey: 'diagnosisCenter.action.knowledge',
      descriptionKey: 'diagnosisCenter.action.knowledgeDesc',
      href: '/knowledge',
      icon: BookOpen,
    },
  ];

  const flowSteps = [
    { labelKey: 'diagnosisCenter.flow.alert', icon: Bell },
    { labelKey: 'diagnosisCenter.flow.hermes', icon: Brain },
    { labelKey: 'diagnosisCenter.flow.evidence', icon: FileSearch },
    { labelKey: 'diagnosisCenter.flow.impact', icon: Network },
    { labelKey: 'diagnosisCenter.flow.handoff', icon: ShieldCheck },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <Radar className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{t('diagnosisCenter.title')}</h1>
                <p className="text-text-secondary mt-1">{t('diagnosisCenter.subtitle')}</p>
              </div>
            </div>
          </div>
          <button
            onClick={openHermesDiagnosis}
            disabled={createCaseMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Brain className="w-4 h-4" />
            {createCaseMutation.isPending ? t('diagnosisCenter.workspace.creatingCase') : t('diagnosisCenter.primaryCta')}
          </button>
        </div>

        <section className="rounded-lg border border-primary/25 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface border border-border text-primary flex items-center justify-center flex-shrink-0">
                  <Radar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{t('diagnosisCenter.focus.eyebrow')}</p>
                  <h2 className="mt-1 text-base font-semibold text-text-primary">{t('diagnosisCenter.focus.title')}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{t('diagnosisCenter.focus.subtitle')}</p>
                </div>
              </div>
            </div>
            <button
              onClick={openHermesDiagnosis}
              disabled={!selectedAsset || createCaseMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <Brain className="w-4 h-4" />
              {createCaseMutation.isPending ? t('diagnosisCenter.workspace.creatingCase') : t('diagnosisCenter.focus.cta')}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {diagnosisFocusSteps.map((step, index) => (
              <DiagnosisFocusStep
                key={step.labelKey}
                index={index + 1}
                label={t(step.labelKey as MessageKey)}
                helper={t(step.helperKey as MessageKey)}
                activeLabel={t('diagnosisCenter.focus.active')}
                active={step.active}
              />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] gap-4">
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">{t('diagnosisCenter.workspace.title')}</h2>
                <p className="text-sm text-text-secondary mt-1">{t('diagnosisCenter.workspace.subtitle')}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-text-secondary">{t('diagnosisCenter.workspace.asset')}</span>
                <select
                  value={selectedAsset?.id || ''}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary"
                >
                  {topologyNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {getAssetTypeLabel(node.type, t)} - {getAssetDisplayName(node)}
                    </option>
                  ))}
                  {topologyNodes.length === 0 && (
                    <option value="">{t('diagnosisCenter.workspace.noAssets')}</option>
                  )}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-text-secondary">{t('diagnosisCenter.workspace.alert')}</span>
                <select
                  value={selectedAlertId}
                  onChange={(event) => setSelectedAlertId(event.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary"
                >
                  <option value="">{t('diagnosisCenter.workspace.noAlert')}</option>
                  {alerts.slice(0, 50).map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      [{alert.severity}/{alert.status}] {alert.title || alert.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <ContextMetric
                icon={Server}
                label={t('diagnosisCenter.workspace.relatedServers')}
                value={String(relatedServers.length)}
                helper={relatedServers.length > 0 ? relatedServers.map(formatServerName).join(', ') : t('diagnosisCenter.workspace.noRelatedServers')}
              />
              <ContextMetric
                icon={Network}
                label={t('diagnosisCenter.workspace.topologyImpact')}
                value={`${topologyImpact.upstream}/${topologyImpact.downstream}`}
                helper={t('diagnosisCenter.workspace.topologyImpactHelper')}
              />
              <ContextMetric
                icon={Cpu}
                label={t('diagnosisCenter.workspace.assetType')}
                value={selectedAsset ? getAssetTypeLabel(selectedAsset.type, t) : '-'}
                helper={selectedAsset?.status || t('common.unknown')}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={openHermesDiagnosis}
                disabled={!selectedAsset || createCaseMutation.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm"
              >
                <Brain className="w-4 h-4" />
                {createCaseMutation.isPending ? t('diagnosisCenter.workspace.creatingCase') : t('diagnosisCenter.workspace.runHermes')}
              </button>
              <button
                onClick={openHermesWithoutCase}
                disabled={!selectedAsset}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background disabled:opacity-50 transition-colors text-sm"
              >
                <ArrowRight className="w-4 h-4" />
                {t('diagnosisCenter.workspace.runHermesOnly')}
              </button>
              <button
                onClick={() => navigate('/topology')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background transition-colors text-sm"
              >
                <GitBranch className="w-4 h-4" />
                {t('diagnosisCenter.workspace.viewTopology')}
              </button>
              <button
                onClick={handoffExecution}
                disabled={!selectedAsset}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-primary hover:bg-background disabled:opacity-50 transition-colors text-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                {t('diagnosisCenter.workspace.handoffExecution')}
              </button>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-base font-semibold text-text-primary">{t('diagnosisCenter.workspace.contextTitle')}</h2>
            <p className="text-sm text-text-secondary mt-1">{t('diagnosisCenter.workspace.contextSubtitle')}</p>
            <div className="mt-4 space-y-3">
              {contextFacts.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs text-text-secondary">{label}</p>
                  <p className="mt-1 text-sm font-medium text-text-primary break-words">{value}</p>
                </div>
              ))}
              {topologyImpact.nearby.length > 0 && (
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs text-text-secondary">{t('diagnosisCenter.workspace.nearbyAssets')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topologyImpact.nearby.map((node) => (
                      <span key={node.id} className="px-2 py-1 rounded-md bg-surface border border-border text-xs text-text-secondary">
                        {getAssetDisplayName(node)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statusCards.map((card) => (
            <div key={card.labelKey} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-text-secondary">{t(card.labelKey as MessageKey)}</p>
                  <p className="text-2xl font-semibold text-text-primary mt-2">{card.value}</p>
                  <p className="text-xs text-text-secondary mt-2">{card.helper}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.tone}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold text-text-primary mb-4">{t('diagnosisCenter.flow.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {flowSteps.map((step, index) => (
              <div key={step.labelKey} className="flex items-center gap-3">
                <div className="flex-1 min-w-0 rounded-lg border border-border bg-background/40 p-3">
                  <step.icon className="w-4 h-4 text-primary mb-2" />
                  <p className="text-sm font-medium text-text-primary">{t(step.labelKey as MessageKey)}</p>
                </div>
                {index < flowSteps.length - 1 && (
                  <ArrowRight className="hidden md:block w-4 h-4 text-text-secondary flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-text-primary mb-4">{t('diagnosisCenter.actions.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {primaryActions.map((action) => (
              <button
                key={action.href}
                onClick={() => navigate(action.href)}
                className="text-left bg-surface border border-border rounded-lg p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <action.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{t(action.titleKey)}</p>
                    <p className="text-sm text-text-secondary mt-1">{t(action.descriptionKey)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
