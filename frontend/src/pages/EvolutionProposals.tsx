import { type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, Clock, FileText, Gauge, PlayCircle, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { useToast } from '../contexts/ToastContext';

type ProposalStatus =
  | 'draft'
  | 'generated'
  | 'eval_pending'
  | 'eval_passed'
  | 'eval_failed'
  | 'approval_pending'
  | 'approved'
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
  created_at: string;
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
  'rejected',
  'archived'
];

export default function EvolutionProposals() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useLocale();
  const toast = useToast();
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
    return proposals.find((proposal) => proposal.id === selectedId) || proposals[0];
  }, [proposals, selectedId]);

  const { data: detail } = useQuery({
    queryKey: ['evolution-proposal-detail', selectedProposal?.id],
    enabled: Boolean(selectedProposal?.id),
    queryFn: async () => {
      const res = await api.get(`/api/evolution-proposals/${selectedProposal!.id}`);
      return res.data.data as { proposal: EvolutionProposal; events: ProposalEvent[]; evaluations: ProposalEvaluation[] };
    }
  });

  const activeProposal = detail?.proposal || selectedProposal;

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
    [t('evolution.eval.replay'), latest.replay_score]
  ];

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {scores.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-background border border-border px-3 py-2">
              <div className="text-xs text-text-tertiary">{label}</div>
              <div className="text-lg font-semibold text-text-primary mt-1">{value}</div>
            </div>
          ))}
        </div>
      </div>
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

function StatusBadge({ status }: { status: ProposalStatus }) {
  const icon = status === 'approved'
    ? <CheckCircle2 className="w-3.5 h-3.5" />
    : status === 'rejected' || status === 'eval_failed'
      ? <XCircle className="w-3.5 h-3.5" />
      : <Clock className="w-3.5 h-3.5" />;
  const tone = status === 'approved'
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
  const items = [
    ['Correlation', proposal.correlation_id || '-'],
    ['Agent execution', proposal.agent_execution_id || '-'],
    ['Hermes session', proposal.hermes_session_id || '-'],
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

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
