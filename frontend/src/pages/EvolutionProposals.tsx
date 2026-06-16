import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, CheckCircle2, Clock, FileText, Gauge, PlayCircle, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

type ProposalStatus =
  | 'draft'
  | 'generated'
  | 'eval_pending'
  | 'eval_passed'
  | 'eval_failed'
  | 'approval_pending'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

interface EvolutionProposal {
  id: string;
  title: string;
  type: string;
  status: ProposalStatus;
  priority: string;
  source: string;
  source_ref?: string | null;
  target_descriptor: unknown;
  proposal_body: string;
  evidence_refs: unknown;
  risk_notes?: string | null;
  eval_summary: unknown;
  review_comment?: string | null;
  correlation_id?: string | null;
  agent_execution_id?: string | null;
  hermes_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

interface StructuredPatchOperation {
  op: string;
  path: string;
  value?: unknown;
  reason?: string;
  riskLevel?: string;
  requiresApproval?: boolean;
}

interface StructuredPatch {
  schemaVersion: string;
  patchId: string;
  kind: string;
  applyMode: string;
  target?: {
    objectType?: string;
    targetId?: string | null;
    selector?: Record<string, unknown>;
  };
  summary?: string;
  operations?: StructuredPatchOperation[];
  rollbackPlan?: {
    strategy?: string;
    notes?: string;
  };
  createdAt?: string;
}

interface ProposalEvent {
  id: string;
  event_type: string;
  actor_id?: string | null;
  comment?: string | null;
  metadata: unknown;
  created_at: string;
}

interface EvaluationFinding {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
}

interface ReplaySample {
  source: string;
  id: string;
  status?: string | null;
  correlationId?: string | null;
  summary: string;
}

interface ProposalEvaluation {
  id: string;
  status: string;
  passed: number;
  score: number;
  safety_score: number;
  evidence_score: number;
  completeness_score: number;
  replay_score: number;
  replay_sample_count: number;
  findings: EvaluationFinding[];
  replay_samples: ReplaySample[];
  result_summary?: Record<string, unknown> | null;
  created_at: string;
}

interface ReleaseVersion {
  id: string;
  proposal_id: string;
  object_type: string;
  target_id?: string | null;
  version_label: string;
  status: 'active' | 'superseded' | 'rolled_back';
  payload: unknown;
  previous_version_id?: string | null;
  published_at?: string | null;
  rolled_back_at?: string | null;
  rollback_reason?: string | null;
}

interface EvolutionTask {
  id: string;
  name: string;
  kind: string;
  schedule: string;
  description?: string | null;
  enabled: number;
  last_run_at?: string | null;
  last_status?: string | null;
}

interface EvolutionTaskRun {
  id: string;
  task_id: string;
  kind: string;
  status: string;
  generated_proposal_id?: string | null;
  result_summary: unknown;
  error?: string | null;
  started_at: string;
  completed_at?: string | null;
}

interface EvolutionQueueItem {
  id: string;
  source_type: string;
  source_id: string;
  reason?: string | null;
  priority: string;
  status: string;
  correlation_id?: string | null;
  generated_proposal_id?: string | null;
  created_at: string;
  proposal?: {
    id: string;
    title: string;
    type: string;
    status: ProposalStatus;
    priority: string;
    evaluation?: {
      id: string;
      status: string;
      passed: number;
      score: number;
      finding_counts?: {
        critical: number;
        warning: number;
        info: number;
      } | null;
      created_at: string;
    } | null;
  } | null;
  review_value?: {
    label: 'queued' | 'candidate' | 'needs_evaluation' | 'needs_work' | 'review' | 'promote';
    score?: number | null;
    should_promote: boolean;
    reason: string;
  };
  cluster?: {
    key: string;
    normalized_reason: string;
    occurrence_count: number;
    linked_proposal_count: number;
    first_seen_at?: string | null;
    last_seen_at?: string | null;
    samples: Array<{
      id: string;
      source_id: string;
      reason?: string | null;
      created_at: string;
    }>;
  } | null;
}

const panelClass = 'bg-surface/95 rounded-xl border border-border shadow-sm';
const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all';

const proposalTypes = [
  'skill_update',
  'workflow_template_update',
  'tool_policy_update',
  'knowledge_update',
  'mcp_binding_update',
  'prompt_update'
];

const statusOptions = [
  '',
  'draft',
  'generated',
  'eval_pending',
  'eval_passed',
  'eval_failed',
  'approval_pending',
  'approved',
  'published',
  'rejected',
  'archived'
];

export default function EvolutionProposals() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'skill_update',
    priority: 'P2',
    evidenceWindowHours: 24,
    correlationId: '',
    prompt: ''
  });
  const [comment, setComment] = useState('');

  const canGenerate = user?.role === 'admin' || user?.role === 'operator';
  const canApprove = user?.role === 'admin';

  useEffect(() => {
    const proposalId = searchParams.get('proposalId');
    if (!proposalId) {
      return;
    }
    setStatusFilter('');
    setSelectedId(proposalId);
  }, [searchParams]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evolution-proposals', statusFilter],
    queryFn: async () => {
      const res = await api.get('/api/evolution-proposals', {
        params: statusFilter ? { status: statusFilter } : {}
      });
      return res.data.data as { proposals: EvolutionProposal[]; total: number };
    }
  });

  const proposals = data?.proposals || [];
  const selectedProposal = useMemo(() => {
    if (proposals.length === 0) return null;
    return proposals.find((proposal) => proposal.id === selectedId) || (selectedId ? null : proposals[0]);
  }, [proposals, selectedId]);
  const activeProposalId = selectedProposal?.id || selectedId;

  const { data: detail } = useQuery({
    queryKey: ['evolution-proposal-detail', activeProposalId],
    enabled: Boolean(activeProposalId),
    queryFn: async () => {
      const res = await api.get(`/api/evolution-proposals/${activeProposalId!}`);
      return res.data.data as {
        proposal: EvolutionProposal;
        events: ProposalEvent[];
        evaluations: ProposalEvaluation[];
        releases: ReleaseVersion[];
      };
    }
  });

  const activeProposal = detail?.proposal || selectedProposal;

  const { data: evolutionTasks } = useQuery({
    queryKey: ['evolution-tasks'],
    queryFn: async () => {
      const res = await api.get('/api/evolution-tasks');
      return res.data.data as EvolutionTask[];
    },
    refetchInterval: 30000
  });

  const { data: taskRuns } = useQuery({
    queryKey: ['evolution-task-runs'],
    queryFn: async () => {
      const res = await api.get('/api/evolution-tasks/runs?limit=6');
      return res.data.data as EvolutionTaskRun[];
    },
    refetchInterval: 30000
  });

  const { data: reviewQueue } = useQuery({
    queryKey: ['evolution-review-queue'],
    queryFn: async () => {
      const res = await api.get('/api/evolution-tasks/queue?limit=6');
      return res.data.data as EvolutionQueueItem[];
    },
    refetchInterval: 30000
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/evolution-proposals/generate', {
        type: form.type,
        priority: form.priority,
        evidenceWindowHours: form.evidenceWindowHours,
        correlationId: form.correlationId.trim() || undefined,
        prompt: form.prompt.trim() || undefined
      });
      return res.data.data as EvolutionProposal;
    },
    onSuccess: (proposal) => {
      toast.success(t('evolution.toast.generated'));
      setSelectedId(proposal.id);
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.toast.generateFailed'));
    }
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProposalStatus }) => {
      const res = await api.post(`/api/evolution-proposals/${id}/status`, {
        status,
        comment: comment.trim() || undefined
      });
      return res.data.data as EvolutionProposal;
    },
    onSuccess: (proposal) => {
      toast.success(t('evolution.toast.statusUpdated'));
      setComment('');
      setSelectedId(proposal.id);
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-proposal-detail', proposal.id] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.toast.statusFailed'));
    }
  });

  const evaluateMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await api.post(`/api/evolution-proposals/${proposalId}/evaluate`);
      return res.data.data as ProposalEvaluation;
    },
    onSuccess: (_evaluation, proposalId) => {
      toast.success(t('evolution.toast.evaluated'));
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-proposal-detail', proposalId] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.toast.evaluateFailed'));
    }
  });

  const publishMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await api.post(`/api/evolution-proposals/${proposalId}/publish`, {
        comment: comment.trim() || undefined
      });
      return res.data.data as ReleaseVersion;
    },
    onSuccess: (_version, proposalId) => {
      toast.success(t('evolution.toast.published'));
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-proposal-detail', proposalId] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.toast.publishFailed'));
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await api.post(`/api/evolution-proposals/releases/versions/${versionId}/rollback`, {
        reason: comment.trim() || undefined
      });
      return res.data.data as ReleaseVersion;
    },
    onSuccess: (_version) => {
      toast.success(t('evolution.toast.rolledBack'));
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
      if (activeProposal?.id) {
        queryClient.invalidateQueries({ queryKey: ['evolution-proposal-detail', activeProposal.id] });
      }
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.toast.rollbackFailed'));
    }
  });

  const runTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.post(`/api/evolution-tasks/${taskId}/run`);
      return res.data.data as EvolutionTaskRun;
    },
    onSuccess: () => {
      toast.success(t('evolution.continuous.toast.runComplete'));
      queryClient.invalidateQueries({ queryKey: ['evolution-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-task-runs'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['evolution-proposals'] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('evolution.continuous.toast.runFailed'));
    }
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('evolution.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('evolution.subtitle')}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('common.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
        <div className="space-y-5">
          <ContinuousEvolutionPanel
            tasks={evolutionTasks || []}
            runs={taskRuns || []}
            queue={reviewQueue || []}
            onOpenProposal={(proposalId) => {
              setSelectedId(proposalId);
              navigate(`/evolution-proposals?proposalId=${encodeURIComponent(proposalId)}`);
            }}
            canRun={canGenerate}
            runningTaskId={runTaskMutation.variables}
            isRunning={runTaskMutation.isPending}
            onRun={(taskId) => runTaskMutation.mutate(taskId)}
          />

          <section className={`${panelClass} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{t('evolution.generate.title')}</h2>
                <p className="text-xs text-text-tertiary mt-0.5">{t('evolution.generate.subtitle')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-text-tertiary">{t('evolution.type')}</span>
                <select
                  className={`${inputClass} mt-1`}
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                >
                  {proposalTypes.map((type) => (
                    <option key={type} value={type}>{typeLabel(type)}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-text-tertiary">{t('evolution.priority')}</span>
                  <select
                    className={`${inputClass} mt-1`}
                    value={form.priority}
                    onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  >
                    {['P0', 'P1', 'P2', 'P3'].map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-text-tertiary">{t('evolution.window')}</span>
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min={1}
                    max={168}
                    value={form.evidenceWindowHours}
                    onChange={(event) => setForm({ ...form, evidenceWindowHours: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-text-tertiary">{t('evolution.correlation')}</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={form.correlationId}
                  onChange={(event) => setForm({ ...form, correlationId: event.target.value })}
                  placeholder="correlationId"
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-tertiary">{t('evolution.prompt')}</span>
                <textarea
                  className={`${inputClass} mt-1 min-h-[96px] resize-y`}
                  value={form.prompt}
                  onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  placeholder={t('evolution.promptPlaceholder')}
                />
              </label>
              <button
                disabled={!canGenerate || generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <PlayCircle className="w-4 h-4" />
                {generateMutation.isPending ? t('evolution.generating') : t('evolution.generate.button')}
              </button>
              {!canGenerate && (
                <div className="text-xs text-text-tertiary">{t('evolution.generate.noPermission')}</div>
              )}
            </div>
          </section>

          <section className={`${panelClass} p-5`}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-text-primary">{t('evolution.list.title')}</h2>
              <select
                className="px-2 py-1 rounded-md bg-background border border-border text-xs text-text-secondary"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option key={status || 'all'} value={status}>
                    {status ? statusLabel(status as ProposalStatus) : t('common.all')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {isLoading && <div className="text-sm text-text-tertiary">{t('common.loading')}</div>}
              {!isLoading && proposals.length === 0 && (
                <div className="text-sm text-text-tertiary">{t('evolution.empty')}</div>
              )}
              {proposals.map((proposal) => (
                <button
                  key={proposal.id}
                  onClick={() => setSelectedId(proposal.id)}
                  className={clsx(
                    'w-full text-left rounded-lg border p-3 transition-colors',
                    activeProposal?.id === proposal.id
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border bg-background hover:border-primary/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{proposal.title}</div>
                      <div className="text-xs text-text-tertiary mt-1 truncate">{typeLabel(proposal.type)} · {proposal.priority}</div>
                    </div>
                    <StatusBadge status={proposal.status} />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className={`${panelClass} p-5 min-h-[620px]`}>
          {!activeProposal ? (
            <div className="h-full flex items-center justify-center text-sm text-text-tertiary">
              {t('evolution.selectHint')}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusBadge status={activeProposal.status} />
                    <span className="text-xs text-text-tertiary">{activeProposal.priority}</span>
                    <span className="text-xs text-text-tertiary">{typeLabel(activeProposal.type)}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-text-primary break-words">{activeProposal.title}</h2>
                  <div className="text-xs text-text-tertiary mt-2">
                    {activeProposal.source} · {formatTime(activeProposal.created_at)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={evaluateMutation.isPending ? t('evolution.evaluating') : t('evolution.action.evaluate')}
                    icon={<Gauge className="w-4 h-4" />}
                    disabled={!canGenerate || evaluateMutation.isPending}
                    onClick={() => evaluateMutation.mutate(activeProposal.id)}
                  />
                  <ActionButton
                    label={t('evolution.action.evalPending')}
                    icon={<Clock className="w-4 h-4" />}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'eval_pending' })}
                  />
                  <ActionButton
                    label={t('evolution.action.evalPassed')}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'eval_passed' })}
                  />
                  <ActionButton
                    label={t('evolution.action.approvalPending')}
                    icon={<ShieldCheck className="w-4 h-4" />}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'approval_pending' })}
                  />
                  <ActionButton
                    label={t('evolution.action.approve')}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    disabled={!canApprove || statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'approved' })}
                  />
                  <ActionButton
                    label={publishMutation.isPending ? t('evolution.publishing') : t('evolution.action.publish')}
                    icon={<ShieldCheck className="w-4 h-4" />}
                    disabled={!canApprove || publishMutation.isPending}
                    onClick={() => publishMutation.mutate(activeProposal.id)}
                  />
                  <ActionButton
                    label={t('evolution.action.reject')}
                    icon={<XCircle className="w-4 h-4" />}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'rejected' })}
                  />
                  <ActionButton
                    label={t('evolution.action.archive')}
                    icon={<Archive className="w-4 h-4" />}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: activeProposal.id, status: 'archived' })}
                  />
                </div>
              </div>

              <label className="block">
                <span className="text-xs text-text-tertiary">{t('evolution.reviewComment')}</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t('evolution.reviewCommentPlaceholder')}
                />
              </label>

              <InfoGrid proposal={activeProposal} />

              <EvaluationPanel evaluations={detail?.evaluations || []} />

              <StructuredPatchPanel proposal={activeProposal} />

              <ReleasePanel
                releases={detail?.releases || []}
                canRollback={canApprove}
                isRollingBack={rollbackMutation.isPending}
                onRollback={(versionId) => rollbackMutation.mutate(versionId)}
              />

              <DetailSection title={t('evolution.body')} icon={<FileText className="w-4 h-4" />}>
                <pre className="whitespace-pre-wrap break-words text-sm text-text-secondary leading-6">{activeProposal.proposal_body}</pre>
              </DetailSection>

              <DetailSection title={t('evolution.evidence')} icon={<ShieldCheck className="w-4 h-4" />}>
                <pre className="whitespace-pre-wrap break-words text-xs text-text-secondary leading-5">
                  {JSON.stringify(activeProposal.evidence_refs || {}, null, 2)}
                </pre>
              </DetailSection>

              <DetailSection title={t('evolution.events')} icon={<Clock className="w-4 h-4" />}>
                <div className="space-y-2">
                  {(detail?.events || []).map((event) => (
                    <div key={event.id} className="rounded-lg bg-background border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-text-primary">{event.event_type}</span>
                        <span className="text-xs text-text-tertiary">{formatTime(event.created_at)}</span>
                      </div>
                      {event.comment && <div className="text-xs text-text-secondary mt-1">{event.comment}</div>}
                    </div>
                  ))}
                </div>
              </DetailSection>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StructuredPatchPanel({ proposal }: { proposal: EvolutionProposal }) {
  const { t } = useLocale();
  const patch = getStructuredPatch(proposal);

  return (
    <DetailSection title={t('evolution.patch.title')} icon={<FileText className="w-4 h-4" />}>
      {!patch ? (
        <div className="text-sm text-text-tertiary">{t('evolution.patch.empty')}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <PatchInfo label={t('evolution.patch.schema')} value={patch.schemaVersion} />
            <PatchInfo label={t('evolution.patch.kind')} value={patch.kind} />
            <PatchInfo label={t('evolution.patch.applyMode')} value={patch.applyMode} />
            <PatchInfo label={t('evolution.patch.target')} value={`${patch.target?.objectType || '-'} / ${patch.target?.targetId || 'global'}`} />
          </div>

          <div>
            <div className="text-xs font-medium text-text-tertiary mb-2">{t('evolution.patch.operations')}</div>
            <div className="space-y-2">
              {(patch.operations || []).map((operation, index) => (
                <div key={`${operation.op}-${operation.path}-${index}`} className="rounded-lg bg-background border border-border px-3 py-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{operation.op} {operation.path}</div>
                      <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{operation.reason || '-'}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded-md bg-surface border border-border text-text-secondary">
                        {operation.riskLevel || 'medium'}
                      </span>
                      <span className={clsx(
                        'px-2 py-1 rounded-md border',
                        operation.requiresApproval
                          ? 'bg-status-success/10 text-status-success border-status-success/30'
                          : 'bg-status-failed/10 text-status-failed border-status-failed/30'
                      )}>
                        {operation.requiresApproval ? t('evolution.patch.approvalRequired') : t('evolution.patch.approvalMissing')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="text-xs text-text-tertiary">{t('evolution.patch.rollback')}</div>
            <div className="text-sm text-text-secondary mt-1">
              {patch.rollbackPlan?.strategy || '-'} · {patch.rollbackPlan?.notes || '-'}
            </div>
          </div>
        </div>
      )}
    </DetailSection>
  );
}

function PatchInfo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg bg-background border border-border px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-sm text-text-primary truncate mt-1">{value || '-'}</div>
    </div>
  );
}

function ReleasePanel({
  releases,
  canRollback,
  isRollingBack,
  onRollback
}: {
  releases: ReleaseVersion[];
  canRollback: boolean;
  isRollingBack: boolean;
  onRollback: (versionId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <DetailSection title={t('evolution.release.title')} icon={<ShieldCheck className="w-4 h-4" />}>
      {releases.length === 0 ? (
        <div className="text-sm text-text-tertiary">{t('evolution.release.empty')}</div>
      ) : (
        <div className="space-y-2">
          {releases.map((version) => (
            <div key={version.id} className="rounded-lg bg-background border border-border px-3 py-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{version.version_label}</span>
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full border text-xs',
                      version.status === 'active'
                        ? 'bg-status-success/10 text-status-success border-status-success/30'
                        : version.status === 'rolled_back'
                          ? 'bg-status-failed/10 text-status-failed border-status-failed/30'
                          : 'bg-status-pending/10 text-status-pending border-status-pending/30'
                    )}>
                      {version.status}
                    </span>
                  </div>
                  <div className="text-xs text-text-tertiary mt-1 truncate">
                    {version.object_type} · {version.target_id || 'global'} · {formatTime(version.published_at)}
                  </div>
                </div>
                {version.status === 'active' && (
                  <button
                    disabled={!canRollback || isRollingBack}
                    onClick={() => onRollback(version.id)}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Archive className="w-4 h-4" />
                    {isRollingBack ? t('evolution.rollingBack') : t('evolution.action.rollback')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function EvaluationPanel({ evaluations }: { evaluations: ProposalEvaluation[] }) {
  const { t } = useLocale();
  const latest = evaluations[0];
  if (!latest) {
    return (
      <DetailSection title={t('evolution.eval.title')} icon={<Gauge className="w-4 h-4" />}>
        <div className="text-sm text-text-tertiary">{t('evolution.eval.empty')}</div>
      </DetailSection>
    );
  }

  const scores = [
    [t('evolution.eval.safety'), latest.safety_score],
    [t('evolution.eval.evidence'), latest.evidence_score],
    [t('evolution.eval.completeness'), latest.completeness_score],
    [t('evolution.eval.replay'), latest.replay_score],
    [t('evolution.eval.semantic'), readSummaryNumber(latest, 'semanticScore')]
  ];
  const semanticGuard = getSemanticGuard(latest);
  const releaseGuard = getNestedRecord(semanticGuard, 'releaseGuard');
  const rollbackBoundary = getNestedRecord(semanticGuard, 'rollbackBoundary');
  const skillCoverage = getNestedRecord(semanticGuard, 'skillCoverage');
  const affectedSkillIds = readStringList(semanticGuard?.affectedSkillIds);
  const affectedWorkflowIds = readStringList(semanticGuard?.affectedWorkflowIds);
  const missingSkillIds = readStringList(semanticGuard?.missingSkillIds);
  const semanticPassed = semanticGuard?.passed === true;

  return (
    <DetailSection title={t('evolution.eval.title')} icon={<Gauge className="w-4 h-4" />}>
      <div className="grid grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] gap-4">
        <div className="rounded-lg bg-background border border-border p-4">
          <div className="text-xs text-text-tertiary">{t('evolution.eval.score')}</div>
          <div className="text-3xl font-semibold text-text-primary mt-1">{latest.score}</div>
          <div className={clsx(
            'mt-2 inline-flex px-2 py-1 rounded-full border text-xs font-medium',
            latest.passed
              ? 'bg-status-success/10 text-status-success border-status-success/30'
              : 'bg-status-failed/10 text-status-failed border-status-failed/30'
          )}>
            {latest.passed ? t('evolution.eval.passed') : t('evolution.eval.failed')}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {scores.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background border border-border px-3 py-2">
              <div className="text-xs text-text-tertiary">{label}</div>
              <div className="text-lg font-semibold text-text-primary mt-1">{value}</div>
            </div>
          ))}
        </div>
      </div>
      {semanticGuard && (
        <div className="mt-4 rounded-lg bg-background border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-text-tertiary">{t('evolution.eval.semanticGuard')}</div>
              <div className="text-sm text-text-primary mt-1">
                {t('evolution.eval.releaseGuard')}: {String(releaseGuard?.mode || '-')}
              </div>
            </div>
            <span className={clsx(
              'inline-flex px-2 py-1 rounded-full border text-xs font-medium',
              semanticPassed
                ? 'bg-status-success/10 text-status-success border-status-success/30'
                : 'bg-status-failed/10 text-status-failed border-status-failed/30'
            )}>
              {semanticPassed ? t('evolution.eval.passed') : t('evolution.eval.failed')}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <SemanticList label={t('evolution.eval.affectedSkills')} values={affectedSkillIds} />
            <SemanticList label={t('evolution.eval.affectedWorkflows')} values={affectedWorkflowIds} />
            <SemanticList label={t('evolution.eval.missingSkills')} values={missingSkillIds} />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface/70 px-3 py-2">
              <div className="text-xs text-text-tertiary">{t('evolution.eval.rollbackBoundary')}</div>
              <div className="text-sm text-text-primary mt-1">
                {rollbackBoundary?.valid ? t('evolution.eval.valid') : t('evolution.eval.invalid')}
                {' · '}
                {String(rollbackBoundary?.source || '-')}
              </div>
              <div className="text-xs text-text-tertiary mt-1 line-clamp-2">{String(rollbackBoundary?.notes || '-')}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface/70 px-3 py-2">
              <div className="text-xs text-text-tertiary">{t('evolution.eval.skillCoverage')}</div>
              <div className="text-sm text-text-primary mt-1">
                {String(skillCoverage?.nodesWithRecommendedSkill ?? '-')} / {String(skillCoverage?.totalNodes ?? '-')}
              </div>
              <div className="text-xs text-text-tertiary mt-1">{String(releaseGuard?.reason || '-')}</div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-text-tertiary mb-2">{t('evolution.eval.findings')}</div>
          <div className="space-y-2">
            {latest.findings.length === 0 && <div className="text-sm text-text-tertiary">{t('evolution.eval.noFindings')}</div>}
            {latest.findings.map((finding) => (
              <div key={`${finding.code}-${finding.message}`} className="rounded-lg bg-background border border-border px-3 py-2">
                <div className="text-xs text-text-tertiary">{finding.severity} · {finding.code}</div>
                <div className="text-sm text-text-secondary mt-1">{finding.message}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-text-tertiary mb-2">{t('evolution.eval.replaySamples', { count: latest.replay_sample_count })}</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {latest.replay_samples.slice(0, 8).map((sample) => (
              <div key={`${sample.source}-${sample.id}`} className="rounded-lg bg-background border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-text-tertiary">{sample.source}</span>
                  <span className="text-xs text-text-tertiary">{sample.status || '-'}</span>
                </div>
                <div className="text-sm text-text-secondary mt-1 truncate">{sample.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DetailSection>
  );
}

function SemanticList({ label, values }: { label: string; values: string[] }) {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-border bg-surface/70 px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-sm text-text-tertiary">{t('evolution.eval.notAvailable')}</span>}
        {values.map((value) => (
          <span key={value} className="max-w-full truncate rounded-md bg-background border border-border px-2 py-0.5 text-xs text-text-secondary">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const icon = status === 'approved' || status === 'published'
    ? <CheckCircle2 className="w-3.5 h-3.5" />
    : status === 'rejected' || status === 'eval_failed'
      ? <XCircle className="w-3.5 h-3.5" />
      : <Clock className="w-3.5 h-3.5" />;
  const tone = status === 'approved' || status === 'published'
    ? 'bg-status-success/10 text-status-success border-status-success/30'
    : status === 'rejected' || status === 'eval_failed'
      ? 'bg-status-failed/10 text-status-failed border-status-failed/30'
      : 'bg-status-warning/10 text-status-warning border-status-warning/30';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-medium ${tone}`}>
      {icon}
      {statusLabel(status)}
    </span>
  );
}

function ContinuousEvolutionPanel({
  tasks,
  runs,
  queue,
  onOpenProposal,
  canRun,
  runningTaskId,
  isRunning,
  onRun
}: {
  tasks: EvolutionTask[];
  runs: EvolutionTaskRun[];
  queue: EvolutionQueueItem[];
  onOpenProposal: (proposalId: string) => void;
  canRun: boolean;
  runningTaskId?: string;
  isRunning: boolean;
  onRun: (taskId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{t('evolution.continuous.title')}</h2>
          <p className="text-xs text-text-tertiary mt-0.5">{t('evolution.continuous.subtitle')}</p>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-lg bg-background border border-border px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{task.name}</div>
                <div className="text-xs text-text-tertiary mt-1 truncate">{task.kind} · {task.schedule}</div>
                <div className="text-xs text-text-tertiary mt-1">
                  {task.last_status ? `${task.last_status} · ${formatTime(task.last_run_at)}` : t('evolution.continuous.neverRun')}
                </div>
              </div>
              <button
                disabled={!canRun || isRunning}
                onClick={() => onRun(task.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface border border-border text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                {isRunning && runningTaskId === task.id ? t('evolution.continuous.running') : t('evolution.continuous.runNow')}
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-sm text-text-tertiary">{t('evolution.continuous.noTasks')}</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="rounded-lg bg-background border border-border p-3">
          <div className="text-xs font-medium text-text-tertiary mb-2">{t('evolution.continuous.recentRuns')}</div>
          <div className="space-y-1.5">
            {runs.slice(0, 3).map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-text-secondary truncate">{run.kind}</span>
                <span className="text-text-tertiary">{run.status}</span>
              </div>
            ))}
            {runs.length === 0 && <div className="text-xs text-text-tertiary">{t('evolution.continuous.noRuns')}</div>}
          </div>
        </div>
        <div className="rounded-lg bg-background border border-border p-3">
          <div className="text-xs font-medium text-text-tertiary mb-2">{t('evolution.continuous.queue')}</div>
          <div className="space-y-2">
            {queue.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-md border border-border/80 bg-surface/70 p-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-text-primary truncate">{sourceTypeLabel(item.source_type, t)}</span>
                      <span className={clsx(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        item.priority === 'P0' || item.priority === 'P1'
                          ? 'bg-status-failed/10 text-status-failed'
                          : 'bg-status-warning/10 text-status-warning'
                      )}>
                        {item.priority}
                      </span>
                    </div>
                    {item.reason && <div className="text-text-tertiary truncate mt-1">{item.reason}</div>}
                  </div>
                  <span className="shrink-0 text-text-tertiary">{item.status}</span>
                </div>

                {item.proposal && (
                  <div className="mt-2 rounded-md bg-background border border-border px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-text-secondary truncate">{item.proposal.title}</span>
                      <span className="shrink-0 text-text-tertiary">{item.proposal.status}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-text-tertiary">
                      <span>{item.proposal.type}</span>
                      <span>·</span>
                      <span>
                        {item.proposal.evaluation
                          ? t('evolution.continuous.evaluationScore', { score: item.proposal.evaluation.score })
                          : t('evolution.continuous.noEvaluation')}
                      </span>
                      {item.review_value && (
                        <>
                          <span>·</span>
                          <span className={clsx(
                            'font-medium',
                            item.review_value.label === 'promote' && 'text-status-success',
                            item.review_value.label === 'needs_work' && 'text-status-failed',
                            item.review_value.label === 'needs_evaluation' && 'text-status-warning'
                          )}>
                            {t(`evolution.continuous.reviewValue.${item.review_value.label}` as MessageKey)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {item.cluster && item.cluster.occurrence_count > 1 && (
                  <div className="mt-2 rounded-md border border-status-warning/20 bg-status-warning/5 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-status-warning">
                        {t('evolution.continuous.cluster.repeat', { count: item.cluster.occurrence_count })}
                      </span>
                      <span className="shrink-0 text-text-tertiary">
                        {t('evolution.continuous.cluster.proposals', { count: item.cluster.linked_proposal_count })}
                      </span>
                    </div>
                    <div className="mt-1 text-text-tertiary truncate">
                      {item.cluster.normalized_reason}
                    </div>
                  </div>
                )}

                {(item.generated_proposal_id || item.review_value) && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-text-tertiary truncate">
                      {item.review_value?.reason || t('evolution.continuous.generated')}
                    </div>
                    {item.generated_proposal_id && (
                      <button
                        onClick={() => onOpenProposal(item.generated_proposal_id!)}
                        className="shrink-0 text-primary hover:text-primary/80 transition-colors"
                      >
                        {t('evolution.continuous.openProposal', { id: shortId(item.generated_proposal_id) })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {queue.length === 0 && <div className="text-xs text-text-tertiary">{t('evolution.continuous.noQueue')}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionButton({ label, icon, disabled, onClick }: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

function InfoGrid({ proposal }: { proposal: EvolutionProposal }) {
  const patch = getStructuredPatch(proposal);
  const items = [
    ['Correlation', proposal.correlation_id || '-'],
    ['Agent execution', proposal.agent_execution_id || '-'],
    ['Hermes session', proposal.hermes_session_id || '-'],
    ['Structured patch', patch ? `${patch.kind} / ${patch.applyMode}` : '-'],
    ['Updated', formatTime(proposal.updated_at)]
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-background border border-border px-3 py-2 min-w-0">
          <div className="text-xs text-text-tertiary">{label}</div>
          <div className="text-sm text-text-primary truncate mt-1">{value}</div>
        </div>
      ))}
    </div>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-background border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-3">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function typeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

function statusLabel(status: ProposalStatus): string {
  return status.replace(/_/g, ' ');
}

const queueSourceTypeLabels: Record<string, MessageKey> = {
  worker_run: 'evolution.continuous.source.workerRun',
  agent_execution: 'evolution.continuous.source.agentExecution',
  task: 'evolution.continuous.source.task',
  tool_approval: 'evolution.continuous.source.toolApproval'
};

function sourceTypeLabel(
  sourceType: string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  const key = queueSourceTypeLabels[sourceType];
  return key ? t(key) : sourceType.replace(/_/g, ' ');
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function getStructuredPatch(proposal: EvolutionProposal): StructuredPatch | null {
  if (!proposal.target_descriptor || typeof proposal.target_descriptor !== 'object' || Array.isArray(proposal.target_descriptor)) {
    return null;
  }
  const descriptor = proposal.target_descriptor as Record<string, unknown>;
  const patch = descriptor.structuredPatch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return null;
  }
  const record = patch as Record<string, unknown>;
  if (record.schemaVersion !== 'evolution.patch.v1') {
    return null;
  }
  return record as unknown as StructuredPatch;
}

function getSemanticGuard(evaluation: ProposalEvaluation): Record<string, unknown> | null {
  const summary = evaluation.result_summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }
  const guard = summary.semanticGuard;
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) {
    return null;
  }
  return guard as Record<string, unknown>;
}

function readSummaryNumber(evaluation: ProposalEvaluation, key: string): number | string {
  const summary = evaluation.result_summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return '-';
  }
  const value = summary[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : '-';
}

function getNestedRecord(parent: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = parent?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}
