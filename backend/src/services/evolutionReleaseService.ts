import { randomUUID } from 'crypto';
import db from '../models/database';
import {
  EvolutionProposalRecord,
  getEvolutionProposal,
  updateEvolutionProposalStatus
} from './evolutionProposalService';
import { getLatestEvolutionProposalEvaluation } from './evolutionEvaluationService';
import { getStructuredPatchFromProposal, validateStructuredPatch } from './evolutionPatchService';

export interface EvolutionReleaseVersionRecord {
  id: string;
  proposal_id: string;
  object_type: string;
  target_id: string | null;
  version_label: string;
  status: 'active' | 'superseded' | 'rolled_back';
  payload: unknown;
  previous_version_id: string | null;
  published_by: string | null;
  published_at: string | null;
  rolled_back_by: string | null;
  rolled_back_at: string | null;
  rollback_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvolutionReleaseEventRecord {
  id: string;
  version_id: string;
  proposal_id: string | null;
  event_type: string;
  actor_id: string | null;
  comment: string | null;
  metadata: unknown;
  created_at: string;
}

export function listEvolutionReleaseVersions(filters: {
  proposalId?: string;
  objectType?: string;
  targetId?: string;
  status?: string;
  limit?: number;
} = {}): EvolutionReleaseVersionRecord[] {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters.proposalId) {
    conditions.push('proposal_id = ?');
    params.push(filters.proposalId);
  }
  if (filters.objectType) {
    conditions.push('object_type = ?');
    params.push(filters.objectType);
  }
  if (filters.targetId) {
    conditions.push('target_id = ?');
    params.push(filters.targetId);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  const rows = db.prepare(`
    SELECT *
    FROM evolution_release_versions
    WHERE ${conditions.join(' AND ')}
    ORDER BY published_at DESC, created_at DESC
    LIMIT ?
  `).all(...params, clampLimit(filters.limit, 50, 200)) as Array<Record<string, unknown>>;

  return rows.map(parseVersion);
}

export function listEvolutionReleaseEvents(versionId: string): EvolutionReleaseEventRecord[] {
  const rows = db.prepare(`
    SELECT *
    FROM evolution_release_events
    WHERE version_id = ?
    ORDER BY created_at ASC
  `).all(versionId) as Array<Record<string, unknown>>;

  return rows.map(parseEvent);
}

export function publishEvolutionProposal(input: {
  proposalId: string;
  actorId?: string | null;
  comment?: string | null;
}): EvolutionReleaseVersionRecord {
  const proposal = getEvolutionProposal(input.proposalId);
  if (!proposal) {
    throw new Error('Evolution proposal not found');
  }
  assertPublishable(proposal);

  const target = normalizeTarget(proposal);
  const previous = getActiveVersion(target.objectType, target.targetId);
  const versionId = randomUUID();
  const versionLabel = buildVersionLabel(proposal, previous);
  const payload = buildVersionPayload(proposal, target, previous?.id || null);

  const transaction = db.transaction(() => {
    if (previous) {
      db.prepare(`
        UPDATE evolution_release_versions
        SET status = 'superseded',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(previous.id);
      appendReleaseEvent(previous.id, previous.proposal_id, 'superseded', input.actorId || null, input.comment || null, {
        supersededBy: versionId
      });
    }

    db.prepare(`
      INSERT INTO evolution_release_versions (
        id, proposal_id, object_type, target_id, version_label, status, payload,
        previous_version_id, published_by, published_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      versionId,
      proposal.id,
      target.objectType,
      target.targetId,
      versionLabel,
      JSON.stringify(payload),
      previous?.id || null,
      input.actorId || null
    );

    appendReleaseEvent(versionId, proposal.id, 'published', input.actorId || null, input.comment || null, {
      previousVersionId: previous?.id || null,
      objectType: target.objectType,
      targetId: target.targetId
    });

    updateEvolutionProposalStatus({
      id: proposal.id,
      status: 'published',
      actorId: input.actorId || null,
      comment: input.comment || 'Published as versioned release',
      evalSummary: proposal.eval_summary
    });
  });

  transaction();
  return getVersion(versionId)!;
}

export function rollbackEvolutionReleaseVersion(input: {
  versionId: string;
  actorId?: string | null;
  reason?: string | null;
}): EvolutionReleaseVersionRecord {
  const version = getVersion(input.versionId);
  if (!version) {
    throw new Error('Evolution release version not found');
  }
  if (version.status !== 'active') {
    throw new Error(`Only active versions can be rolled back. Current status: ${version.status}`);
  }

  const previous = version.previous_version_id ? getVersion(version.previous_version_id) : null;

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE evolution_release_versions
      SET status = 'rolled_back',
          rolled_back_by = ?,
          rolled_back_at = CURRENT_TIMESTAMP,
          rollback_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(input.actorId || null, normalizeOptionalText(input.reason, 5000), version.id);

    appendReleaseEvent(version.id, version.proposal_id, 'rolled_back', input.actorId || null, input.reason || null, {
      restoredVersionId: previous?.id || null
    });

    if (previous) {
      db.prepare(`
        UPDATE evolution_release_versions
        SET status = 'active',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(previous.id);

      appendReleaseEvent(previous.id, previous.proposal_id, 'restored', input.actorId || null, input.reason || null, {
        rolledBackVersionId: version.id
      });
    }
  });

  transaction();
  return getVersion(version.id)!;
}

function assertPublishable(proposal: EvolutionProposalRecord): void {
  if (proposal.status !== 'approved') {
    throw new Error(`Proposal must be approved before publishing. Current status: ${proposal.status}`);
  }

  const evaluation = getLatestEvolutionProposalEvaluation(proposal.id);
  if (!evaluation || !evaluation.passed) {
    throw new Error('Proposal must have a passing evaluation before publishing');
  }

  const patchValidation = validateStructuredPatch(getStructuredPatchFromProposal(proposal));
  if (!patchValidation.valid) {
    throw new Error('Proposal must include a valid structured patch before publishing');
  }

  const semanticGuard = objectOrEmpty(objectOrEmpty(evaluation.result_summary).semanticGuard);
  if (isSkillOrWorkflowProposal(proposal.type) && Object.keys(semanticGuard).length === 0) {
    throw new Error('Proposal must be re-evaluated with Skill semantic release guards before publishing');
  }
  if (semanticGuard.passed === false) {
    throw new Error('Proposal semantic release guard did not pass');
  }
  const rollbackBoundary = objectOrEmpty(semanticGuard.rollbackBoundary);
  if (isSkillOrWorkflowProposal(proposal.type) && rollbackBoundary.valid !== true) {
    throw new Error('Proposal must define a valid rollback boundary before publishing');
  }
}

function normalizeTarget(proposal: EvolutionProposalRecord): { objectType: string; targetId: string | null } {
  const descriptor = proposal.target_descriptor && typeof proposal.target_descriptor === 'object'
    ? proposal.target_descriptor as Record<string, unknown>
    : {};
  const objectType = typeof descriptor.targetType === 'string' && descriptor.targetType.trim()
    ? descriptor.targetType.trim()
    : proposal.type.replace(/_update$/, '');
  const targetId = typeof descriptor.targetId === 'string' && descriptor.targetId.trim()
    ? descriptor.targetId.trim()
    : null;

  return { objectType, targetId };
}

function getActiveVersion(objectType: string, targetId: string | null): EvolutionReleaseVersionRecord | null {
  const row = db.prepare(`
    SELECT *
    FROM evolution_release_versions
    WHERE object_type = ?
      AND IFNULL(target_id, '') = IFNULL(?, '')
      AND status = 'active'
    ORDER BY published_at DESC
    LIMIT 1
  `).get(objectType, targetId || null) as Record<string, unknown> | undefined;

  return row ? parseVersion(row) : null;
}

function getVersion(id: string): EvolutionReleaseVersionRecord | null {
  const row = db.prepare('SELECT * FROM evolution_release_versions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? parseVersion(row) : null;
}

function buildVersionLabel(proposal: EvolutionProposalRecord, previous: EvolutionReleaseVersionRecord | null): string {
  const numeric = previous?.version_label?.match(/^v(\d+)$/);
  if (numeric) {
    return `v${Number(numeric[1]) + 1}`;
  }
  return 'v1';
}

function buildVersionPayload(
  proposal: EvolutionProposalRecord,
  target: { objectType: string; targetId: string | null },
  previousVersionId: string | null
): Record<string, unknown> {
  const structuredPatch = getStructuredPatchFromProposal(proposal);
  const evaluation = getLatestEvolutionProposalEvaluation(proposal.id);
  const evalSummary = objectOrEmpty(evaluation?.result_summary);
  const semanticGuard = objectOrEmpty(evalSummary.semanticGuard);
  return {
    proposalId: proposal.id,
    proposalType: proposal.type,
    title: proposal.title,
    objectType: target.objectType,
    targetId: target.targetId,
    proposalBody: proposal.proposal_body,
    structuredPatch,
    structuredPatchValidation: validateStructuredPatch(structuredPatch),
    targetDescriptor: proposal.target_descriptor,
    evidenceRefs: proposal.evidence_refs,
    evalSummary: proposal.eval_summary,
    latestEvaluationSummary: evaluation?.result_summary || null,
    semanticGuard: Object.keys(semanticGuard).length > 0 ? semanticGuard : null,
    riskNotes: proposal.risk_notes,
    correlationId: proposal.correlation_id,
    previousVersionId,
    applyMode: 'versioned_release_record'
  };
}

function isSkillOrWorkflowProposal(type: string): boolean {
  return type === 'skill_update' || type === 'workflow_template_update';
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function appendReleaseEvent(
  versionId: string,
  proposalId: string | null,
  eventType: string,
  actorId?: string | null,
  comment?: string | null,
  metadata?: unknown
): void {
  db.prepare(`
    INSERT INTO evolution_release_events (
      id, version_id, proposal_id, event_type, actor_id, comment, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    randomUUID(),
    versionId,
    proposalId,
    eventType,
    actorId || null,
    normalizeOptionalText(comment, 5000),
    JSON.stringify(metadata ?? null)
  );
}

function parseVersion(row: Record<string, unknown>): EvolutionReleaseVersionRecord {
  return {
    id: String(row.id),
    proposal_id: String(row.proposal_id),
    object_type: String(row.object_type || ''),
    target_id: nullableString(row.target_id),
    version_label: String(row.version_label || ''),
    status: normalizeVersionStatus(row.status),
    payload: parseJsonField(row.payload, null),
    previous_version_id: nullableString(row.previous_version_id),
    published_by: nullableString(row.published_by),
    published_at: nullableString(row.published_at),
    rolled_back_by: nullableString(row.rolled_back_by),
    rolled_back_at: nullableString(row.rolled_back_at),
    rollback_reason: nullableString(row.rollback_reason),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || '')
  };
}

function parseEvent(row: Record<string, unknown>): EvolutionReleaseEventRecord {
  return {
    id: String(row.id),
    version_id: String(row.version_id),
    proposal_id: nullableString(row.proposal_id),
    event_type: String(row.event_type || ''),
    actor_id: nullableString(row.actor_id),
    comment: nullableString(row.comment),
    metadata: parseJsonField(row.metadata, null),
    created_at: String(row.created_at || '')
  };
}

function normalizeVersionStatus(value: unknown): 'active' | 'superseded' | 'rolled_back' {
  if (value === 'active' || value === 'superseded' || value === 'rolled_back') {
    return value;
  }
  return 'superseded';
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  return value.trim().slice(0, maxLength);
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

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
}
