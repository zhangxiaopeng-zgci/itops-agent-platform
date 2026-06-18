import { EvolutionProposalRecord, listEvolutionProposalEvents } from './evolutionProposalService';
import { getLatestEvolutionProposalEvaluation } from './evolutionEvaluationService';
import { listEvolutionReleaseVersions } from './evolutionReleaseService';
import { getStructuredPatchFromProposal, validateStructuredPatch } from './evolutionPatchService';

export type EvolutionLifecycleStage =
  | 'candidate'
  | 'evaluation'
  | 'approval'
  | 'release'
  | 'published'
  | 'closed';

export type EvolutionLifecycleNextAction =
  | 'enrich'
  | 'evaluate'
  | 'fix_findings'
  | 'submit_approval'
  | 'approve'
  | 'publish'
  | 'monitor'
  | 'none';

export interface EvolutionLifecycleSummary {
  stage: EvolutionLifecycleStage;
  next_action: EvolutionLifecycleNextAction;
  readiness_score: number;
  blockers: string[];
  signals: {
    enriched: boolean;
    patch_valid: boolean;
    evaluation_passed: boolean;
    evaluation_score: number | null;
    approval_ready: boolean;
    approved: boolean;
    published: boolean;
    active_release_id: string | null;
  };
}

export function summarizeEvolutionProposalLifecycle(proposal: EvolutionProposalRecord): EvolutionLifecycleSummary {
  const events = listEvolutionProposalEvents(proposal.id);
  const enriched = events.some(event => event.event_type === 'enriched') || Boolean(objectOrEmpty(proposal.evidence_refs).enrichment);
  const patchValidation = validateStructuredPatch(getStructuredPatchFromProposal(proposal));
  const evaluation = getLatestEvolutionProposalEvaluation(proposal.id);
  const releases = listEvolutionReleaseVersions({ proposalId: proposal.id });
  const activeRelease = releases.find(release => release.status === 'active') || null;
  const evaluationPassed = Boolean(evaluation?.passed);
  const approved = proposal.status === 'approved' || proposal.status === 'published';
  const approvalReady = proposal.status === 'approval_pending' || approved;
  const published = proposal.status === 'published' || Boolean(activeRelease);

  if (proposal.status === 'rejected' || proposal.status === 'archived') {
    return buildSummary({
      stage: 'closed',
      nextAction: 'none',
      blockers: [],
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation?.score ?? null,
      approvalReady,
      approved,
      published,
      activeReleaseId: activeRelease?.id || null
    });
  }

  if (published) {
    return buildSummary({
      stage: 'published',
      nextAction: 'monitor',
      blockers: [],
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation?.score ?? null,
      approvalReady,
      approved,
      published,
      activeReleaseId: activeRelease?.id || null
    });
  }

  const blockers: string[] = [];
  if (!enriched && isCandidateSource(proposal.source)) {
    blockers.push('needs_enrichment');
    return buildSummary({
      stage: 'candidate',
      nextAction: 'enrich',
      blockers,
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation?.score ?? null,
      approvalReady,
      approved,
      published,
      activeReleaseId: null
    });
  }

  if (!patchValidation.valid) {
    blockers.push('invalid_structured_patch');
  }

  if (!evaluation) {
    blockers.push('missing_evaluation');
    return buildSummary({
      stage: 'evaluation',
      nextAction: 'evaluate',
      blockers,
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: null,
      approvalReady,
      approved,
      published,
      activeReleaseId: null
    });
  }

  if (!evaluationPassed) {
    blockers.push('evaluation_failed');
    return buildSummary({
      stage: 'evaluation',
      nextAction: 'fix_findings',
      blockers,
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation.score,
      approvalReady,
      approved,
      published,
      activeReleaseId: null
    });
  }

  if (!approvalReady) {
    return buildSummary({
      stage: 'approval',
      nextAction: 'submit_approval',
      blockers,
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation.score,
      approvalReady,
      approved,
      published,
      activeReleaseId: null
    });
  }

  if (!approved) {
    blockers.push('awaiting_admin_approval');
    return buildSummary({
      stage: 'approval',
      nextAction: 'approve',
      blockers,
      enriched,
      patchValid: patchValidation.valid,
      evaluationPassed,
      evaluationScore: evaluation.score,
      approvalReady,
      approved,
      published,
      activeReleaseId: null
    });
  }

  return buildSummary({
    stage: 'release',
    nextAction: 'publish',
    blockers,
    enriched,
    patchValid: patchValidation.valid,
    evaluationPassed,
    evaluationScore: evaluation.score,
    approvalReady,
    approved,
    published,
    activeReleaseId: null
  });
}

function buildSummary(input: {
  stage: EvolutionLifecycleStage;
  nextAction: EvolutionLifecycleNextAction;
  blockers: string[];
  enriched: boolean;
  patchValid: boolean;
  evaluationPassed: boolean;
  evaluationScore: number | null;
  approvalReady: boolean;
  approved: boolean;
  published: boolean;
  activeReleaseId: string | null;
}): EvolutionLifecycleSummary {
  return {
    stage: input.stage,
    next_action: input.nextAction,
    readiness_score: computeReadinessScore(input),
    blockers: input.blockers,
    signals: {
      enriched: input.enriched,
      patch_valid: input.patchValid,
      evaluation_passed: input.evaluationPassed,
      evaluation_score: input.evaluationScore,
      approval_ready: input.approvalReady,
      approved: input.approved,
      published: input.published,
      active_release_id: input.activeReleaseId
    }
  };
}

function computeReadinessScore(input: {
  enriched: boolean;
  patchValid: boolean;
  evaluationPassed: boolean;
  approvalReady: boolean;
  approved: boolean;
  published: boolean;
}): number {
  if (input.published) return 100;
  let score = 10;
  if (input.enriched) score += 20;
  if (input.patchValid) score += 20;
  if (input.evaluationPassed) score += 25;
  if (input.approvalReady) score += 10;
  if (input.approved) score += 15;
  return Math.min(100, score);
}

function isCandidateSource(source: string): boolean {
  return source === 'feedback_failure' || source === 'verification_failure';
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
