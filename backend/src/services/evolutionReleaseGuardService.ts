import { EvolutionProposalRecord, getEvolutionProposal } from './evolutionProposalService';
import {
  EvolutionProposalEvaluationRecord,
  getLatestEvolutionProposalEvaluation
} from './evolutionEvaluationService';
import { getStructuredPatchFromProposal, validateStructuredPatch } from './evolutionPatchService';
import {
  buildEvolutionReleaseGovernance,
  EvolutionReleaseGovernanceContext,
  EvolutionReleaseGovernanceSummary
} from './evolutionReleaseGovernanceService';

export type EvolutionReleaseGuardCheckStatus = 'passed' | 'failed' | 'warning';

export interface EvolutionReleaseGuardCheck {
  key: string;
  status: EvolutionReleaseGuardCheckStatus;
  required: boolean;
  message: string;
}

export interface EvolutionReleaseGuardSummary {
  passed: boolean;
  score: number;
  blockers: string[];
  checks: EvolutionReleaseGuardCheck[];
  latestEvaluationId: string | null;
  datasetRegression: {
    score: number;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    coverageReady: boolean;
    coverageBlockers: string[];
  } | null;
  stagingReplay: {
    score: number;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    applyMode: string | null;
    noProductionMutation: boolean;
  } | null;
  rollbackTrigger: {
    required: boolean;
    valid: boolean;
    source: string | null;
    notes: string | null;
    triggers: string[];
  };
  governance: EvolutionReleaseGovernanceSummary;
  generatedAt: string;
}

export function buildEvolutionReleaseGuard(
  proposalIdOrRecord: string | EvolutionProposalRecord,
  context: EvolutionReleaseGovernanceContext = {}
): EvolutionReleaseGuardSummary {
  const proposal = typeof proposalIdOrRecord === 'string'
    ? getEvolutionProposal(proposalIdOrRecord)
    : proposalIdOrRecord;
  if (!proposal) {
    throw new Error('Evolution proposal not found');
  }

  const evaluation = getLatestEvolutionProposalEvaluation(proposal.id);
  const structuredPatch = getStructuredPatchFromProposal(proposal);
  const patchValidation = validateStructuredPatch(structuredPatch);
  const summary = objectOrEmpty(evaluation?.result_summary);
  const semanticGuard = objectOrEmpty(summary.semanticGuard);
  const rollbackBoundary = objectOrEmpty(semanticGuard.rollbackBoundary);
  const datasetRegression = normalizeDatasetRegression(summary.datasetRegression);
  const stagingReplay = normalizeStagingReplay(summary.stagingReplay);
  const stagingPreflight = objectOrEmpty(objectOrEmpty(summary.stagingReplay).preflight);
  const requiresSemanticGuard = isSkillOrWorkflowProposal(proposal.type);
  const governance = buildEvolutionReleaseGovernance(proposal, structuredPatch, context);
  const checks: EvolutionReleaseGuardCheck[] = [];

  checks.push(check(
    'proposal_approved',
    proposal.status === 'approved' || proposal.status === 'published',
    true,
    `Proposal status is ${proposal.status}.`
  ));
  checks.push(check(
    'evaluation_passed',
    Boolean(evaluation?.passed),
    true,
    evaluation ? `Latest evaluation score is ${evaluation.score}.` : 'No evaluation has been run.'
  ));
  checks.push(check(
    'structured_patch_valid',
    patchValidation.valid,
    true,
    patchValidation.valid ? 'Structured patch is valid.' : 'Structured patch is missing or invalid.'
  ));
  checks.push(check(
    'semantic_guard_passed',
    !requiresSemanticGuard || semanticGuard.passed === true,
    true,
    !requiresSemanticGuard
      ? 'Semantic guard is optional for this proposal type.'
      : semanticGuard.passed === true
        ? 'Skill/workflow semantic guard passed.'
        : 'Skill/workflow semantic guard has not passed.'
  ));
  checks.push(check(
    'rollback_boundary_valid',
    !requiresSemanticGuard || rollbackBoundary.valid === true,
    true,
    !requiresSemanticGuard
      ? 'Rollback boundary is optional for this proposal type.'
      : rollbackBoundary.valid === true
        ? 'Rollback boundary is defined.'
        : 'A valid rollback boundary is required.'
  ));
  checks.push(check(
    'dataset_regression_present',
    Boolean(datasetRegression),
    true,
    datasetRegression
      ? `Dataset regression covers ${datasetRegression.total} sample(s).`
      : 'Dataset regression has not been generated.'
  ));
  checks.push(check(
    'dataset_regression_passed',
    Boolean(datasetRegression && datasetRegression.total > 0 && datasetRegression.passed > 0 && datasetRegression.failed === 0),
    true,
    datasetRegression
      ? `Dataset regression passed ${datasetRegression.passed}/${datasetRegression.total}, failed ${datasetRegression.failed}.`
      : 'Dataset regression is missing.'
  ));
  checks.push(check(
    'dataset_coverage_ready',
    datasetRegression?.coverageReady !== false,
    false,
    datasetRegression?.coverageReady === false
      ? `Dataset coverage still has blockers: ${datasetRegression.coverageBlockers.join(', ')}.`
      : 'Dataset coverage is ready enough for this guard.'
  ));
  checks.push(check(
    'staging_replay_present',
    Boolean(stagingReplay),
    true,
    stagingReplay
      ? `Staging replay covers ${stagingReplay.total} sample(s).`
      : 'Staging replay has not been run.'
  ));
  checks.push(check(
    'staging_replay_passed',
    Boolean(stagingReplay && stagingReplay.total > 0 && stagingReplay.passed > 0 && stagingReplay.failed === 0),
    true,
    stagingReplay
      ? `Staging replay passed ${stagingReplay.passed}/${stagingReplay.total}, failed ${stagingReplay.failed}.`
      : 'Staging replay is missing.'
  ));
  checks.push(check(
    'staging_preflight_passed',
    Boolean(
      stagingReplay
      && stagingPreflight.evaluationPassed === true
      && stagingPreflight.structuredPatchValid === true
      && stagingPreflight.semanticGuardPassed === true
      && stagingPreflight.datasetRegressionAvailable === true
      && stagingPreflight.datasetRegressionPassed === true
    ),
    true,
    stagingReplay
      ? 'Staging preflight must pass evaluation, patch, semantic guard, and dataset regression checks.'
      : 'Staging preflight is missing.'
  ));
  checks.push(check(
    'shadow_no_production_mutation',
    Boolean(stagingReplay && stagingReplay.applyMode === 'shadow_overlay' && stagingReplay.noProductionMutation),
    true,
    stagingReplay
      ? `${stagingReplay.applyMode || 'unknown'} / noProductionMutation=${stagingReplay.noProductionMutation}.`
      : 'No staging replay safety boundary is recorded.'
  ));
  checks.push(check(
    'high_risk_change_window_open',
    !governance.highRisk || governance.changeWindow.open,
    governance.highRisk,
    governance.highRisk
      ? `Change window ${governance.changeWindow.open ? 'open' : 'closed'} at day=${governance.changeWindow.localDay} time=${governance.changeWindow.localTime} ${governance.changeWindow.timezone}; allowed days=${governance.changeWindow.days.join(',')} ${governance.changeWindow.start}-${governance.changeWindow.end}.`
      : 'Change window is advisory for non-high-risk releases.'
  ));
  checks.push(check(
    'high_risk_dual_approval',
    governance.dualApproval.valid,
    governance.dualApproval.required,
    governance.dualApproval.required
      ? `Reviewer=${governance.dualApproval.reviewerId || 'missing'}, publisher=${governance.dualApproval.publisherId || 'missing'}.`
      : 'Dual approval is advisory for non-high-risk releases.'
  ));
  checks.push(check(
    'high_risk_rollback_plan',
    governance.rollbackPlan.valid,
    governance.rollbackPlan.required,
    governance.rollbackPlan.required
      ? `Rollback plan ${governance.rollbackPlan.valid ? 'present' : 'missing'}; strategy=${governance.rollbackPlan.strategy || 'missing'}.`
      : 'Rollback plan is advisory for non-high-risk releases.'
  ));

  const blockers = checks
    .filter(item => item.required && item.status === 'failed')
    .map(item => item.key);
  const passedCount = checks.filter(item => item.status === 'passed').length;
  const score = checks.length > 0 ? Math.round((passedCount / checks.length) * 100) : 0;
  const rollbackTriggers = [
    'dataset_regression_failed',
    'staging_replay_failed',
    'runtime_error_after_release',
    'manual_admin_rollback'
  ];

  return {
    passed: blockers.length === 0,
    score,
    blockers,
    checks,
    latestEvaluationId: evaluation?.id || null,
    datasetRegression,
    stagingReplay,
    rollbackTrigger: {
      required: requiresSemanticGuard,
      valid: !requiresSemanticGuard || rollbackBoundary.valid === true,
      source: typeof rollbackBoundary.source === 'string' ? rollbackBoundary.source : null,
      notes: typeof rollbackBoundary.notes === 'string' ? rollbackBoundary.notes : null,
      triggers: rollbackTriggers
    },
    governance,
    generatedAt: new Date().toISOString()
  };
}

export function assertEvolutionReleaseGuard(
  proposal: EvolutionProposalRecord,
  context: EvolutionReleaseGovernanceContext = {}
): EvolutionReleaseGuardSummary {
  const guard = buildEvolutionReleaseGuard(proposal, context);
  if (!guard.passed) {
    throw new Error(`Release guard blocked publish: ${guard.blockers.join(', ')}`);
  }
  return guard;
}

function check(key: string, passed: boolean, required: boolean, message: string): EvolutionReleaseGuardCheck {
  return {
    key,
    status: passed ? 'passed' : required ? 'failed' : 'warning',
    required,
    message
  };
}

function normalizeDatasetRegression(value: unknown): EvolutionReleaseGuardSummary['datasetRegression'] {
  const regression = objectOrEmpty(value);
  if (Object.keys(regression).length === 0) {
    return null;
  }
  const readiness = objectOrEmpty(regression.datasetReadiness);
  return {
    score: toNumber(regression.score),
    total: toNumber(regression.total),
    passed: toNumber(regression.passed),
    failed: toNumber(regression.failed),
    skipped: toNumber(regression.skipped),
    coverageReady: toNumber(readiness.score) >= 100 && readStringArray(readiness.blockers).length === 0,
    coverageBlockers: readStringArray(readiness.blockers)
  };
}

function normalizeStagingReplay(value: unknown): EvolutionReleaseGuardSummary['stagingReplay'] {
  const replay = objectOrEmpty(value);
  if (Object.keys(replay).length === 0) {
    return null;
  }
  return {
    score: toNumber(replay.score),
    total: toNumber(replay.total),
    passed: toNumber(replay.passed),
    failed: toNumber(replay.failed),
    skipped: toNumber(replay.skipped),
    applyMode: typeof replay.applyMode === 'string' ? replay.applyMode : null,
    noProductionMutation: replay.noProductionMutation === true
  };
}

function isSkillOrWorkflowProposal(type: string): boolean {
  return type === 'skill_update' || type === 'workflow_template_update';
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
