import { randomUUID } from 'crypto';
import db from '../models/database';
import {
  EvolutionProposalRecord,
  getEvolutionProposal,
  updateEvolutionProposalStatus
} from './evolutionProposalService';
import {
  getStructuredPatchFromProposal,
  validateStructuredPatch
} from './evolutionPatchService';
import {
  buildEvaluationDatasetOverview,
  EvaluationDatasetCase,
  EvaluationDatasetCategory
} from './evaluationDatasetService';

export interface EvolutionEvaluationFinding {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
}

export interface EvolutionReplaySample {
  source: 'execution_evidence' | 'worker_run' | 'hermes_session' | 'agent_execution' | 'tool_approval';
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

interface EvolutionSemanticGuardSummary {
  score: number;
  passed: boolean;
  proposalType: string;
  patchKind: string | null;
  affectedSkillIds: string[];
  affectedWorkflowIds: string[];
  missingSkillIds: string[];
  releaseGuard: {
    mode: 'readonly_overlay' | 'review_required' | 'approval_required';
    reason: string;
  };
  rollbackBoundary: {
    valid: boolean;
    strategy: string | null;
    notes: string | null;
    source: 'structured_patch' | 'skill' | 'none';
  };
  skillCoverage?: {
    totalNodes: number;
    nodesWithRecommendedSkill: number;
    coverageRatio: number;
  };
}

interface DatasetRegressionSignalResult {
  key: string;
  passed: boolean;
  reason: string;
}

interface DatasetRegressionSampleResult {
  caseId: string;
  category: EvaluationDatasetCategory;
  sourceType: string;
  sourceId: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  score: number;
  passedSignals: string[];
  failedSignals: string[];
  signals: DatasetRegressionSignalResult[];
}

interface DatasetRegressionSummary {
  score: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  generatedAt: string;
  categorySummary: Array<{
    category: EvaluationDatasetCategory;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    score: number;
  }>;
  samples: DatasetRegressionSampleResult[];
  datasetReadiness: {
    score: number;
    coveredCategories: number;
    totalCategories: number;
    blockers: EvaluationDatasetCategory[];
  };
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

const STOP_WORDS = new Set([
  'task',
  'failed',
  'failure',
  'workflow',
  'agent',
  'execution',
  'status',
  'completed',
  'error',
  'unknown',
  'sample',
  'issue',
  'problem',
  'server'
]);

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
  const patchValidation = evaluateStructuredPatch(proposal, findings);
  const patchScore = patchValidation.score;
  const semanticGuard = evaluateSkillOperationalSemantics(proposal, findings);
  const semanticScore = semanticGuard.score;
  const datasetRegression = evaluateDatasetRegression(proposal, semanticGuard, findings);
  const score = Math.round(
    (safetyScore * 0.25)
    + (evidenceScore * 0.18)
    + (completenessScore * 0.17)
    + (replayScore * 0.15)
    + (patchScore * 0.15)
    + (semanticScore * 0.10)
  );
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
    patchScore,
    semanticScore,
    replaySampleCount: replaySamples.length,
    datasetRegression,
    structuredPatch: {
      valid: patchValidation.valid,
      score: patchValidation.score,
      findingCount: patchValidation.findings.length
    },
    semanticGuard,
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
  const executionEvidence = arrayLength(evidence.executionEvidence);
  const total = workerRuns + hermesSessions + agentExecutions + approvals + executionEvidence;
  let score = executionEvidence > 0
    ? Math.min(100, 45 + (executionEvidence * 18) + ((total - executionEvidence) * 8))
    : Math.min(100, total * 12);

  if (executionEvidence === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_structured_execution_evidence',
      message: 'Evidence snapshot contains no structured executionEvidence.'
    });
    score -= 20;
  }

  if (workerRuns === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_worker_run_evidence',
      message: 'Evidence snapshot contains no Hermes worker run.'
    });
    score -= executionEvidence > 0 ? 5 : 20;
  }
  if (hermesSessions === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_session_evidence',
      message: 'Evidence snapshot contains no Hermes session.'
    });
    score -= executionEvidence > 0 ? 5 : 15;
  }
  if (agentExecutions === 0 && executionEvidence === 0) {
    findings.push({
      severity: 'warning',
      code: 'no_agent_execution_evidence',
      message: 'Evidence snapshot contains no Agent execution.'
    });
    score -= 15;
  }

  return clampScore(score);
}

function evaluateStructuredPatch(proposal: EvolutionProposalRecord, findings: EvolutionEvaluationFinding[]): ReturnType<typeof validateStructuredPatch> {
  const validation = validateStructuredPatch(getStructuredPatchFromProposal(proposal));
  validation.findings.forEach(finding => {
    findings.push({
      severity: finding.severity,
      code: finding.code,
      message: finding.message
    });
  });
  return validation;
}

function evaluateSkillOperationalSemantics(
  proposal: EvolutionProposalRecord,
  findings: EvolutionEvaluationFinding[]
): EvolutionSemanticGuardSummary {
  const patch = getStructuredPatchFromProposal(proposal);
  const descriptor = objectOrEmpty(proposal.target_descriptor);
  const targetId = stringOrNull(descriptor.targetId) || stringOrNull(objectOrEmpty(patch?.target).targetId);
  const affectedSkillIds = new Set<string>();
  const affectedWorkflowIds = new Set<string>();
  const missingSkillIds = new Set<string>();
  let score = 100;
  let maxRiskLevel = 'medium';
  let approvalRequired = false;
  let skillCoverage: EvolutionSemanticGuardSummary['skillCoverage'];
  let rollbackBoundary = buildRollbackBoundary(patch, null);

  if (proposal.type === 'skill_update') {
    if (!targetId) {
      findings.push({
        severity: 'critical',
        code: 'semantic_missing_skill_target',
        message: 'Skill update proposals must identify the target skill before release evaluation.'
      });
      score -= 45;
    } else {
      affectedSkillIds.add(targetId);
      const skill = getSkillSemanticRecord(targetId);
      if (!skill) {
        findings.push({
          severity: 'critical',
          code: 'semantic_skill_not_found',
          message: `Target skill ${targetId} does not exist in the Skill registry.`
        });
        score -= 55;
      } else {
        maxRiskLevel = normalizeRiskLevel(skill.risk_level);
        approvalRequired = isApprovalRequired(skill.approval_policy) || isHighRisk(maxRiskLevel);
        rollbackBoundary = buildRollbackBoundary(patch, skill);
        score += scoreSkillOperationalFields(skill, findings);
      }
    }
  }

  if (proposal.type === 'workflow_template_update') {
    if (!targetId) {
      findings.push({
        severity: 'critical',
        code: 'semantic_missing_workflow_target',
        message: 'Workflow template proposals must identify the target workflow before release evaluation.'
      });
      score -= 45;
    } else {
      affectedWorkflowIds.add(targetId);
      const workflow = getWorkflowSemanticRecord(targetId);
      if (!workflow) {
        findings.push({
          severity: 'critical',
          code: 'semantic_workflow_not_found',
          message: `Target workflow ${targetId} does not exist.`
        });
        score -= 55;
      } else {
        const recommendedSkillIds = collectWorkflowRecommendedSkillIds(workflow);
        recommendedSkillIds.forEach(skillId => affectedSkillIds.add(skillId));
        const knownSkillIds = getKnownSkillIds(recommendedSkillIds);
        recommendedSkillIds.forEach(skillId => {
          if (!knownSkillIds.has(skillId)) {
            missingSkillIds.add(skillId);
          }
        });

        if (missingSkillIds.size > 0) {
          findings.push({
            severity: 'critical',
            code: 'semantic_workflow_missing_skills',
            message: `Workflow references missing Skill ids: ${Array.from(missingSkillIds).join(', ')}.`
          });
          score -= 50;
        }

        const coverage = computeWorkflowSkillCoverage(workflow);
        skillCoverage = coverage;
        if (coverage.totalNodes > 0 && coverage.nodesWithRecommendedSkill === 0) {
          findings.push({
            severity: 'warning',
            code: 'semantic_workflow_without_skill_coverage',
            message: 'Workflow has no recommended Skill coverage, so release impact is harder to audit.'
          });
          score -= 20;
        }

        approvalRequired = true;
      }
    }
  }

  if (['skill_update', 'workflow_template_update'].includes(proposal.type) && !rollbackBoundary.valid) {
    findings.push({
      severity: 'critical',
      code: 'semantic_missing_rollback_boundary',
      message: 'Release evaluation requires a rollback boundary from the structured patch or Skill guidance.'
    });
    score -= 45;
  }

  const releaseGuard = buildReleaseGuard(proposal.type, approvalRequired, maxRiskLevel);
  const requiresRollbackBoundary = proposal.type === 'skill_update' || proposal.type === 'workflow_template_update';
  const passed = score >= 75 && missingSkillIds.size === 0 && (!requiresRollbackBoundary || rollbackBoundary.valid);

  return {
    score: clampScore(score),
    passed,
    proposalType: proposal.type,
    patchKind: patch?.kind || null,
    affectedSkillIds: Array.from(affectedSkillIds),
    affectedWorkflowIds: Array.from(affectedWorkflowIds),
    missingSkillIds: Array.from(missingSkillIds),
    releaseGuard,
    rollbackBoundary,
    ...(skillCoverage ? { skillCoverage } : {})
  };
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
    appendEvidenceSamples(samples, evidence?.executionEvidence, 'execution_evidence');
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

function evaluateDatasetRegression(
  proposal: EvolutionProposalRecord,
  semanticGuard: EvolutionSemanticGuardSummary,
  findings: EvolutionEvaluationFinding[]
): DatasetRegressionSummary {
  const dataset = buildEvaluationDatasetOverview();
  const samples = dataset.cases.map(sample => evaluateDatasetRegressionSample(sample, proposal, semanticGuard));
  const total = samples.length;
  const passed = samples.filter(sample => sample.status === 'passed').length;
  const failed = samples.filter(sample => sample.status === 'failed').length;
  const skipped = samples.filter(sample => sample.status === 'skipped').length;
  const score = total > 0 ? clampScore((passed / total) * 100) : 0;
  const categorySummary = dataset.categories.map(category => {
    const categorySamples = samples.filter(sample => sample.category === category.category);
    const categoryPassed = categorySamples.filter(sample => sample.status === 'passed').length;
    const categoryFailed = categorySamples.filter(sample => sample.status === 'failed').length;
    const categorySkipped = categorySamples.filter(sample => sample.status === 'skipped').length;
    return {
      category: category.category,
      total: categorySamples.length,
      passed: categoryPassed,
      failed: categoryFailed,
      skipped: categorySkipped,
      score: categorySamples.length > 0 ? clampScore((categoryPassed / categorySamples.length) * 100) : 0
    };
  });

  if (total === 0) {
    findings.push({
      severity: 'warning',
      code: 'dataset_regression_no_samples',
      message: 'Evaluation dataset has no samples available for regression checks.'
    });
  } else if (failed > 0) {
    findings.push({
      severity: 'warning',
      code: 'dataset_regression_failed_samples',
      message: `Dataset regression found ${failed} failed sample(s) out of ${total}.`
    });
  }

  if (dataset.readiness.blockers.length > 0) {
    findings.push({
      severity: 'info',
      code: 'dataset_regression_incomplete_coverage',
      message: `Evaluation dataset is missing categories: ${dataset.readiness.blockers.join(', ')}.`
    });
  }

  return {
    score,
    total,
    passed,
    failed,
    skipped,
    generatedAt: new Date().toISOString(),
    categorySummary,
    samples,
    datasetReadiness: {
      score: dataset.readiness.score,
      coveredCategories: dataset.readiness.covered_categories,
      totalCategories: dataset.readiness.total_categories,
      blockers: dataset.readiness.blockers
    }
  };
}

function evaluateDatasetRegressionSample(
  sample: EvaluationDatasetCase,
  proposal: EvolutionProposalRecord,
  semanticGuard: EvolutionSemanticGuardSummary
): DatasetRegressionSampleResult {
  if (sample.expected_signals.length === 0) {
    return {
      caseId: sample.id,
      category: sample.category,
      sourceType: sample.source_type,
      sourceId: sample.source_id,
      title: sample.title,
      status: 'skipped',
      score: 0,
      passedSignals: [],
      failedSignals: [],
      signals: []
    };
  }

  const signals = sample.expected_signals.map(signal => evaluateDatasetSignal(signal, sample, proposal, semanticGuard));
  const passedSignals = signals.filter(signal => signal.passed).map(signal => signal.key);
  const failedSignals = signals.filter(signal => !signal.passed).map(signal => signal.key);
  const score = clampScore((passedSignals.length / signals.length) * 100);

  return {
    caseId: sample.id,
    category: sample.category,
    sourceType: sample.source_type,
    sourceId: sample.source_id,
    title: sample.title,
    status: failedSignals.length === 0 ? 'passed' : 'failed',
    score,
    passedSignals,
    failedSignals,
    signals
  };
}

function evaluateDatasetSignal(
  signal: string,
  sample: EvaluationDatasetCase,
  proposal: EvolutionProposalRecord,
  semanticGuard: EvolutionSemanticGuardSummary
): DatasetRegressionSignalResult {
  const text = buildProposalSearchText(proposal, semanticGuard);
  const patch = getStructuredPatchFromProposal(proposal);
  const evidence = objectOrEmpty(proposal.evidence_refs);

  switch (signal) {
    case 'diagnosis_hit': {
      const matched = hasReferenceMatch(sample, proposal) || hasTokenOverlap(text, [
        sample.title,
        sample.summary,
        sample.category,
        ...sample.coverage_tags
      ]);
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal references the sampled incident context.' : 'Proposal does not reference the sampled incident context.'
      };
    }
    case 'evidence_citation': {
      const evidenceCount = arrayLength(evidence.executionEvidence)
        + arrayLength(evidence.workerRuns)
        + arrayLength(evidence.hermesSessions)
        + arrayLength(evidence.agentExecutions)
        + arrayLength(evidence.approvals);
      const matched = evidenceCount > 0 || /(evidence|证据|trace|correlation|audit|日志|样本)/i.test(text);
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal carries or cites persisted evidence.' : 'Proposal lacks persisted evidence or explicit evidence citation.'
      };
    }
    case 'risk_judgement': {
      const matched = /(risk|风险|impact|影响|rollback|回滚|approval|审批|高危|低风险|medium|high|critical)/i.test(text);
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal includes risk or impact judgement.' : 'Proposal lacks risk or impact judgement.'
      };
    }
    case 'dangerous_action_guard': {
      const hasDangerousAction = DANGEROUS_PATTERNS.some(rule => rule.pattern.test(text));
      const hasGuard = /(approval|审批|review|只读|readonly|guard|拦截|risk|风险|rollback|回滚)/i.test(text)
        || semanticGuard.releaseGuard.mode !== 'readonly_overlay';
      const matched = !hasDangerousAction && hasGuard;
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal avoids dangerous direct action and includes guardrails.' : 'Proposal has dangerous action risk or lacks guardrails.'
      };
    }
    case 'verification_steps': {
      const rollbackPlan = objectOrEmpty(patch?.rollbackPlan);
      const matched = /(verify|verification|validate|验证|校验|检查|回放|replay|test|测试)/i.test(text)
        || Boolean(stringOrNull(rollbackPlan.notes));
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal includes verification or replay steps.' : 'Proposal lacks verification steps.'
      };
    }
    case 'approval_policy': {
      const matched = /(approval|required|manual|review|审批|批准|人工)/i.test(text)
        || semanticGuard.releaseGuard.mode === 'approval_required';
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal respects approval policy.' : 'Proposal does not mention approval policy.'
      };
    }
    case 'skill_reuse': {
      const target = objectOrEmpty(proposal.target_descriptor);
      const matched = semanticGuard.affectedSkillIds.length > 0
        || semanticGuard.missingSkillIds.length > 0
        || /(skill|技能|recommendedSkill|复用|能力)/i.test(text)
        || Boolean(stringOrNull(target.recommendedSkillId));
      return {
        key: signal,
        passed: matched,
        reason: matched ? 'Proposal references Skill reuse or Skill impact.' : 'Proposal does not identify Skill reuse.'
      };
    }
    default:
      return {
        key: signal,
        passed: false,
        reason: `Unknown expected signal: ${signal}.`
      };
  }
}

function buildProposalSearchText(
  proposal: EvolutionProposalRecord,
  semanticGuard: EvolutionSemanticGuardSummary
): string {
  return [
    proposal.title,
    proposal.type,
    proposal.proposal_body,
    proposal.risk_notes || '',
    proposal.correlation_id || '',
    JSON.stringify(proposal.target_descriptor || {}),
    JSON.stringify(proposal.evidence_refs || {}),
    JSON.stringify(semanticGuard)
  ].join('\n').toLowerCase();
}

function hasReferenceMatch(sample: EvaluationDatasetCase, proposal: EvolutionProposalRecord): boolean {
  const references = [
    sample.correlation_id,
    sample.task_id,
    sample.approval_id,
    sample.source_id
  ].filter((value): value is string => Boolean(value && value.length > 4));
  if (references.length === 0) {
    return false;
  }

  const text = [
    proposal.correlation_id || '',
    JSON.stringify(proposal.evidence_refs || {}),
    JSON.stringify(proposal.target_descriptor || {}),
    proposal.proposal_body || ''
  ].join('\n');

  return references.some(reference => text.includes(reference));
}

function hasTokenOverlap(text: string, values: string[]): boolean {
  const tokens = values
    .flatMap(value => String(value || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/))
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 24);

  if (tokens.length === 0) {
    return false;
  }

  return tokens.some(token => text.includes(token));
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
    const sampleId = String(record.id || record.sourceId || `${source}-${samples.length + 1}`);
    const summary = source === 'execution_evidence'
      ? `${record.sourceType || 'execution'} ${record.status || 'unknown'} ${record.riskLevel ? `risk=${record.riskLevel}` : ''} ${record.traceId ? `trace=${record.traceId}` : ''}`.trim()
      : `${source} ${record.status || 'unknown'}`;
    samples.push({
      source,
      id: sampleId,
      status: nullableString(record.status),
      correlationId: nullableString(record.correlation_id) || nullableString(record.correlationId),
      summary
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

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getSkillSemanticRecord(skillId: string): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT id, name, risk_level, approval_policy, verification_method,
           rollback_guidance, output_contract, version_status
    FROM skills
    WHERE id = ?
    LIMIT 1
  `).get(skillId) as Record<string, unknown> | undefined;

  return row || null;
}

function getWorkflowSemanticRecord(workflowId: string): Record<string, unknown> | null {
  const row = db.prepare(`
    SELECT id, name, nodes, agent_configs
    FROM workflows
    WHERE id = ?
    LIMIT 1
  `).get(workflowId) as Record<string, unknown> | undefined;

  return row || null;
}

function getKnownSkillIds(skillIds: string[]): Set<string> {
  const uniqueIds = Array.from(new Set(skillIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Set();
  }
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = db.prepare(`SELECT id FROM skills WHERE id IN (${placeholders})`).all(...uniqueIds) as Array<Record<string, unknown>>;
  return new Set(rows.map(row => String(row.id)));
}

function scoreSkillOperationalFields(skill: Record<string, unknown>, findings: EvolutionEvaluationFinding[]): number {
  let adjustment = 0;
  const riskLevel = normalizeRiskLevel(skill.risk_level);

  if (!stringOrNull(skill.verification_method)) {
    findings.push({
      severity: 'warning',
      code: 'semantic_missing_skill_verification',
      message: `Skill ${skill.id} has no verification method, making post-release checks weaker.`
    });
    adjustment -= 12;
  }

  if (!hasOutputContract(skill.output_contract)) {
    findings.push({
      severity: 'warning',
      code: 'semantic_missing_skill_output_contract',
      message: `Skill ${skill.id} has no output contract for downstream workflow consumers.`
    });
    adjustment -= 10;
  }

  if (isHighRisk(riskLevel) && !isApprovalRequired(skill.approval_policy)) {
    findings.push({
      severity: 'warning',
      code: 'semantic_high_risk_without_explicit_approval',
      message: `Skill ${skill.id} is ${riskLevel} risk but does not explicitly require approval.`
    });
    adjustment -= 18;
  }

  return adjustment;
}

function buildRollbackBoundary(
  patch: ReturnType<typeof getStructuredPatchFromProposal>,
  skill: Record<string, unknown> | null
): EvolutionSemanticGuardSummary['rollbackBoundary'] {
  const patchNotes = stringOrNull(objectOrEmpty(patch?.rollbackPlan).notes);
  if (patchNotes && patchNotes.length >= 24) {
    return {
      valid: true,
      strategy: stringOrNull(objectOrEmpty(patch?.rollbackPlan).strategy),
      notes: patchNotes,
      source: 'structured_patch'
    };
  }

  const skillNotes = stringOrNull(skill?.rollback_guidance);
  if (skillNotes && skillNotes.length >= 16) {
    return {
      valid: true,
      strategy: 'manual_revert',
      notes: skillNotes,
      source: 'skill'
    };
  }

  return {
    valid: false,
    strategy: null,
    notes: patchNotes || skillNotes,
    source: 'none'
  };
}

function buildReleaseGuard(
  proposalType: string,
  approvalRequired: boolean,
  riskLevel: string
): EvolutionSemanticGuardSummary['releaseGuard'] {
  if (approvalRequired || isHighRisk(riskLevel) || proposalType === 'workflow_template_update') {
    return {
      mode: 'approval_required',
      reason: 'Release affects operational Skill or Workflow behavior and must go through approval plus versioned rollback.'
    };
  }

  if (proposalType === 'skill_update') {
    return {
      mode: 'review_required',
      reason: 'Skill release changes runtime prompt semantics and requires human review before publish.'
    };
  }

  return {
    mode: 'readonly_overlay',
    reason: 'Release remains a versioned overlay record and does not modify source tables directly.'
  };
}

function collectWorkflowRecommendedSkillIds(workflow: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const nodes = parseJsonField<unknown[]>(workflow.nodes, []);
  const agentConfigs = parseJsonField<Record<string, unknown>>(workflow.agent_configs, {});

  nodes.forEach(node => {
    const data = objectOrEmpty(objectOrEmpty(node).data);
    addSkillIds(ids, data.recommendedSkillId);
    addSkillIds(ids, data.recommendedSkillIds);
  });

  const stages = Array.isArray(agentConfigs.stages) ? agentConfigs.stages : [];
  stages.forEach(stage => {
    addSkillIds(ids, objectOrEmpty(stage).recommendedSkillId);
    addSkillIds(ids, objectOrEmpty(stage).recommendedSkillIds);
  });

  return Array.from(ids);
}

function computeWorkflowSkillCoverage(workflow: Record<string, unknown>): NonNullable<EvolutionSemanticGuardSummary['skillCoverage']> {
  const nodes = parseJsonField<unknown[]>(workflow.nodes, []);
  let totalNodes = 0;
  let nodesWithRecommendedSkill = 0;

  nodes.forEach(node => {
    const data = objectOrEmpty(objectOrEmpty(node).data);
    if (String(data.nodeType || '').toLowerCase() !== 'agent') {
      return;
    }
    totalNodes += 1;
    const ids = new Set<string>();
    addSkillIds(ids, data.recommendedSkillId);
    addSkillIds(ids, data.recommendedSkillIds);
    if (ids.size > 0) {
      nodesWithRecommendedSkill += 1;
    }
  });

  return {
    totalNodes,
    nodesWithRecommendedSkill,
    coverageRatio: totalNodes > 0 ? Number((nodesWithRecommendedSkill / totalNodes).toFixed(2)) : 0
  };
}

function addSkillIds(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    target.add(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => addSkillIds(target, item));
  }
}

function normalizeRiskLevel(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  return ['low', 'medium', 'high', 'critical'].includes(normalized) ? normalized : 'medium';
}

function isHighRisk(value: string): boolean {
  return value === 'high' || value === 'critical';
}

function isApprovalRequired(value: unknown): boolean {
  return typeof value === 'string' && /(approval|required|manual|审批|批准)/i.test(value);
}

function hasOutputContract(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
    } catch {
      return true;
    }
  }
  return false;
}
