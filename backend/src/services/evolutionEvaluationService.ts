import { randomUUID } from 'crypto';
import db from '../models/database';
import {
  EvolutionProposalRecord,
  getEvolutionProposal,
  updateEvolutionProposalStatus
} from './evolutionProposalService';

export interface EvolutionEvaluationFinding {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
}

export interface EvolutionReplaySample {
  source: 'worker_run' | 'hermes_session' | 'agent_execution' | 'tool_approval';
  id: string;
  status?: string | null;
  correlationId?: string | null;
  summary: string;
}

export interface EvolutionProposalEvaluationRecord {
  id: string;
  proposal_id: string;
  status: string;
  passed: number;
  score: number;
  safety_score: number;
  evidence_score: number;
  completeness_score: number;
  replay_score: number;
  replay_sample_count: number;
  findings: EvolutionEvaluationFinding[];
  replay_samples: EvolutionReplaySample[];
  result_summary: Record<string, unknown> | null;
  evaluator: string;
  created_by: string | null;
  created_at: string;
}

const DANGEROUS_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: 'bypass_approval',
    pattern: /(绕过|跳过|bypass|skip).{0,16}(审批|approval|review)/i,
    message: 'Proposal appears to bypass approval or review.'
  },
  {
    code: 'direct_production_change',
    pattern: /(直接|自动|immediately|automatically).{0,24}(生产|prod|production|上线|publish|apply|应用)/i,
    message: 'Proposal suggests direct production application.'
  },
  {
    code: 'destructive_command',
    pattern: /(rm\s+-rf|mkfs|dd\s+if=|shutdown\s+-h|reboot\s+-f|DROP\s+TABLE|TRUNCATE\s+TABLE)/i,
    message: 'Proposal includes potentially destructive commands.'
  },
  {
    code: 'secret_exposure',
    pattern: /(sk-[A-Za-z0-9]{12,}|private key|BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*[:=])/i,
    message: 'Proposal may expose secrets or private credentials.'
  }
];

const REQUIRED_SECTION_PATTERNS: Array<{ code: string; pattern: RegExp; label: string }> = [
  { code: 'problem_evidence', pattern: /(evidence|证据|问题|problem)/i, label: 'problem evidence' },
  { code: 'proposed_change', pattern: /(proposed change|建议|改进|change|proposal)/i, label: 'proposed change' },
  { code: 'evaluation_plan', pattern: /(evaluation|eval|验证|评估|回放|replay)/i, label: 'evaluation plan' },
  { code: 'risk_rollback', pattern: /(risk|rollback|风险|回滚)/i, label: 'risk and rollback' }
];

export function listEvolutionProposalEvaluations(proposalId: string): EvolutionProposalEvaluationRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM evolution_proposal_evaluations
    WHERE proposal_id = ?
    ORDER BY created_at DESC
  `).all(proposalId) as Array<Record<string, unknown>>;

  return rows.map(parseEvaluation);
}

export function getLatestEvolutionProposalEvaluation(proposalId: string): EvolutionProposalEvaluationRecord | null {
  const row = db.prepare(`
    SELECT *
    FROM evolution_proposal_evaluations
    WHERE proposal_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(proposalId) as Record<string, unknown> | undefined;

  return row ? parseEvaluation(row) : null;
}

export function evaluateEvolutionProposal(input: {
  proposalId: string;
  actorId?: string | null;
}): EvolutionProposalEvaluationRecord {
  const proposal = getEvolutionProposal(input.proposalId);
  if (!proposal) {
    throw new Error('Evolution proposal not found');
  }

  const findings: EvolutionEvaluationFinding[] = [];
  const safetyScore = evaluateSafety(proposal, findings);
  const completenessScore = evaluateCompleteness(proposal, findings);
  const evidenceScore = evaluateEvidence(proposal, findings);
  const replaySamples = collectReplaySamples(proposal);
  const replayScore = evaluateReplaySamples(replaySamples, findings);
  const score = Math.round((safetyScore * 0.35) + (evidenceScore * 0.25) + (completenessScore * 0.25) + (replayScore * 0.15));
  const hasCriticalFinding = findings.some(finding => finding.severity === 'critical');
  const passed = score >= 75 && !hasCriticalFinding;
  const status = passed ? 'passed' : 'failed';
  const summary = {
    score,
    passed,
    safetyScore,
    evidenceScore,
    completenessScore,
    replayScore,
    replaySampleCount: replaySamples.length,
    findingCounts: {
      critical: findings.filter(finding => finding.severity === 'critical').length,
      warning: findings.filter(finding => finding.severity === 'warning').length,
      info: findings.filter(finding => finding.severity === 'info').length
    }
  };
  const evaluationId = randomUUID();

  db.prepare(`
    INSERT INTO evolution_proposal_evaluations (
      id, proposal_id, status, passed, score, safety_score, evidence_score,
      completeness_score, replay_score, replay_sample_count, findings,
      replay_samples, result_summary, evaluator, created_by, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'deterministic-v1', ?, CURRENT_TIMESTAMP)
  `).run(
    evaluationId,
    proposal.id,
    status,
    passed ? 1 : 0,
    score,
    safetyScore,
    evidenceScore,
    completenessScore,
    replayScore,
    replaySamples.length,
    JSON.stringify(findings),
    JSON.stringify(replaySamples),
    JSON.stringify(summary),
    input.actorId || null
  );

  updateEvolutionProposalStatus({
    id: proposal.id,
    status: passed ? 'eval_passed' : 'eval_failed',
    actorId: input.actorId || null,
    comment: passed ? 'Deterministic evaluation passed' : 'Deterministic evaluation failed',
    evalSummary: summary
  });

  return getLatestEvolutionProposalEvaluation(proposal.id)!;
}

function evaluateSafety(proposal: EvolutionProposalRecord, findings: EvolutionEvaluationFinding[]): number {
  let score = 100;
  const body = [
    proposal.title,
    proposal.proposal_body,
    proposal.risk_notes || '',
    JSON.stringify(proposal.target_descriptor || {})
  ].join('\n');

  DANGEROUS_PATTERNS.forEach(rule => {
    if (rule.pattern.test(body)) {
      findings.push({
        severity: 'critical',
        code: rule.code,
        message: rule.message
      });
      score -= 45;
    }
  });

  const target = proposal.target_descriptor as Record<string, unknown> | null;
  if (target && target.applyMode && target.applyMode !== 'proposal_only') {
    findings.push({
      severity: 'critical',
      code: 'target_apply_mode_not_proposal_only',
      message: 'Target descriptor must remain proposal_only during stage 25.'
    });
    score -= 50;
  }

  if (!proposal.risk_notes || proposal.risk_notes.trim().length < 24) {
    findings.push({
      severity: 'warning',
      code: 'missing_risk_notes',
      message: 'Risk notes are missing or too short.'
    });
    score -= 15;
  }

  return clampScore(score);
}

function evaluateCompleteness(proposal: EvolutionProposalRecord, findings: EvolutionEvaluationFinding[]): number {
  let score = 100;
  const body = proposal.proposal_body || '';

  if (body.trim().length < 240) {
    findings.push({
      severity: 'warning',
      code: 'proposal_body_short',
      message: 'Proposal body is too short to evaluate confidently.'
    });
    score -= 25;
  }

  REQUIRED_SECTION_PATTERNS.forEach(section => {
    if (!section.pattern.test(body)) {
      findings.push({
        severity: 'warning',
        code: `missing_${section.code}`,
        message: `Proposal should include ${section.label}.`
      });
      score -= 15;
    }
  });

  if (!proposal.target_descriptor) {
    findings.push({
      severity: 'warning',
      code: 'missing_target_descriptor',
      message: 'Proposal has no target descriptor.'
    });
    score -= 15;
  }

  return clampScore(score);
}

function evaluateEvidence(proposal: EvolutionProposalRecord, findings: EvolutionEvaluationFinding[]): number {
  const evidence = proposal.evidence_refs as Record<string, unknown> | null;
  if (!evidence || typeof evidence !== 'object') {
    findings.push({
      severity: 'critical',
      code: 'missing_evidence',
      message: 'Proposal has no persisted evidence snapshot.'
    });
    return 0;
  }

  const workerRuns = arrayLength(evidence.workerRuns);
  const hermesSessions = arrayLength(evidence.hermesSessions);
  const agentExecutions = arrayLength(evidence.agentExecutions);
  const approvals = arrayLength(evidence.approvals);
  const total = workerRuns + hermesSessions + agentExecutions + approvals;
  let score = Math.min(100, total * 12);

  if (workerRuns === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_worker_run_evidence',
      message: 'Evidence snapshot contains no Hermes worker run.'
    });
    score -= 20;
  }
  if (hermesSessions === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_session_evidence',
      message: 'Evidence snapshot contains no Hermes session.'
    });
    score -= 15;
  }
  if (agentExecutions === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_agent_execution_evidence',
      message: 'Evidence snapshot contains no Agent execution.'
    });
    score -= 15;
  }

  return clampScore(score);
}

function collectReplaySamples(proposal: EvolutionProposalRecord): EvolutionReplaySample[] {
  const samples: EvolutionReplaySample[] = [];
  const correlationId = proposal.correlation_id;

  if (correlationId) {
    const workerRuns = db.prepare(`
      SELECT id, worker_role, status, correlation_id, error, created_at
      FROM hermes_worker_runs
      WHERE correlation_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(correlationId) as Array<Record<string, unknown>>;

    workerRuns.forEach(row => samples.push({
      source: 'worker_run',
      id: String(row.id),
      status: nullableString(row.status),
      correlationId: nullableString(row.correlation_id),
      summary: `${row.worker_role || 'worker'} run ${row.status || 'unknown'}${row.error ? `: ${row.error}` : ''}`
    }));

    const sessions = db.prepare(`
      SELECT id, agent_name, status, correlation_id, created_at
      FROM hermes_sessions
      WHERE correlation_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(correlationId) as Array<Record<string, unknown>>;

    sessions.forEach(row => samples.push({
      source: 'hermes_session',
      id: String(row.id),
      status: nullableString(row.status),
      correlationId: nullableString(row.correlation_id),
      summary: `${row.agent_name || 'Hermes'} session ${row.status || 'unknown'}`
    }));

    const approvals = db.prepare(`
      SELECT id, tool_name, status, correlation_id, requested_at
      FROM tool_approvals
      WHERE correlation_id = ?
      ORDER BY requested_at DESC
      LIMIT 10
    `).all(correlationId) as Array<Record<string, unknown>>;

    approvals.forEach(row => samples.push({
      source: 'tool_approval',
      id: String(row.id),
      status: nullableString(row.status),
      correlationId: nullableString(row.correlation_id),
      summary: `${row.tool_name || 'tool'} approval ${row.status || 'unknown'}`
    }));

    const executions = db.prepare(`
      SELECT id, agent_name, status, metadata, created_at
      FROM agent_executions
      WHERE IFNULL(metadata, '') LIKE ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(`%${escapeLike(correlationId)}%`) as Array<Record<string, unknown>>;

    executions.forEach(row => samples.push({
      source: 'agent_execution',
      id: String(row.id),
      status: nullableString(row.status),
      correlationId,
      summary: `${row.agent_name || 'Agent'} execution ${row.status || 'unknown'}`
    }));
  }

  if (samples.length === 0) {
    const evidence = proposal.evidence_refs as Record<string, unknown> | null;
    appendEvidenceSamples(samples, evidence?.workerRuns, 'worker_run');
    appendEvidenceSamples(samples, evidence?.hermesSessions, 'hermes_session');
    appendEvidenceSamples(samples, evidence?.agentExecutions, 'agent_execution');
    appendEvidenceSamples(samples, evidence?.approvals, 'tool_approval');
  }

  return samples.slice(0, 30);
}

function evaluateReplaySamples(samples: EvolutionReplaySample[], findings: EvolutionEvaluationFinding[]): number {
  if (samples.length === 0) {
    findings.push({
      severity: 'critical',
      code: 'no_replay_samples',
      message: 'No replay samples are available for evaluation.'
    });
    return 0;
  }

  const sourceTypes = new Set(samples.map(sample => sample.source));
  let score = Math.min(100, 40 + samples.length * 5 + sourceTypes.size * 10);
  if (sourceTypes.size < 2) {
    findings.push({
      severity: 'warning',
      code: 'narrow_replay_coverage',
      message: 'Replay coverage uses fewer than two evidence source types.'
    });
    score -= 20;
  }

  return clampScore(score);
}

function appendEvidenceSamples(
  samples: EvolutionReplaySample[],
  value: unknown,
  source: EvolutionReplaySample['source']
): void {
  if (!Array.isArray(value)) {
    return;
  }

  value.slice(0, 10).forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const record = item as Record<string, unknown>;
    samples.push({
      source,
      id: String(record.id || `${source}-${samples.length + 1}`),
      status: nullableString(record.status),
      correlationId: nullableString(record.correlation_id) || nullableString(record.correlationId),
      summary: `${source} ${record.status || 'unknown'}`
    });
  });
}

function parseEvaluation(row: Record<string, unknown>): EvolutionProposalEvaluationRecord {
  return {
    id: String(row.id),
    proposal_id: String(row.proposal_id),
    status: String(row.status || 'failed'),
    passed: Number(row.passed || 0),
    score: Number(row.score || 0),
    safety_score: Number(row.safety_score || 0),
    evidence_score: Number(row.evidence_score || 0),
    completeness_score: Number(row.completeness_score || 0),
    replay_score: Number(row.replay_score || 0),
    replay_sample_count: Number(row.replay_sample_count || 0),
    findings: parseJsonField(row.findings, []),
    replay_samples: parseJsonField(row.replay_samples, []),
    result_summary: parseJsonField(row.result_summary, null),
    evaluator: String(row.evaluator || 'deterministic-v1'),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || '')
  };
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
