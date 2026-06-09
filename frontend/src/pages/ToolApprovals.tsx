import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldAlert, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';

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
  execution_result?: {
    success?: boolean;
    error?: string;
    data?: unknown;
  } | null;
}

const statusLabels: Record<ToolApproval['status'], string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  executed: '已执行',
  failed: '执行失败'
};

export default function ToolApprovals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">工具审批</h1>
            <p className="text-text-secondary">审批 Agent 或外部 Runtime 提交的中高风险工具请求</p>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {['pending', 'executed', 'failed', 'rejected', ''].map((item) => (
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
              {item ? statusLabels[item as ToolApproval['status']] : '全部'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            {isLoading ? (
              <div className="p-10 text-center text-text-secondary">加载中...</div>
            ) : approvals.length === 0 ? (
              <div className="p-10 text-center text-text-secondary">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                暂无审批请求
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
                          {new Date(approval.requested_at).toLocaleString()} · {approval.source || 'api'}
                        </p>
                      </div>
                      <StatusBadge status={approval.status} />
                    </div>
	                    <p className="text-sm text-text-secondary line-clamp-2">
	                      {approval.reason || '等待人工审批'}
	                    </p>
	                    {extractTaskId(approval) && (
	                      <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs border border-primary/20">
	                        <ExternalLink className="w-3.5 h-3.5" />
	                        task {shortId(extractTaskId(approval)!)}
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
                选择一条审批请求查看详情
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-text-primary">{selectedApproval.tool_name}</h2>
                    <p className="text-sm text-text-secondary">{selectedApproval.risk_level}</p>
                  </div>
                  <StatusBadge status={selectedApproval.status} />
                </div>

	                <DetailRow label="来源" value={selectedApproval.source || '-'} />
	                <DetailRow label="请求角色" value={selectedApproval.requester_role || '-'} />
	                <DetailRow label="原因" value={selectedApproval.reason || '-'} />
	                {selectedTaskId && (
	                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
	                    <p className="text-xs text-text-secondary mb-1">关联任务</p>
	                    <div className="flex items-center justify-between gap-3">
	                      <code className="text-sm text-text-primary break-all">{selectedTaskId}</code>
	                      <button
	                        onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(selectedTaskId)}`)}
	                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
	                      >
	                        <ExternalLink className="w-4 h-4" />
	                        查看
	                      </button>
	                    </div>
	                  </div>
	                )}

	                <div>
                  <p className="text-xs text-text-secondary mb-2">输入参数</p>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-background border border-border p-3 text-xs text-text-primary whitespace-pre-wrap">
                    {JSON.stringify(selectedApproval.input, null, 2)}
                  </pre>
                </div>

                {selectedApproval.execution_result && (
                  <div>
                    <p className="text-xs text-text-secondary mb-2">执行结果</p>
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
                      placeholder="审批意见..."
                      className="w-full h-24 px-3 py-2 rounded-lg bg-background border border-border text-text-primary focus:outline-none focus:border-primary resize-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => rejectMutation.mutate(selectedApproval.id)}
                        disabled={rejectMutation.isPending || approveMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        拒绝
                      </button>
                      <button
                        onClick={() => approveMutation.mutate(selectedApproval.id)}
                        disabled={rejectMutation.isPending || approveMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        批准并执行
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

function StatusBadge({ status }: { status: ToolApproval['status'] }) {
  return (
    <span className={clsx(
      'px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap',
      status === 'pending' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      status === 'executed' && 'bg-green-500/10 text-green-400 border-green-500/30',
      status === 'failed' && 'bg-red-500/10 text-red-400 border-red-500/30',
      status === 'rejected' && 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      status === 'approved' && 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    )}>
      {statusLabels[status]}
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

function extractTaskId(approval: ToolApproval): string | null {
  const directTaskId = readStringField(approval.input, 'taskId');
  if (directTaskId) return directTaskId;
  return findStringField(approval.execution_result, 'taskId');
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
