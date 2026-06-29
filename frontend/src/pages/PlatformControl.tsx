import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  CheckCircle,
  Gauge,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

export default function PlatformControl() {
  const navigate = useNavigate();
  const { t } = useLocale();

  const domains = [
    {
      titleKey: 'platformControl.domain.intelligence.title',
      descKey: 'platformControl.domain.intelligence.desc',
      href: '/hermes-console',
      icon: Brain,
      tone: 'text-cyan-500 bg-cyan-500/10',
    },
    {
      titleKey: 'platformControl.domain.evolution.title',
      descKey: 'platformControl.domain.evolution.desc',
      href: '/evolution-governance',
      icon: Sparkles,
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      titleKey: 'platformControl.domain.operations.title',
      descKey: 'platformControl.domain.operations.desc',
      href: '/platform-operations',
      icon: Gauge,
      tone: 'text-sky-500 bg-sky-500/10',
    },
  ];

  const operatingRules = [
    'platformControl.rule.capability',
    'platformControl.rule.release',
    'platformControl.rule.audit',
  ];

  const quickLinks = [
    { labelKey: 'platformControl.quick.channels', href: '/hermes-channels', icon: Brain },
    { labelKey: 'platformControl.quick.proposals', href: '/evolution-proposals', icon: Sparkles },
    { labelKey: 'platformControl.quick.readiness', href: '/ops-readiness', icon: ShieldCheck },
    { labelKey: 'platformControl.quick.settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('platformControl.title')}</h1>
              <p className="mt-1 text-text-secondary">{t('platformControl.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/platform-operations')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-white transition-colors hover:bg-primary/90"
          >
            <ShieldCheck className="h-4 w-4" />
            {t('platformControl.primaryCta')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {domains.map((domain) => (
            <button
              key={domain.href}
              onClick={() => navigate(domain.href)}
              className="min-h-[184px] rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${domain.tone}`}>
                  <domain.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-text-secondary" />
              </div>
              <p className="mt-5 text-lg font-semibold text-text-primary">{t(domain.titleKey as MessageKey)}</p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t(domain.descKey as MessageKey)}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('platformControl.path.title')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('platformControl.path.desc')}</p>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {['configure', 'govern', 'operate'].map((step, index, list) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex-1 rounded-lg border border-border bg-background/50 p-4">
                    <p className="text-sm font-semibold text-text-primary">{t(`platformControl.path.${step}` as MessageKey)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{t(`platformControl.path.${step}Desc` as MessageKey)}</p>
                  </div>
                  {index < list.length - 1 && <ArrowRight className="hidden h-4 w-4 text-text-tertiary md:block" />}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('platformControl.rules.title')}</h2>
            <div className="mt-4 space-y-3">
              {operatingRules.map((key) => (
                <div key={key} className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <p className="text-sm leading-relaxed text-text-secondary">{t(key as MessageKey)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('platformControl.quick.title')}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => navigate(link.href)}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
                  <link.icon className="h-4 w-4 text-primary" />
                  {t(link.labelKey as MessageKey)}
                </span>
                <ArrowRight className="h-4 w-4 text-text-tertiary" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
