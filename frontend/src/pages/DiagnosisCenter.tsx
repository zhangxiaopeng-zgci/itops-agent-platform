import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  Brain,
  FileSearch,
  GitBranch,
  Network,
  Radar,
  Server,
  ShieldCheck,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface AlertItem {
  id: string;
  severity: string;
  status: string;
}

interface ServerItem {
  id: string;
  enabled: number;
}

interface HermesWorker {
  role?: string;
  status?: string;
  healthStatus?: string;
  health_status?: string;
}

interface TopologyPayload {
  nodes?: unknown[];
  edges?: unknown[];
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

export default function DiagnosisCenter() {
  const navigate = useNavigate();
  const { t } = useLocale();

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
      href: '/hermes',
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
            onClick={() => navigate('/hermes')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Brain className="w-4 h-4" />
            {t('diagnosisCenter.primaryCta')}
          </button>
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
