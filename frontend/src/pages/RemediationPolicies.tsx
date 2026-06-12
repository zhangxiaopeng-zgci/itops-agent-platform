import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Settings, 
  Plus, 
  Search, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter
} from 'lucide-react';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

export default function RemediationPolicies() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['remediation-policies', enabledFilter, page],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (enabledFilter !== 'all') {
        params.enabled = enabledFilter === 'enabled' ? 'true' : 'false';
      }
      const res = await api.get('/api/remediation-policies', { params });
      return res.data.data;
    }
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/remediation-policies/${id}/toggle`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-policies'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/remediation-policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-policies'] });
    }
  });

  const policies = (data?.policies || []).filter((p: any) => 
    !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (enabled: number) => {
    return enabled ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-gray-500" />
    );
  };

  const getExecutionModeText = (mode: string) => {
    const map: Record<string, MessageKey> = {
      'auto': 'remediationPolicies.mode.auto',
      'approval': 'remediationPolicies.mode.approval',
      'suggestion': 'remediationPolicies.mode.suggestion'
    };
    return map[mode] ? t(map[mode]) : mode;
  };

  const getExecutionModeColor = (mode: string) => {
    const map: Record<string, string> = {
      'auto': 'text-green-400',
      'approval': 'text-yellow-400',
      'suggestion': 'text-blue-400'
    };
    return map[mode] || 'text-gray-400';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{t('remediationPolicies.title')}</h2>
            <p className="text-slate-400 text-sm">{t('remediationPolicies.subtitle')}</p>
          </div>
          <button
            onClick={() => navigate('/remediation-policies/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            {t('remediationPolicies.new')}
          </button>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('remediationPolicies.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={enabledFilter}
              onChange={(e) => setEnabledFilter(e.target.value)}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">{t('remediation.common.allStatus')}</option>
              <option value="enabled">{t('status.enabled')}</option>
              <option value="disabled">{t('status.disabled')}</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">{t('common.loading')}</div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <Settings className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-4">{t('remediationPolicies.empty')}</p>
            <button
              onClick={() => navigate('/remediation-policies/new')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
            >
              {t('remediationPolicies.createFirst')}
            </button>
          </div>
        ) : (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationPolicies.table.name')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationPolicies.table.trigger')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationPolicies.table.mode')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationPolicies.table.rateLimit')}</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('common.status')}</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('remediation.common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy: any) => (
                  <tr key={policy.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(policy.enabled)}
                        <div>
                          <div className="text-white font-medium">{policy.name}</div>
                          {policy.description && (
                            <div className="text-xs text-slate-500 mt-0.5">{policy.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-300">{policy.alert_source}</div>
                      {policy.alert_severity && (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3 text-yellow-500" />
                          <span className="text-xs text-slate-500">{policy.alert_severity}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-sm font-medium ${getExecutionModeColor(policy.execution_mode)}`}>
                        {getExecutionModeText(policy.execution_mode)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-300">
                      {t('remediationPolicies.rate.perHour', { count: policy.max_executions_per_hour })}
                      <div className="text-xs text-slate-500 mt-0.5">{t('remediationPolicies.rate.cooldown', { seconds: policy.cooldown_seconds })}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        policy.enabled 
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {policy.enabled ? t('status.enabled') : t('status.disabled')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleMutation.mutate(policy.id)}
                          className="p-1.5 text-slate-400 hover:text-white transition-colors"
                          title={policy.enabled ? t('status.disabled') : t('status.enabled')}
                        >
                          {policy.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => navigate(`/remediation-policies/${policy.id}`)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors"
                          title={t('common.edit')}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(t('remediationPolicies.confirmDelete'))) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                          title={t('common.delete')}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > limit && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-slate-400">
              {t('remediationPolicies.total', { count: data.total })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700/50 transition-colors"
              >
                {t('remediation.common.prevPage')}
              </button>
              <span className="text-slate-400 text-sm">
                {page} / {Math.ceil(data.total / limit)}
              </span>
              <button
                onClick={() => setPage(p => Math.min(Math.ceil(data.total / limit), p + 1))}
                disabled={page >= Math.ceil(data.total / limit)}
                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700/50 transition-colors"
              >
                {t('remediation.common.nextPage')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
