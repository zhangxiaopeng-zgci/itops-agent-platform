import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, Gauge, MessageSquare, Settings, Shield, ShieldCheck, Users } from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface HealthSummary {
  status?: string;
  services?: Array<{ name: string; status: string }>;
}

export default function PlatformOperations() {
  const navigate = useNavigate();
  const { t } = useLocale();

  const { data: health } = useQuery({
    queryKey: ['platform-operations', 'health-summary'],
    queryFn: async () => {
      const res = await api.get('/health');
      return res.data as HealthSummary;
    },
    staleTime: 30000,
  });

  const serviceCount = Array.isArray(health?.services) ? health.services.length : 0;
  const unhealthyServices = Array.isArray(health?.services)
    ? health.services.filter((service) => service.status !== 'healthy').length
    : 0;

  const metrics = [
    {
      labelKey: 'platformOperations.metric.health',
      value: health?.status || '-',
      icon: Gauge,
    },
    {
      labelKey: 'platformOperations.metric.services',
      value: String(serviceCount),
      icon: ShieldCheck,
    },
    {
      labelKey: 'platformOperations.metric.warnings',
      value: String(unhealthyServices),
      icon: Shield,
    },
  ];

  const entries = [
    {
      titleKey: 'platformOperations.entry.readiness.title',
      descKey: 'platformOperations.entry.readiness.desc',
      href: '/ops-readiness',
      icon: ShieldCheck,
    },
    {
      titleKey: 'platformOperations.entry.audit.title',
      descKey: 'platformOperations.entry.audit.desc',
      href: '/audit',
      icon: Shield,
    },
    {
      titleKey: 'platformOperations.entry.reports.title',
      descKey: 'platformOperations.entry.reports.desc',
      href: '/reports',
      icon: FileText,
    },
    {
      titleKey: 'platformOperations.entry.notifications.title',
      descKey: 'platformOperations.entry.notifications.desc',
      href: '/notifications',
      icon: MessageSquare,
    },
    {
      titleKey: 'platformOperations.entry.users.title',
      descKey: 'platformOperations.entry.users.desc',
      href: '/users',
      icon: Users,
    },
    {
      titleKey: 'platformOperations.entry.settings.title',
      descKey: 'platformOperations.entry.settings.desc',
      href: '/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('platformOperations.title')}</h1>
              <p className="text-text-secondary mt-1">{t('platformOperations.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/ops-readiness')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {t('platformOperations.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.map((metric) => (
            <div key={metric.labelKey} className="rounded-lg border border-border bg-surface p-4">
              <metric.icon className="w-5 h-5 text-primary" />
              <p className="mt-3 text-2xl font-semibold text-text-primary">{metric.value}</p>
              <p className="text-sm text-text-secondary">{t(metric.labelKey as MessageKey)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('platformOperations.guard.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('platformOperations.guard.desc')}</p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {['deploy', 'data', 'security'].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-background/50 p-4">
                <p className="text-sm font-semibold text-text-primary">{t(`platformOperations.guard.${item}` as MessageKey)}</p>
                <p className="mt-1 text-xs text-text-secondary">{t(`platformOperations.guard.${item}Desc` as MessageKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map((entry) => (
            <button
              key={entry.href}
              onClick={() => navigate(entry.href)}
              className="text-left rounded-lg border border-border bg-surface p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <entry.icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{t(entry.titleKey as MessageKey)}</p>
                    <p className="mt-1 text-sm text-text-secondary">{t(entry.descKey as MessageKey)}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-text-secondary flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
