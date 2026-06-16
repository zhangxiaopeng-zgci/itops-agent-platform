import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldAlert, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface ToolApproval {
  id: string;
  tool_name: string;
  input: Record<string, unknown>;
  requester_user_id?: string | null;
  requester_role?: string | null;
  source?: string | null;
  risk_level: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  requested_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  correlation_id?: string | null;
  execution_result?: {
    success?: boolean;
    error?: string;
    data?: unknown;
  } | null;
}

interface ApprovalSafetyPlan {
  schemaVersion?: string;
  riskLevel?: string;
  riskClass?: string;
  approvalRequired?: boolean;
  verificationRequired?: boolean;
  destructive?: boolean;
  proposedAction?: string;
  impact?: string;
  rollback?: string;
  validation?: string;
}

interface ApprovalVerificationRequirement {
  schemaVersion?: string;
  required?: boolean;
  status?: string;
  source?: string;
  approvalId?: string;
  toolName?: string;
  riskLevel?: string;
  correlationId?: string | null;
  taskId?: string | null;
  method?: string;
  expectedStatus?: string;
  validationPlan?: string | null;
  createdAt?: string;
}

const statusLabelKeys: Record<ToolApproval['status'], MessageKey> = {
  pending: 'toolApprovals.status.pending',
  approved: 'toolApprovals.status.approved',
  rejected: 'toolApprovals.status.rejected',
  executed: 'toolApprovals.status.executed',
  failed: 'toolApprovals.status.failed'
};

export default function ToolApprovals() {
  const { locale, t } = useLocale();
  const browserLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('pending');
  const [selectedApproval, setSelectedApproval] = useState<ToolApproval | null>(null);
  const [comment, setComment] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tool-approvals', status],
    queryFn: async () => {
      const res = await api.get('/api/tool-approvals', {
        params: status ? { status } : {}
      });
      return res.data.data as { approvals: ToolApproval[]; total: number };
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await api.post(`/api/tool-approvals/${approvalId}/approve`, { comment });
      return res.data.data as ToolApproval;
    },
    onSuccess: (approval) => {
      setSelectedApproval(approval);
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await api.post(`/api/tool-approvals/${approvalId}/reject`, { comment });
      return res.data.data as ToolApproval;
    },
    onSuccess: (approval) => {
      setSelectedApproval(approval);
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    }
  });

  const approvals = data?.approvals || [];
  const selectedTaskId = selectedApproval ? extractTaskId(selectedApproval) : null;
  const selectedProposalId = selectedApproval ? extractProposalId(selectedApproval) : null;
  const selectedSafetyPlan = selectedApproval ? getSafetyPlan(selectedApproval) : null;
  const selectedVerificationRequirement = selectedApproval ? getVerificationRequirement(selectedApproval) : null;

  useEffect(() => {
    const approvalId = searchParams.get('approvalId');
    if (!approvalId || selectedApproval?.id === approvalId) {
      return;
    }

    setStatus('');
    api.get(`/api/tool-approvals/${approvalId}`)
      .then((res) => setSelectedApproval(res.data.data as ToolApproval))
      .catch(() => {
        // Keep the current list view if the deep link target is unavailable.
      });
  }, [searchParams, selectedApproval?.id]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('toolApprovals.title')}</h1>
            <p className="text-text-secondary">{t('toolApprovals.subtitle')}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {['pending', 'approved', 'executed', 'failed', 'rejected', ''].map((item) => (
            <button
              key={item || 'all'}
              onClick={() => {
                setStatus(item);
                setSelectedApproval(null);
              }}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                status === item
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-text-secondary border-border hover:text-text-primary'
              )}
            >
              {item ? t(statusLabelKeys[item as ToolApproval['status']]) : t('common.all')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            {isLoading ? (
              <div className="p-10 text-center text-text-secondary">{t('common.loading')}</div>
            ) : approvals.length === 0 ? (
              <div className="p-10 text-center text-text-secondary">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                {t('toolApprovals.empty')}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {approvals.map((approval) => (
                  <button
                    key={approval.id}
                    onClick={() => setSelectedApproval(approval)}
                    className={clsx(
                      'w-full text-left p-4 hover:bg-background/60 transition-colors',
                      selectedApproval?.id === approval.id && 'bg-background/80'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <span className="font-semibold text-text-primary truncate">{approval.tool_name}</span>
                        </div>
                        <p className="text-xs text-text-secondary mt-1">
                          {new Date(approval.requested_at).toLocaleString(browserLocale)} · {approval.source || 'api'}
                        </p>
                      </div>
                      <StatusBadge status={approval.status} t={t} />
                    </div>
	                    <p className="text-sm text-text-secondary line-clamp-2">
	                      {approval.reason || t('toolApprovals.pendingReason')}
	                    </p>
	                    {extractTaskId(approval) && (
	                      <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs border border-primary/20">
	                        <ExternalLink className="w-3.5 h-3.5" />
	                        {t('toolApprovals.taskShort', { id: shortId(extractTaskId(approval)!) })}
	                      </div>
	                    )}
	                  </button>
	                ))}
              </div>
            )}
          </div>

          <div className="bg-surface rounded-xl border border-border p-5 h-fit">
            {!selectedApproval ? (
              <div className="text-center text-text-secondary py-10">
                {t('toolApprovals.selectPrompt')}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-text-primary">{selectedApproval.tool_name}</h2>
                    <p className="text-sm text-text-secondary">{selectedApproval.risk_level}</p>
                  </div>
                  <StatusBadge status={selectedApproval.status} t={t} />
                </div>

	                <DetailRow label={t('toolApprovals.detail.source')} value={selectedApproval.source || '-'} />
	                <DetailRow label={t('toolApprovals.detail.requesterRole')} value={selectedApproval.requester_role || '-'} />
	                <DetailRow label={t('toolApprovals.detail.correlation')} value={selectedApproval.correlation_id || '-'} />
	                <DetailRow label={t('toolApprovals.detail.reason')} value={selectedApproval.reason || '-'} />
	                {selectedTaskId && (
	                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
	                    <p className="text-xs text-text-secondary mb-1">{t('toolApprovals.relatedTask')}</p>
	                    <div className="flex items-center justify-between gap-3">
	                      <code className="text-sm text-text-primary break-all">{selectedTaskId}</code>
	                      <button
	                        onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(selectedTaskId)}`)}
	                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
	                      >
	                        <ExternalLink className="w-4 h-4" />
	                        {t('common.details')}
	                      </button>
	                    </div>
	                  </div>
	                )}
                {selectedProposalId && (
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                    <p className="text-xs text-text-secondary mb-1">{t('toolApprovals.relatedProposal')}</p>
                    <div className="flex items-center justify-between gap-3">
                      <code className="text-sm text-text-primary break-all">{selectedProposalId}</code>
                      <button
                        onClick={() => navigate(`/evolution-proposals?proposalId=${encodeURIComponent(selectedProposalId)}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('toolApprovals.openProposal')}
                      </button>
                    </div>
                  </div>
                )}

                {selectedSafetyPlan && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{t('toolApprovals.safety.title')}</p>
                        <p className="text-xs text-text-secondary mt-1">{t('toolApprovals.safety.subtitle')}</p>
                      </div>
                      <span className={clsx(
                        'px-2 py-1 rounded-md border text-xs whitespace-nowrap',
                        selectedSafetyPlan.destructive
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      )}>
                        {selectedSafetyPlan.riskClass || selectedSafetyPlan.riskLevel || '-'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <SafetyMetric label={t('toolApprovals.safety.approval')} value={selectedSafetyPlan.approvalRequired ? t('common.yes') : t('common.no')} />
                      <SafetyMetric label={t('toolApprovals.safety.verification')} value={selectedSafetyPlan.verificationRequired ? t('common.yes') : t('common.no')} />
                    </div>
                    <div className="space-y-2">
                      <SafetyText label={t('toolApprovals.safety.impact')} value={selectedSafetyPlan.impact} />
                      <SafetyText label={t('toolApprovals.safety.rollback')} value={selectedSafetyPlan.rollback} />
                      <SafetyText label={t('toolApprovals.safety.validation')} value={selectedSafetyPlan.validation} />
                    </div>
                  </div>
                )}

                {selectedVerificationRequirement && (
                  <div className="rounded-lg border border-green-500/25 bg-green-500/5 p-3">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{t('toolApprovals.verification.title')}</p>
                        <p className="text-xs text-text-secondary mt-1">{t('toolApprovals.verification.subtitle')}</p>
                      </div>
                      <span className="px-2 py-1 rounded-md border text-xs whitespace-nowrap bg-green-500/10 text-green-400 border-green-500/30">
                        {selectedVerificationRequirement.status || 'pending'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <SafetyMetric label={t('toolApprovals.verification.method')} value={selectedVerificationRequirement.method || '-'} />
                      <SafetyMetric label={t('toolApprovals.verification.expectedStatus')} value={selectedVerificationRequirement.expectedStatus || '-'} />
                    </div>
                    {selectedVerificationRequirement.taskId ? (
                      <div className="rounded-md bg-background border border-border px-2 py-2 mb-3">
                        <p className="text-[11px] text-text-tertiary mb-1">{t('toolApprovals.verification.task')}</p>
                        <div className="flex items-center justify-between gap-3">
                          <code className="text-xs text-text-primary break-all">{selectedVerificationRequirement.taskId}</code>
                          <button
                            onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(selectedVerificationRequirement.taskId!)}`)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap text-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t('common.details')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-md bg-background border border-border px-2 py-2 mb-3 text-xs text-text-secondary">
                        {t('toolApprovals.verification.manual')}
                      </p>
                    )}
                    <SafetyText label={t('toolApprovals.verification.plan')} value={selectedVerificationRequirement.validationPlan || undefined} />
                  </div>
                )}

	                <div>
                  <p className="text-xs text-text-secondary mb-2">{t('toolApprovals.inputParams')}</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-background border border-border p-3 text-xs text-text-primary whitespace-pre-wrap">
                    {JSON.stringify(selectedApproval.input, null, 2)}
                  </pre>
                </div>

                {selectedApproval.execution_result && (
                  <div>
                    <p className="text-xs text-text-secondary mb-2">{t('toolApprovals.executionResult')}</p>
                    <pre className="max-h-64 overflow-auto rounded-lg bg-background border border-border p-3 text-xs text-text-primary whitespace-pre-wrap">
                      {JSON.stringify(selectedApproval.execution_result, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedApproval.status === 'pending' && (
                  <div className="space-y-3 pt-3 border-t border-border">
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder={t('toolApprovals.commentPlaceholder')}
                      className="w-full h-24 px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary resize-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => rejectMutation.mutate(selectedApproval.id)}
                        disabled={rejectMutation.isPending || approveMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        {t('toolApprovals.reject')}
                      </button>
                      <button
                        onClick={() => approveMutation.mutate(selectedApproval.id)}
                        disabled={rejectMutation.isPending || approveMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {t('toolApprovals.approveAndExecute')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: ToolApproval['status']; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  return (
    <span className={clsx(
      'px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap',
      status === 'pending' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      status === 'executed' && 'bg-green-500/10 text-green-400 border-green-500/30',
      status === 'failed' && 'bg-red-500/10 text-red-400 border-red-500/30',
      status === 'rejected' && 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      status === 'approved' && 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    )}>
      {t(statusLabelKeys[status])}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm text-text-primary break-words">{value}</p>
    </div>
  );
}

function SafetyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-background border border-border px-2 py-1.5">
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className="text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function SafetyText({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="text-sm text-text-secondary leading-5">{value || '-'}</p>
    </div>
  );
}

function extractTaskId(approval: ToolApproval): string | null {
  const directTaskId = readStringField(approval.input, 'taskId');
  if (directTaskId) return directTaskId;
  return findStringField(approval.execution_result, 'taskId');
}

function extractProposalId(approval: ToolApproval): string | null {
  return findStringField(approval.execution_result, 'proposalId');
}

function getSafetyPlan(approval: ToolApproval): ApprovalSafetyPlan | null {
  const plan = approval.input?.safetyPlan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return null;
  }

  const record = plan as Record<string, unknown>;
  return {
    schemaVersion: readStringField(record, 'schemaVersion') || undefined,
    riskLevel: readStringField(record, 'riskLevel') || undefined,
    riskClass: readStringField(record, 'riskClass') || undefined,
    approvalRequired: record.approvalRequired === true,
    verificationRequired: record.verificationRequired === true,
    destructive: record.destructive === true,
    proposedAction: readStringField(record, 'proposedAction') || undefined,
    impact: readStringField(record, 'impact') || undefined,
    rollback: readStringField(record, 'rollback') || undefined,
    validation: readStringField(record, 'validation') || undefined,
  };
}

function getVerificationRequirement(approval: ToolApproval): ApprovalVerificationRequirement | null {
  const requirement = findObjectWithSchema(
    approval.execution_result,
    'approval.verificationRequirement.v1'
  );
  if (!requirement) {
    return null;
  }

  return {
    schemaVersion: readStringField(requirement, 'schemaVersion') || undefined,
    required: requirement.required === true,
    status: readStringField(requirement, 'status') || undefined,
    source: readStringField(requirement, 'source') || undefined,
    approvalId: readStringField(requirement, 'approvalId') || undefined,
    toolName: readStringField(requirement, 'toolName') || undefined,
    riskLevel: readStringField(requirement, 'riskLevel') || undefined,
    correlationId: readStringField(requirement, 'correlationId'),
    taskId: readStringField(requirement, 'taskId'),
    method: readStringField(requirement, 'method') || undefined,
    expectedStatus: readStringField(requirement, 'expectedStatus') || undefined,
    validationPlan: readStringField(requirement, 'validationPlan'),
    createdAt: readStringField(requirement, 'createdAt') || undefined,
  };
}

function findObjectWithSchema(value: unknown, schemaVersion: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObjectWithSchema(item, schemaVersion);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (readStringField(record, 'schemaVersion') === schemaVersion) {
    return record;
  }

  for (const child of Object.values(record)) {
    const found = findObjectWithSchema(child, schemaVersion);
    if (found) return found;
  }

  return null;
}

function findStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, key);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = readStringField(record, key);
  if (direct) return direct;

  for (const child of Object.values(record)) {
    const found = findStringField(child, key);
    if (found) return found;
  }

  return null;
}

function readStringField(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}
