import {
  EvolutionReleaseEventRecord,
  EvolutionReleaseVersionRecord,
  getEvolutionReleaseVersion,
  listEvolutionReleaseEvents,
} from './evolutionReleaseService';
import {
  EvolutionProposalEventRecord,
  EvolutionProposalRecord,
  getEvolutionProposal,
  listEvolutionProposalEvents
} from './evolutionProposalService';
import {
  EvolutionProposalEvaluationRecord,
  listEvolutionProposalEvaluations
} from './evolutionEvaluationService';
import { buildEvolutionReleaseGuard } from './evolutionReleaseGuardService';

export type EvolutionReleaseAuditFormat = 'json' | 'markdown';

export interface EvolutionReleaseAuditBundle {
  schemaVersion: 'evolution-release-audit/v1';
  generatedAt: string;
  version: EvolutionReleaseVersionRecord;
  proposal: EvolutionProposalRecord | null;
  proposalEvents: EvolutionProposalEventRecord[];
  releaseEvents: EvolutionReleaseEventRecord[];
  evaluations: EvolutionProposalEvaluationRecord[];
  latestEvaluation: EvolutionProposalEvaluationRecord | null;
  releaseGuard: unknown;
  stagingReplay: unknown;
  rollback: {
    status: EvolutionReleaseVersionRecord['status'];
    rolledBackAt: string | null;
    rolledBackBy: string | null;
    rollbackReason: string | null;
    rollbackEvents: EvolutionReleaseEventRecord[];
  };
  evidenceSummary: {
    proposalEvents: number;
    releaseEvents: number;
    evaluations: number;
    hasReleaseGuard: boolean;
    hasStagingReplay: boolean;
    hasRollbackEvent: boolean;
  };
}

export function buildEvolutionReleaseAuditBundle(versionId: string): EvolutionReleaseAuditBundle {
  const version = getEvolutionReleaseVersion(versionId);
  if (!version) {
    throw new Error('Evolution release version not found');
  }

  const proposal = getEvolutionProposal(version.proposal_id);
  const proposalEvents = proposal ? listEvolutionProposalEvents(proposal.id) : [];
  const releaseEvents = listEvolutionReleaseEvents(version.id);
  const evaluations = proposal ? listEvolutionProposalEvaluations(proposal.id) : [];
  const latestEvaluation = evaluations[0] || null;
  const releaseGuard = readReleaseGuard(version, proposal);
  const stagingReplay = readStagingReplay(latestEvaluation);
  const rollbackEvents = releaseEvents.filter(event => event.event_type === 'rolled_back' || event.event_type === 'restored');

  return {
    schemaVersion: 'evolution-release-audit/v1',
    generatedAt: new Date().toISOString(),
    version,
    proposal,
    proposalEvents,
    releaseEvents,
    evaluations,
    latestEvaluation,
    releaseGuard,
    stagingReplay,
    rollback: {
      status: version.status,
      rolledBackAt: version.rolled_back_at,
      rolledBackBy: version.rolled_back_by,
      rollbackReason: version.rollback_reason,
      rollbackEvents
    },
    evidenceSummary: {
      proposalEvents: proposalEvents.length,
      releaseEvents: releaseEvents.length,
      evaluations: evaluations.length,
      hasReleaseGuard: Boolean(releaseGuard),
      hasStagingReplay: Boolean(stagingReplay),
      hasRollbackEvent: rollbackEvents.length > 0 || version.status === 'rolled_back'
    }
  };
}

export function renderEvolutionReleaseAudit(bundle: EvolutionReleaseAuditBundle, format: EvolutionReleaseAuditFormat): string {
  if (format === 'json') {
    return JSON.stringify(bundle, null, 2);
  }
  return renderMarkdown(bundle);
}

export function buildEvolutionReleaseAuditFilename(bundle: EvolutionReleaseAuditBundle, format: EvolutionReleaseAuditFormat): string {
  const safeVersion = bundle.version.version_label.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const safeTarget = `${bundle.version.object_type}-${bundle.version.target_id || 'global'}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
  return `evolution-release-audit-${safeTarget}-${safeVersion}.${format === 'json' ? 'json' : 'md'}`;
}

function readReleaseGuard(version: EvolutionReleaseVersionRecord, proposal: EvolutionProposalRecord | null): unknown {
  const payloadGuard = objectOrNull(version.payload)?.releaseGuard;
  if (payloadGuard) {
    return payloadGuard;
  }
  if (!proposal) {
    return null;
  }
  try {
    return buildEvolutionReleaseGuard(proposal);
  } catch {
    return null;
  }
}

function readStagingReplay(evaluation: EvolutionProposalEvaluationRecord | null): unknown {
  const summary = objectOrNull(evaluation?.result_summary);
  return summary?.stagingReplay || null;
}

function renderMarkdown(bundle: EvolutionReleaseAuditBundle): string {
  const proposal = bundle.proposal;
  const guard = objectOrNull(bundle.releaseGuard);
  const stagingReplay = objectOrNull(bundle.stagingReplay);

  return [
    `# Evolution Release Audit`,
    '',
    `- Generated At: ${bundle.generatedAt}`,
    `- Version ID: ${bundle.version.id}`,
    `- Version Label: ${bundle.version.version_label}`,
    `- Status: ${bundle.version.status}`,
    `- Object: ${bundle.version.object_type} / ${bundle.version.target_id || 'global'}`,
    `- Published At: ${bundle.version.published_at || '-'}`,
    `- Published By: ${bundle.version.published_by || '-'}`,
    '',
    `## Proposal`,
    '',
    `- Proposal ID: ${proposal?.id || bundle.version.proposal_id}`,
    `- Title: ${proposal?.title || '-'}`,
    `- Type: ${proposal?.type || '-'}`,
    `- Status: ${proposal?.status || '-'}`,
    `- Priority: ${proposal?.priority || '-'}`,
    `- Correlation ID: ${proposal?.correlation_id || '-'}`,
    '',
    `## Evaluation`,
    '',
    `- Evaluation Count: ${bundle.evaluations.length}`,
    `- Latest Evaluation: ${bundle.latestEvaluation?.id || '-'}`,
    `- Latest Status: ${bundle.latestEvaluation?.status || '-'}`,
    `- Latest Score: ${bundle.latestEvaluation?.score ?? '-'}`,
    `- Replay Samples: ${bundle.latestEvaluation?.replay_sample_count ?? '-'}`,
    '',
    `## Staging Replay`,
    '',
    `- Present: ${stagingReplay ? 'yes' : 'no'}`,
    `- Passed: ${readNestedNumber(stagingReplay, 'passed')}`,
    `- Failed: ${readNestedNumber(stagingReplay, 'failed')}`,
    `- Total: ${readNestedNumber(stagingReplay, 'total')}`,
    `- Score: ${readNestedNumber(stagingReplay, 'score')}`,
    '',
    `## Release Guard`,
    '',
    `- Present: ${guard ? 'yes' : 'no'}`,
    `- Passed: ${readNestedBoolean(guard, 'passed')}`,
    `- Score: ${readNestedNumber(guard, 'score')}`,
    `- Blockers: ${readNestedList(guard, 'blockers')}`,
    '',
    `## Rollback`,
    '',
    `- Status: ${bundle.rollback.status}`,
    `- Rolled Back At: ${bundle.rollback.rolledBackAt || '-'}`,
    `- Rolled Back By: ${bundle.rollback.rolledBackBy || '-'}`,
    `- Reason: ${bundle.rollback.rollbackReason || '-'}`,
    `- Rollback Events: ${bundle.rollback.rollbackEvents.length}`,
    '',
    `## Evidence Summary`,
    '',
    `- Proposal Events: ${bundle.evidenceSummary.proposalEvents}`,
    `- Release Events: ${bundle.evidenceSummary.releaseEvents}`,
    `- Evaluations: ${bundle.evidenceSummary.evaluations}`,
    `- Has Release Guard: ${bundle.evidenceSummary.hasReleaseGuard}`,
    `- Has Staging Replay: ${bundle.evidenceSummary.hasStagingReplay}`,
    `- Has Rollback Event: ${bundle.evidenceSummary.hasRollbackEvent}`,
    '',
    `## Release Events`,
    '',
    ...renderEvents(bundle.releaseEvents),
    '',
    `## Proposal Events`,
    '',
    ...renderEvents(bundle.proposalEvents)
  ].join('\n');
}

function renderEvents(events: Array<{ event_type: string; actor_id: string | null; comment: string | null; created_at: string }>): string[] {
  if (events.length === 0) {
    return ['- None'];
  }
  return events.map(event => `- ${event.created_at} ${event.event_type} actor=${event.actor_id || '-'} comment=${event.comment || '-'}`);
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNestedNumber(value: Record<string, unknown> | null, key: string): string {
  const raw = value?.[key];
  return typeof raw === 'number' ? String(raw) : '-';
}

function readNestedBoolean(value: Record<string, unknown> | null, key: string): string {
  const raw = value?.[key];
  return typeof raw === 'boolean' ? String(raw) : '-';
}

function readNestedList(value: Record<string, unknown> | null, key: string): string {
  const raw = value?.[key];
  return Array.isArray(raw) && raw.length > 0 ? raw.join(', ') : '-';
}
