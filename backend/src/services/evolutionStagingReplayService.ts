import db from '../models/database';
import { getEvolutionProposal, updateEvolutionProposalStatus } from './evolutionProposalService';
import {
  EvolutionEvaluationFinding,
  EvolutionProposalEvaluationRecord,
  getLatestEvolutionProposalEvaluation
} from './evolutionEvaluationService';
import { getStructuredPatchFromProposal, validateStructuredPatch } from './evolutionPatchService';

type ReplayStatus = 'passed' | 'failed' | 'skipped';

interface DatasetRegressionSample {
  caseId: string;
  category: string;
  sourceType: string;
  sourceId: string;
  title: string;
  status: ReplayStatus;
  score: number;
  failedSignals?: string[];
  passedSignals?: string[];
}

interface StagingReplaySample {
  caseId: string;
  category: string;
  sourceType: string;
  sourceId: string;
  title: string;
  status: ReplayStatus;
  score: number;
  reason: string;
  inheritedFailedSignals: string[];
  shadowActions: string[];
}

export interface StagingReplaySummary {
  mode: 'staging_replay';
  environment: 'staging';
  applyMode: 'shadow_overlay';
  noProductionMutation: true;
  proposalId: string;
  evaluationId: string;
  score: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  generatedAt: string;
  preflight: {
    evaluationPassed: boolean;
    structuredPatchValid: boolean;
    semanticGuardPassed: boolean;
    datasetRegressionAvailable: boolean;
    datasetRegressionPassed: boolean;
  };
  target: {
    proposalType: string;
    patchKind: string | null;
    applyMode: string | null;
    operationCount: number;
  };
  findings: EvolutionEvaluationFinding[];
  samples: StagingReplaySample[];
}

export function runEvolutionStagingReplay(input: {
  proposalId: string;
  actorId?: string | null;
}): EvolutionProposalEvaluationRecord {
  const proposal = getEvolutionProposal(input.proposalId);
  if (!proposal) {
    throw new Error('Evolution proposal not found');
  }

  const evaluation = getLatestEvolutionProposalEvaluation(proposal.id);
  if (!evaluation) {
    throw new Error('Run deterministic evaluation before staging replay');
  }

  const summary = objectOrEmpty(evaluation.result_summary);
  const datasetRegression = objectOrEmpty(summary.datasetRegression);
  const datasetSamples = readDatasetRegressionSamples(datasetRegression.samples);
  if (datasetSamples.length === 0) {
    throw new Error('Run dataset regression evaluation before staging replay');
  }

  const patch = getStructuredPatchFromProposal(proposal);
  const patchValidation = validateStructuredPatch(patch);
  const semanticGuard = objectOrEmpty(summary.semanticGuard);
  const semanticGuardPassed = semanticGuard.passed === true;
  const datasetRegressionPassed = Number(datasetRegression.failed || 0) === 0;
  const preflight = {
    evaluationPassed: Boolean(evaluation.passed),
    structuredPatchValid: patchValidation.valid,
    semanticGuardPassed,
    datasetRegressionAvailable: datasetSamples.length > 0,
    datasetRegressionPassed
  };
  const shadowActions = buildShadowActions(patch);
  const samples = datasetSamples.map(sample =>
    replaySampleInStaging(sample, preflight, shadowActions)
  );
  const total = samples.length;
  const passed = samples.filter(sample => sample.status === 'passed').length;
  const failed = samples.filter(sample => sample.status === 'failed').length;
  const skipped = samples.filter(sample => sample.status === 'skipped').length;
  const score = total > 0 ? clampScore((passed / total) * 100) : 0;
  const findings = buildReplayFindings(preflight, failed, total);

  const stagingReplay: StagingReplaySummary = {
    mode: 'staging_replay',
    environment: 'staging',
    applyMode: 'shadow_overlay',
    noProductionMutation: true,
    proposalId: proposal.id,
    evaluationId: evaluation.id,
    score,
    total,
    passed,
    failed,
    skipped,
    generatedAt: new Date().toISOString(),
    preflight,
    target: {
      proposalType: proposal.type,
      patchKind: typeof patch?.kind === 'string' ? patch.kind : null,
      applyMode: typeof patch?.applyMode === 'string' ? patch.applyMode : null,
      operationCount: Array.isArray(patch?.operations) ? patch.operations.length : 0
    },
    findings,
    samples
  };

  const mergedSummary = {
    ...summary,
    stagingReplay
  };
  const mergedFindings = mergeFindings(evaluation.findings, findings);

  db.prepare(`
    UPDATE evolution_proposal_evaluations
    SET result_summary = ?,
        findings = ?
    WHERE id = ?
  `).run(
    JSON.stringify(mergedSummary),
    JSON.stringify(mergedFindings),
    evaluation.id
  );

  updateEvolutionProposalStatus({
    id: proposal.id,
    status: proposal.status,
    actorId: input.actorId || null,
    comment: failed > 0
      ? `Staging replay completed with ${failed} failed sample(s)`
      : 'Staging replay completed',
    evalSummary: mergedSummary
  });

  return getLatestEvolutionProposalEvaluation(proposal.id)!;
}

function replaySampleInStaging(
  sample: DatasetRegressionSample,
  preflight: StagingReplaySummary['preflight'],
  shadowActions: string[]
): StagingReplaySample {
  if (!preflight.structuredPatchValid || !preflight.semanticGuardPassed) {
    return {
      caseId: sample.caseId,
      category: sample.category,
      sourceType: sample.sourceType,
      sourceId: sample.sourceId,
      title: sample.title,
      status: 'failed',
      score: 0,
      reason: 'Staging preflight failed before sample replay.',
      inheritedFailedSignals: sample.failedSignals || [],
      shadowActions
    };
  }

  if (sample.status === 'failed') {
    return {
      caseId: sample.caseId,
      category: sample.category,
      sourceType: sample.sourceType,
      sourceId: sample.sourceId,
      title: sample.title,
      status: 'failed',
      score: sample.score,
      reason: 'Dataset regression failed for this sample, so staging replay keeps it failed.',
      inheritedFailedSignals: sample.failedSignals || [],
      shadowActions
    };
  }

  if (sample.status === 'skipped') {
    return {
      caseId: sample.caseId,
      category: sample.category,
      sourceType: sample.sourceType,
      sourceId: sample.sourceId,
      title: sample.title,
      status: 'skipped',
      score: 0,
      reason: 'Dataset regression skipped this sample.',
      inheritedFailedSignals: [],
      shadowActions
    };
  }

  return {
    caseId: sample.caseId,
    category: sample.category,
    sourceType: sample.sourceType,
    sourceId: sample.sourceId,
    title: sample.title,
    status: 'passed',
    score: 100,
    reason: 'Sample passes under staging shadow overlay; no production mutation was attempted.',
    inheritedFailedSignals: [],
    shadowActions
  };
}

function buildReplayFindings(
  preflight: StagingReplaySummary['preflight'],
  failed: number,
  total: number
): EvolutionEvaluationFinding[] {
  const findings: EvolutionEvaluationFinding[] = [];
  if (!preflight.evaluationPassed) {
    findings.push({
      severity: 'warning',
      code: 'staging_replay_evaluation_not_passed',
      message: 'Staging replay ran on an evaluation that is not passed.'
    });
  }
  if (!preflight.structuredPatchValid) {
    findings.push({
      severity: 'critical',
      code: 'staging_replay_invalid_patch',
      message: 'Staging replay requires a valid structured patch.'
    });
  }
  if (!preflight.semanticGuardPassed) {
    findings.push({
      severity: 'critical',
      code: 'staging_replay_semantic_guard_failed',
      message: 'Staging replay requires semantic guard to pass.'
    });
  }
  if (!preflight.datasetRegressionPassed) {
    findings.push({
      severity: 'warning',
      code: 'staging_replay_dataset_regression_failed',
      message: 'Staging replay inherited failed dataset regression samples.'
    });
  }
  if (failed > 0) {
    findings.push({
      severity: 'warning',
      code: 'staging_replay_failed_samples',
      message: `Staging replay found ${failed} failed sample(s) out of ${total}.`
    });
  }
  return findings;
}

function buildShadowActions(patch: ReturnType<typeof getStructuredPatchFromProposal>): string[] {
  const operations = Array.isArray(patch?.operations) ? patch.operations : [];
  if (operations.length === 0) {
    return ['shadow_overlay: no structured operation to apply'];
  }

  return operations.slice(0, 8).map((operation, index) => {
    const record = objectOrEmpty(operation);
    const op = typeof record.op === 'string' ? record.op : 'inspect';
    const path = typeof record.path === 'string' ? record.path : '/';
    return `shadow_overlay:${index + 1}:${op}:${path}`;
  });
}

function readDatasetRegressionSamples(value: unknown): DatasetRegressionSample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map(item => ({
      caseId: String(item.caseId || ''),
      category: String(item.category || 'unknown'),
      sourceType: String(item.sourceType || ''),
      sourceId: String(item.sourceId || ''),
      title: String(item.title || 'Dataset sample'),
      status: normalizeReplayStatus(item.status),
      score: Number(item.score || 0),
      failedSignals: readStringList(item.failedSignals),
      passedSignals: readStringList(item.passedSignals)
    }))
    .filter(item => item.caseId);
}

function mergeFindings(
  existing: EvolutionEvaluationFinding[],
  stagingFindings: EvolutionEvaluationFinding[]
): EvolutionEvaluationFinding[] {
  const nonStaging = existing.filter(finding => !finding.code.startsWith('staging_replay_'));
  return [...nonStaging, ...stagingFindings];
}

function normalizeReplayStatus(value: unknown): ReplayStatus {
  return value === 'passed' || value === 'failed' || value === 'skipped' ? value : 'skipped';
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
