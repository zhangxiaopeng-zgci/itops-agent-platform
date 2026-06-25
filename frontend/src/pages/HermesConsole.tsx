import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Brain,
  Cable,
  KanbanSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface AgentItem {
  id: string;
  enabled?: number;
  runtime_type?: string;
  runtime_config?: Record<string, unknown>;
}

interface HermesChannel {
  id: string;
  enabled?: number;
  skills?: unknown[];
  mcpServers?: unknown[];
  tools?: unknown[];
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

export default function HermesConsole() {
  const navigate = useNavigate();
  const { t } = useLocale();

  const { data: channels = [] } = useQuery({
    queryKey: ['hermes-console', 'channels'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels');
      return toArray<HermesChannel>(res.data.data, ['channels', 'items']);
    },
    staleTime: 60000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['hermes-console', 'agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return toArray<AgentItem>(res.data.data, ['agents', 'items']);
    },
    staleTime: 60000,
  });

  const enabledChannels = channels.filter((channel) => channel.enabled !== 0);
  const hermesAgents = agents.filter((agent) => agent.runtime_type === 'hermes' || agent.runtime_config?.provider === 'hermes');
  const skillCount = channels.reduce((count, channel) => count + (Array.isArray(channel.skills) ? channel.skills.length : 0), 0);
  const mcpCount = channels.reduce((count, channel) => count + (Array.isArray(channel.mcpServers) ? channel.mcpServers.length : 0), 0);
  const toolCount = channels.reduce((count, channel) => count + (Array.isArray(channel.tools) ? channel.tools.length : 0), 0);

  const metrics = [
    { labelKey: 'hermesConsole.metric.channels', value: enabledChannels.length, icon: Cable },
    { labelKey: 'hermesConsole.metric.agents', value: hermesAgents.length, icon: Bot },
    { labelKey: 'hermesConsole.metric.skills', value: skillCount, icon: Sparkles },
    { labelKey: 'hermesConsole.metric.mcp', value: mcpCount, icon: Network },
  ];

  const entries = [
    {
      titleKey: 'hermesConsole.entry.channels.title',
      descKey: 'hermesConsole.entry.channels.desc',
      href: '/hermes-channels',
      icon: Cable,
    },
    {
      titleKey: 'hermesConsole.entry.dashboard.title',
      descKey: 'hermesConsole.entry.dashboard.desc',
      href: '/hermes-dashboard',
      icon: KanbanSquare,
    },
    {
      titleKey: 'hermesConsole.entry.assistant.title',
      descKey: 'hermesConsole.entry.assistant.desc',
      href: '/hermes',
      icon: Brain,
    },
    {
      titleKey: 'hermesConsole.entry.agents.title',
      descKey: 'hermesConsole.entry.agents.desc',
      href: '/agents',
      icon: Bot,
    },
    {
      titleKey: 'hermesConsole.entry.skills.title',
      descKey: 'hermesConsole.entry.skills.desc',
      href: '/hermes-channels?focus=skills',
      icon: Sparkles,
    },
    {
      titleKey: 'hermesConsole.entry.mcp.title',
      descKey: 'hermesConsole.entry.mcp.desc',
      href: '/hermes-channels?focus=mcp',
      icon: Network,
    },
    {
      titleKey: 'hermesConsole.entry.policy.title',
      descKey: 'hermesConsole.entry.policy.desc',
      href: '/hermes-channels?focus=policy',
      icon: ShieldCheck,
    },
    {
      titleKey: 'hermesConsole.entry.models.title',
      descKey: 'hermesConsole.entry.models.desc',
      href: '/settings',
      icon: Wrench,
    },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('hermesConsole.title')}</h1>
              <p className="text-text-secondary mt-1">{t('hermesConsole.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/hermes')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Brain className="w-4 h-4" />
            {t('hermesConsole.primaryCta')}
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
          <h2 className="text-lg font-semibold text-text-primary">{t('hermesConsole.capability.title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {t('hermesConsole.capability.desc', { tools: toolCount, skills: skillCount, mcp: mcpCount })}
          </p>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {entries.map((entry) => (
              <button
                key={entry.href}
                onClick={() => navigate(entry.href)}
                className="text-left rounded-lg border border-border bg-background/50 p-4 hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <entry.icon className="w-5 h-5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-secondary" />
                </div>
                <p className="mt-4 font-semibold text-text-primary">{t(entry.titleKey as MessageKey)}</p>
                <p className="mt-2 text-sm text-text-secondary">{t(entry.descKey as MessageKey)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
