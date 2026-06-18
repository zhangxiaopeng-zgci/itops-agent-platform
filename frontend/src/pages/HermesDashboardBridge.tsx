import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ExternalLink, KanbanSquare, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

interface HermesDashboardSettings {
  enabled: boolean;
  dashboardUrl: string;
  embedMode: 'link' | 'iframe' | 'sidecar';
  authMode: 'none' | 'reverse_proxy' | 'token';
  allowedOrigins: string[];
}

interface HermesDashboardHealth {
  enabled: boolean;
  reachable: boolean;
  status: 'disabled' | 'not_configured' | 'healthy' | 'unreachable';
  dashboardUrl: string | null;
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
}

interface HermesExternalLink {
  id: string;
  source_type: string;
  source_id: string;
  correlation_id: string | null;
  external_url: string;
  external_card_id: string | null;
  external_state: string | null;
  title: string | null;
  updated_at: string;
}

const emptySettings: HermesDashboardSettings = {
  enabled: false,
  dashboardUrl: '',
  embedMode: 'link',
  authMode: 'none',
  allowedOrigins: [],
};

const healthLabelKeys: Record<HermesDashboardHealth['status'], MessageKey> = {
  disabled: 'hermesDashboard.health.disabled',
  not_configured: 'hermesDashboard.health.notConfigured',
  healthy: 'hermesDashboard.health.healthy',
  unreachable: 'hermesDashboard.health.unreachable',
};

export default function HermesDashboardBridge() {
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const [formData, setFormData] = useState(emptySettings);
  const [allowedOriginsText, setAllowedOriginsText] = useState('');

  const { data: settings = emptySettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['hermes-dashboard-settings'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-dashboard/settings');
      return res.data.data as HermesDashboardSettings;
    },
  });

  const { data: health, isFetching: healthFetching } = useQuery({
    queryKey: ['hermes-dashboard-health'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-dashboard/health');
      return res.data.data as HermesDashboardHealth;
    },
  });

  const { data: links = [] } = useQuery({
    queryKey: ['hermes-dashboard-external-links'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-dashboard/external-links?limit=10');
      return res.data.data as HermesExternalLink[];
    },
  });

  useEffect(() => {
    setFormData(settings);
    setAllowedOriginsText(settings.allowedOrigins.join(', '));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: HermesDashboardSettings = {
        ...formData,
        allowedOrigins: allowedOriginsText.split(',').map((item) => item.trim()).filter(Boolean),
      };
      const res = await api.put('/api/hermes-dashboard/settings', payload);
      return res.data.data as HermesDashboardSettings;
    },
    onSuccess: () => {
      toast.success(t('hermesDashboard.toast.saved'));
      queryClient.invalidateQueries({ queryKey: ['hermes-dashboard-settings'] });
      queryClient.invalidateQueries({ queryKey: ['hermes-dashboard-health'] });
    },
    onError: () => {
      toast.error(t('hermesDashboard.toast.saveFailed'));
    },
  });

  const statusTone = health?.status === 'healthy'
    ? 'text-green-500 bg-green-500/10'
    : health?.status === 'disabled'
      ? 'text-text-secondary bg-background'
      : 'text-yellow-500 bg-yellow-500/10';

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <KanbanSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{t('hermesDashboard.title')}</h1>
              <p className="text-text-secondary mt-1">{t('hermesDashboard.subtitle')}</p>
            </div>
          </div>
          {settings.dashboardUrl && (
            <a
              href={settings.dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t('hermesDashboard.open')}
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusCard
            icon={Activity}
            label={t('hermesDashboard.health.status')}
            value={health ? t(healthLabelKeys[health.status]) : t('common.loading')}
            tone={statusTone}
          />
          <StatusCard
            icon={RefreshCw}
            label={t('hermesDashboard.health.latency')}
            value={health?.latencyMs === null || health?.latencyMs === undefined ? '-' : `${health.latencyMs}ms`}
            tone="text-cyan-500 bg-cyan-500/10"
          />
          <StatusCard
            icon={ShieldCheck}
            label={t('hermesDashboard.health.mode')}
            value={`${settings.embedMode} / ${settings.authMode}`}
            tone="text-emerald-500 bg-emerald-500/10"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t('hermesDashboard.config.title')}</h2>
              {healthFetching && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            </div>
            {settingsLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    disabled={!isAdmin}
                    onChange={(event) => setFormData({ ...formData, enabled: event.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-text-primary">{t('hermesDashboard.config.enabled')}</span>
                </label>

                <Field label={t('hermesDashboard.config.url')}>
                  <input
                    value={formData.dashboardUrl}
                    disabled={!isAdmin}
                    onChange={(event) => setFormData({ ...formData, dashboardUrl: event.target.value })}
                    placeholder="http://127.0.0.1:9119"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary disabled:opacity-70"
                  />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={t('hermesDashboard.config.embedMode')}>
                    <select
                      value={formData.embedMode}
                      disabled={!isAdmin}
                      onChange={(event) => setFormData({ ...formData, embedMode: event.target.value as HermesDashboardSettings['embedMode'] })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary disabled:opacity-70"
                    >
                      <option value="link">link</option>
                      <option value="iframe">iframe</option>
                      <option value="sidecar">sidecar</option>
                    </select>
                  </Field>
                  <Field label={t('hermesDashboard.config.authMode')}>
                    <select
                      value={formData.authMode}
                      disabled={!isAdmin}
                      onChange={(event) => setFormData({ ...formData, authMode: event.target.value as HermesDashboardSettings['authMode'] })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary disabled:opacity-70"
                    >
                      <option value="none">none</option>
                      <option value="reverse_proxy">reverse_proxy</option>
                      <option value="token">token</option>
                    </select>
                  </Field>
                </div>

                <Field label={t('hermesDashboard.config.allowedOrigins')}>
                  <input
                    value={allowedOriginsText}
                    disabled={!isAdmin}
                    onChange={(event) => setAllowedOriginsText(event.target.value)}
                    placeholder="http://10.1.132.58:3000"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary disabled:opacity-70"
                  />
                </Field>

                {health?.error && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-600 px-3 py-2 text-sm">
                    {health.error}
                  </div>
                )}

                {isAdmin && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {t('common.save')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-lg font-semibold text-text-primary mb-4">{t('hermesDashboard.links.title')}</h2>
            <div className="space-y-3">
              {links.map((link) => (
                <a
                  key={link.id}
                  href={link.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-border bg-background/60 p-3 hover:border-primary/60 transition-colors"
                >
                  <p className="text-sm font-semibold text-text-primary truncate">{link.title || link.external_card_id || link.source_id}</p>
                  <p className="text-xs text-text-secondary mt-1">{link.source_type} · {link.external_state || '-'}</p>
                </a>
              ))}
              {links.length === 0 && (
                <div className="py-10 text-center">
                  <KanbanSquare className="w-8 h-8 text-text-secondary mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">{t('hermesDashboard.links.empty')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-semibold text-text-primary text-right">{value}</span>
      </div>
      <p className="text-sm text-text-secondary mt-3">{label}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-text-primary mb-1">{label}</span>
      {children}
    </label>
  );
}
