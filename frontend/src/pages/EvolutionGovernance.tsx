import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, GitPullRequest, History, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface EvolutionProposal {
  id: string;
  status: string;
  priority?: string;
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

export default function EvolutionGovernance() {
  const navigate = useNavigate();
  const { t } = useLocale();

  const { data: proposals = [] } = useQuery({
    queryKey: ['evolution-governance', 'proposals'],
    queryFn: async () => {
      const res = await api.get('/api/evolution-proposals', { params: { limit: 200 } });
      return toArray<EvolutionProposal>(res.data.data, ['proposals', 'items']);
    },
    staleTime: 60000,
  });

  const pending = proposals.filter((proposal) => ['draft', 'generated', 'eval_pending', 'approval_pending'].includes(proposal.status)).length;
  const approved = proposals.filter((proposal) => ['approved', 'published'].includes(proposal.status)).length;
  const highPriority = proposals.filter((proposal) => ['high', 'critical'].includes(String(proposal.priority || '').toLowerCase())).length;

  const metrics = [
    { labelKey: 'evolutionGovernance.metric.proposals', value: proposals.length, icon: Sparkles },
    { labelKey: 'evolutionGovernance.metric.pending', value: pending, icon: GitPullRequest },
    { labelKey: 'evolutionGovernance.metric.approved', value: approved, icon: ShieldCheck },
    { labelKey: 'evolutionGovernance.metric.highPriority', value: highPriority, icon: ClipboardCheck },
  ];

  const entries = [
    {
      titleKey: 'evolutionGovernance.entry.proposals.title',
      descKey: 'evolutionGovernance.entry.proposals.desc',
      href: '/evolution-proposals',
      icon: Sparkles,
    },
    {
      titleKey: 'evolutionGovernance.entry.evaluation.title',
      descKey: 'evolutionGovernance.entry.evaluation.desc',
      href: '/evolution-proposals?stage=evaluation',
      icon: ClipboardCheck,
    },
    {
      titleKey: 'evolutionGovernance.entry.release.title',
      descKey: 'evolutionGovernance.entry.release.desc',
      href: '/evolution-proposals?stage=release',
      icon: ShieldCheck,
    },
    {
      titleKey: 'evolutionGovernance.entry.cases.title',
      descKey: 'evolutionGovernance.entry.cases.desc',
      href: '/operation-cases?status=evolving',
      icon: History,
    },
    {
      titleKey: 'evolutionGovernance.entry.audit.title',
      descKey: 'evolutionGovernance.entry.audit.desc',
      href: '/audit',
      icon: RotateCcw,
    },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('evolutionGovernance.title')}</h1>
              <p className="text-text-secondary mt-1">{t('evolutionGovernance.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/evolution-proposals')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {t('evolutionGovernance.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <div key={metric.labelKey} className="rounded-lg border border-border bg-surface p-4">
              <metric.icon className="w-5 h-5 text-primary" />
              <p className="mt-3 text-2xl font-semibold text-text-primary">{metric.value}</p>
              <p className="text-sm text-text-secondary">{t(metric.labelKey as MessageKey)}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('evolutionGovernance.pipeline.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('evolutionGovernance.pipeline.desc')}</p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-5 gap-3">
            {['proposal', 'evaluation', 'replay', 'approval', 'publish'].map((step, index, list) => (
              <div key={step} className="flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-border bg-background/50 p-3 min-h-[76px]">
                  <p className="text-sm font-semibold text-text-primary">{t(`evolutionGovernance.pipeline.${step}` as MessageKey)}</p>
                  <p className="mt-1 text-xs text-text-secondary">{t(`evolutionGovernance.pipeline.${step}Desc` as MessageKey)}</p>
                </div>
                {index < list.length - 1 && <ArrowRight className="hidden md:block w-4 h-4 text-text-secondary" />}
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
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <entry.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{t(entry.titleKey as MessageKey)}</p>
                  <p className="mt-1 text-sm text-text-secondary">{t(entry.descKey as MessageKey)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
