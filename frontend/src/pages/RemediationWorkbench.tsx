import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { 
  CheckCircle, 
  XCircle, 
  Play,
  RefreshCw,
  Clock,
  AlertTriangle,
  Eye,
  RotateCcw,
  Shield
} from 'lucide-react';

export default function RemediationWorkbench() {
  const queryClient = useQueryClient();
  const { locale, t } = useLocale();
  const [page, setPage] = useState(1);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const limit = 20;
  const browserLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';

  const { data, isLoading } = useQuery({
    queryKey: ['remediation-audits', page],
    queryFn: async () => {
      const res = await api.get('/api/remediation-audits', {
        params: { page: String(page), limit: String(limit) }
      });
      return res.data.data;
    }
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await api.post(`/api/remediation-audits/${id}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-audits'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      await api.post(`/api/remediation-audits/${id}/approve`, { action: 'reject', comment: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-audits'] });
    }
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/remediation-audits/${id}/execute`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-audits'] });
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/remediation-audits/${id}/rollback`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-audits'] });
    }
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/remediation-audits/${id}/verify`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remediation-audits'] });
    }
  });

  const { data: auditDetail } = useQuery({
    queryKey: ['remediation-audit-detail', selectedAuditId],
    queryFn: async () => {
      if (!selectedAuditId) return null;
      const res = await api.get(`/api/remediation-audits/${selectedAuditId}`);
      return res.data.data;
    },
    enabled: !!selectedAuditId
  });

  const handleViewDetail = (id: string) => {
    setSelectedAuditId(id);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedAuditId(null);
  };

  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'pending': <Clock className="w-4 h-4 text-blue-500" />,
      'approved': <CheckCircle className="w-4 h-4 text-green-500" />,
      'rejected': <XCircle className="w-4 h-4 text-red-500" />,
      'executing': <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />,
      'success': <CheckCircle className="w-4 h-4 text-green-500" />,
      'failed': <XCircle className="w-4 h-4 text-red-500" />
    };
    return iconMap[status] || <Clock className="w-4 h-4 text-slate-500" />;
  };

  const getStatusText = (status: string) => {
    const map: Record<string, MessageKey> = {
      pending: 'remediation.status.pendingApproval',
      approved: 'remediation.status.approved',
      rejected: 'remediation.status.rejected',
      executing: 'remediation.status.executing',
      success: 'common.success',
      failed: 'common.failed'
    };
    return map[status] ? t(map[status]) : status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      'pending': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'approved': 'bg-green-500/10 text-green-400 border-green-500/20',
      'rejected': 'bg-red-500/10 text-red-400 border-red-500/20',
      'executing': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'success': 'bg-green-500/10 text-green-400 border-green-500/20',
      'failed': 'bg-red-500/10 text-red-400 border-red-500/20'
    };
    return map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  const getRiskLevelColor = (level: string) => {
    const map: Record<string, string> = {
      'low': 'bg-green-500/10 text-green-400',
      'medium': 'bg-yellow-500/10 text-yellow-400',
      'high': 'bg-red-500/10 text-red-400'
    };
    return map[level] || 'bg-slate-500/10 text-slate-400';
  };

  const getRiskLevelText = (level: string) => {
    const map: Record<string, MessageKey> = {
      low: 'status.severity.low',
      medium: 'status.severity.medium',
      high: 'status.severity.high'
    };
    return map[level] ? t(map[level]) : level;
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleString(browserLocale, {
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const pendingAudits = data?.audits?.filter((a: any) => a.status === 'pending') || [];
  const recentExecutions = data?.audits?.filter((a: any) => a.status !== 'pending') || [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{t('remediationWorkbench.title')}</h2>
            <p className="text-slate-400 text-sm">{t('remediationWorkbench.subtitle')}</p>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['remediation-audits'] })}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white hover:bg-slate-700/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>

        {pendingAudits.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              {t('remediationWorkbench.pending.title')}
              <span className="ml-auto text-sm font-normal text-slate-400">{t('remediationWorkbench.pending.count', { count: pendingAudits.length })}</span>
            </h3>
            <div className="grid gap-4">
              {pendingAudits.map((audit: any) => (
                <div key={audit.id} className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(audit.risk_level)}`}>
                          {t('remediationWorkbench.riskLabel', { risk: getRiskLevelText(audit.risk_level) })}
                        </span>
                        <span className="text-sm text-slate-300">{audit.rca_title || audit.rca_id?.slice(0, 8)}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {t('remediationWorkbench.policyLabel', { value: audit.policy_name || audit.policy_id?.slice(0, 8) || '-' })} |
                        {t('remediationWorkbench.createdAt', { time: formatTime(audit.created_at) })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => approveMutation.mutate({ id: audit.id })}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600/20 text-green-400 rounded-lg hover:bg-green-600/30 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t('remediation.common.approve')}
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate({ id: audit.id })}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        {t('remediation.common.reject')}
                      </button>
                      <button
                        onClick={() => executeMutation.mutate(audit.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        {t('remediation.common.execute')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-slate-400" />
            {t('remediationWorkbench.recent.title')}
          </h3>

          {isLoading ? (
            <div className="text-center py-12 text-slate-400">{t('common.loading')}</div>
          ) : !data?.audits?.length ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">{t('remediationWorkbench.empty')}</p>
            </div>
          ) : (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationWorkbench.table.createdAt')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationWorkbench.table.rootCause')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationWorkbench.table.policy')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('remediationWorkbench.table.riskLevel')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">{t('common.status')}</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">{t('remediation.common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audits.map((audit: any) => (
                    <tr key={audit.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="py-3 px-4 text-sm text-white">{formatTime(audit.created_at)}</td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-slate-300">{audit.rca_title || audit.rca_id?.slice(0, 8)}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300">{audit.policy_name || audit.policy_id?.slice(0, 8)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(audit.risk_level)}`}>
                          {getRiskLevelText(audit.risk_level)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(audit.status)}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(audit.status)}`}>
                            {getStatusText(audit.status)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleViewDetail(audit.id)}
                            className="p-1.5 text-slate-400 hover:text-white transition-colors"
                            title={t('remediation.common.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {(audit.status === 'success' || audit.status === 'failed') && !audit.is_rollback && (
                            <button
                              onClick={() => {
                                if (window.confirm(t('remediationWorkbench.confirmRollback'))) {
                                  rollbackMutation.mutate(audit.id);
                                }
                              }}
                              disabled={rollbackMutation.isPending}
                              className="p-1.5 text-yellow-400 hover:text-yellow-300 transition-colors disabled:opacity-50"
                              title={t('remediation.common.rollback')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {(audit.status === 'success' || audit.status === 'completed') && (
                            <button
                              onClick={() => verifyMutation.mutate(audit.id)}
                              disabled={verifyMutation.isPending}
                              className="p-1.5 text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
                              title={t('remediation.common.verify')}
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                          )}
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
              <div className="text-sm text-slate-400">{t('remediation.common.totalRecords', { count: data.total })}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700/50 transition-colors"
                >
                  {t('remediation.common.prevPage')}
                </button>
                <span className="text-slate-400 text-sm">{page}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white hover:bg-slate-700/50 transition-colors"
                >
                  {t('remediation.common.nextPage')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDetailModal && auditDetail && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseModal}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white">{t('remediationWorkbench.detail.title')}</h3>
              <button
                onClick={handleCloseModal}
                className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700/50"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-slate-900/50 rounded-lg p-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.rootCause')}</div>
                  <div className="text-sm text-white">{auditDetail.rca_title || auditDetail.rca_id?.slice(0, 8)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.policy')}</div>
                  <div className="text-sm text-white">{auditDetail.policy_name || auditDetail.policy_id?.slice(0, 8)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.riskLevel')}</div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(auditDetail.risk_level)}`}>
                    {getRiskLevelText(auditDetail.risk_level)}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.status')}</div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(auditDetail.status)}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(auditDetail.status)}`}>
                      {getStatusText(auditDetail.status)}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.createdAt')}</div>
                  <div className="text-sm text-white">{formatTime(auditDetail.created_at)}</div>
                </div>
                {auditDetail.approved_at && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('remediationWorkbench.detail.approvedAt')}</div>
                    <div className="text-sm text-white">{formatTime(auditDetail.approved_at)}</div>
                  </div>
                )}
              </div>

              {auditDetail.recommendations && (
                <div>
                  <div className="text-xs text-slate-500 mb-2">{t('remediationWorkbench.detail.recommendations')}</div>
                  <div className="bg-slate-900/50 rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap">
                    {typeof auditDetail.recommendations === 'string'
                      ? auditDetail.recommendations
                      : JSON.stringify(auditDetail.recommendations, null, 2)}
                  </div>
                </div>
              )}

              {auditDetail.execution_log && (
                <div>
                  <div className="text-xs text-slate-500 mb-2">{t('remediationWorkbench.detail.executionLog')}</div>
                  <pre className="bg-slate-900/50 rounded-lg p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                    {typeof auditDetail.execution_log === 'string'
                      ? auditDetail.execution_log
                      : JSON.stringify(auditDetail.execution_log, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-between">
              <div className="flex gap-2">
                {(auditDetail.status === 'success' || auditDetail.status === 'failed') && !auditDetail.is_rollback && (
                  <button
                    onClick={() => {
                      if (window.confirm(t('remediationWorkbench.confirmRollback'))) {
                        rollbackMutation.mutate(auditDetail.id);
                      }
                    }}
                    disabled={rollbackMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg hover:bg-yellow-600/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {rollbackMutation.isPending ? t('remediationWorkbench.rollbacking') : t('remediation.common.rollback')}
                  </button>
                )}
                {(auditDetail.status === 'success' || auditDetail.status === 'completed') && (
                  <button
                    onClick={() => {
                      verifyMutation.mutate(auditDetail.id);
                    }}
                    disabled={verifyMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Shield className="w-4 h-4" />
                    {verifyMutation.isPending ? t('remediationWorkbench.verifying') : t('remediation.common.verify')}
                  </button>
                )}
              </div>
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
