import { useMemo } from 'react';
import {
  Boxes,
  ExternalLink,
  Monitor,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';

function getKiteUrl(): string {
  if (typeof window === 'undefined') return 'http://10.1.132.58:3002';
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '10.1.132.58';
  return `${protocol}//${hostname}:3002`;
}

export default function KubernetesConsole() {
  const { t } = useLocale();
  const kiteUrl = useMemo(() => getKiteUrl(), []);

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
          <a
            href={kiteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            {t('kubernetesConsole.open')}
          </a>
        </div>

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
            src={kiteUrl}
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
