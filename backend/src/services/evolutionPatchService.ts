import { randomUUID } from 'crypto';
import type { EvolutionProposalRecord, EvolutionProposalType } from './evolutionProposalService';

export type EvolutionStructuredPatchKind =
  | 'skill_patch'
  | 'workflow_template_patch'
  | 'tool_policy_patch'
  | 'knowledge_patch'
  | 'mcp_binding_patch'
  | 'prompt_patch';

export type EvolutionStructuredPatchOperationType =
  | 'propose'
  | 'merge'
  | 'replace'
  | 'append'
  | 'remove'
  | 'bind'
  | 'unbind';

export interface EvolutionStructuredPatchOperation {
  op: EvolutionStructuredPatchOperationType;
  path: string;
  value?: unknown;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
}

export interface EvolutionStructuredPatch {
  schemaVersion: 'evolution.patch.v1';
  patchId: string;
  kind: EvolutionStructuredPatchKind;
  applyMode: 'proposal_only';
  target: {
    objectType: string;
    targetId: string | null;
    selector: Record<string, unknown>;
  };
  summary: string;
  operations: EvolutionStructuredPatchOperation[];
  evidenceRefs: unknown;
  rollbackPlan: {
    strategy: 'release_overlay_revert' | 'manual_revert';
    notes: string;
  };
  createdAt: string;
}

export interface EvolutionStructuredPatchValidationFinding {
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string;
}

export interface EvolutionStructuredPatchValidation {
  valid: boolean;
  score: number;
  findings: EvolutionStructuredPatchValidationFinding[];
}

const TYPE_TO_PATCH_KIND: Record<EvolutionProposalType, EvolutionStructuredPatchKind> = {
  skill_update: 'skill_patch',
  workflow_template_update: 'workflow_template_patch',
  tool_policy_update: 'tool_policy_patch',
  knowledge_update: 'knowledge_patch',
  mcp_binding_update: 'mcp_binding_patch',
  prompt_update: 'prompt_patch'
};

const TYPE_TO_TARGET_TYPE: Record<EvolutionProposalType, string> = {
  skill_update: 'skill',
  workflow_template_update: 'workflow_template',
  tool_policy_update: 'tool_policy',
  knowledge_update: 'knowledge',
  mcp_binding_update: 'mcp_binding',
  prompt_update: 'agent_prompt'
};

export function buildStructuredPatch(input: {
  proposalType: EvolutionProposalType;
  title: string;
  proposalBody: string;
  targetDescriptor?: unknown;
  evidenceRefs?: unknown;
}): EvolutionStructuredPatch {
  const descriptor = objectOrEmpty(input.targetDescriptor);
  const targetType = stringOrNull(descriptor.targetType) || TYPE_TO_TARGET_TYPE[input.proposalType];
  const targetId = stringOrNull(descriptor.targetId);
  const kind = TYPE_TO_PATCH_KIND[input.proposalType];

  return {
    schemaVersion: 'evolution.patch.v1',
    patchId: `patch-${randomUUID()}`,
    kind,
    applyMode: 'proposal_only',
    target: {
      objectType: targetType,
      targetId,
      selector: buildSelector(descriptor, input.proposalType)
    },
    summary: input.title.slice(0, 240),
    operations: buildOperations(kind, input.proposalBody),
    evidenceRefs: input.evidenceRefs ?? null,
    rollbackPlan: {
      strategy: 'release_overlay_revert',
      notes: 'Rollback by deactivating this release overlay and restoring the previous active version. No source table is modified by this patch in stage 29.'
    },
    createdAt: new Date().toISOString()
  };
}

export function ensureStructuredPatchDescriptor(input: {
  proposalType: EvolutionProposalType;
  title: string;
  proposalBody: string;
  targetDescriptor?: unknown;
  evidenceRefs?: unknown;
}): Record<string, unknown> {
  const descriptor = objectOrEmpty(input.targetDescriptor);
  const structuredPatch = isStructuredPatch(descriptor.structuredPatch)
    ? descriptor.structuredPatch
    : buildStructuredPatch(input);

  return {
    ...descriptor,
    targetType: stringOrNull(descriptor.targetType) || structuredPatch.target.objectType,
    targetId: stringOrNull(descriptor.targetId),
    applyMode: 'proposal_only',
    structuredPatch,
    structuredPatchValidation: validateStructuredPatch(structuredPatch)
  };
}

export function getStructuredPatchFromProposal(proposal: EvolutionProposalRecord): EvolutionStructuredPatch | null {
  const descriptor = objectOrEmpty(proposal.target_descriptor);
  if (isStructuredPatch(descriptor.structuredPatch)) {
    return descriptor.structuredPatch;
  }
  return null;
}

export function validateStructuredPatch(value: unknown): EvolutionStructuredPatchValidation {
  const findings: EvolutionStructuredPatchValidationFinding[] = [];
  let score = 100;

  if (!isObject(value)) {
    return {
      valid: false,
      score: 0,
      findings: [{
        severity: 'critical',
        code: 'missing_structured_patch',
        message: 'Proposal must include a structured evolution patch.'
      }]
    };
  }

  const patch = value as Record<string, unknown>;
  if (patch.schemaVersion !== 'evolution.patch.v1') {
    findings.push({
      severity: 'critical',
      code: 'invalid_patch_schema_version',
      message: 'Structured patch must use schemaVersion evolution.patch.v1.'
    });
    score -= 35;
  }

  if (patch.applyMode !== 'proposal_only') {
    findings.push({
      severity: 'critical',
      code: 'patch_apply_mode_not_proposal_only',
      message: 'Structured patch must remain proposal_only in stage 29.'
    });
    score -= 45;
  }

  if (!Object.values(TYPE_TO_PATCH_KIND).includes(patch.kind as EvolutionStructuredPatchKind)) {
    findings.push({
      severity: 'critical',
      code: 'invalid_patch_kind',
      message: 'Structured patch kind is not supported.'
    });
    score -= 30;
  }

  const target = objectOrEmpty(patch.target);
  if (!stringOrNull(target.objectType)) {
    findings.push({
      severity: 'critical',
      code: 'missing_patch_target',
      message: 'Structured patch must define a target object type.'
    });
    score -= 30;
  }

  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  if (operations.length === 0) {
    findings.push({
      severity: 'critical',
      code: 'missing_patch_operations',
      message: 'Structured patch must include at least one operation.'
    });
    score -= 35;
  }

  operations.slice(0, 20).forEach((operation, index) => {
    const item = objectOrEmpty(operation);
    if (!['propose', 'merge', 'replace', 'append', 'remove', 'bind', 'unbind'].includes(String(item.op))) {
      findings.push({
        severity: 'critical',
        code: 'invalid_patch_operation',
        message: `Patch operation ${index + 1} has an unsupported op.`
      });
      score -= 15;
    }
    if (!String(item.path || '').startsWith('/')) {
      findings.push({
        severity: 'warning',
        code: 'invalid_patch_path',
        message: `Patch operation ${index + 1} should use a JSON-pointer-like path.`
      });
      score -= 8;
    }
    if (item.requiresApproval !== true) {
      findings.push({
        severity: 'critical',
        code: 'patch_operation_without_approval',
        message: `Patch operation ${index + 1} must require approval.`
      });
      score -= 20;
    }
  });

  const rollbackPlan = objectOrEmpty(patch.rollbackPlan);
  if (!stringOrNull(rollbackPlan.notes)) {
    findings.push({
      severity: 'warning',
      code: 'missing_patch_rollback_plan',
      message: 'Structured patch should include rollback notes.'
    });
    score -= 10;
  }

  const hasCritical = findings.some(finding => finding.severity === 'critical');
  return {
    valid: !hasCritical && score >= 75,
    score: clampScore(score),
    findings
  };
}

function buildSelector(descriptor: Record<string, unknown>, proposalType: EvolutionProposalType): Record<string, unknown> {
  const explicitSelector = objectOrEmpty(descriptor.selector);
  if (Object.keys(explicitSelector).length > 0) {
    return explicitSelector;
  }
  return {
    proposalType,
    targetId: stringOrNull(descriptor.targetId),
    channelId: stringOrNull(descriptor.channelId),
    agentId: stringOrNull(descriptor.agentId)
  };
}

function buildOperations(
  kind: EvolutionStructuredPatchKind,
  proposalBody: string
): EvolutionStructuredPatchOperation[] {
  const pathByKind: Record<EvolutionStructuredPatchKind, string> = {
    skill_patch: '/skill/content',
    workflow_template_patch: '/workflow/template',
    tool_policy_patch: '/toolPolicy/rules',
    knowledge_patch: '/knowledge/content',
    mcp_binding_patch: '/mcp/bindings',
    prompt_patch: '/agent/prompt'
  };

  const riskLevel = kind === 'tool_policy_patch' || kind === 'mcp_binding_patch' || kind === 'workflow_template_patch'
    ? 'high'
    : 'medium';

  return [{
    op: 'propose',
    path: pathByKind[kind],
    value: {
      format: 'markdown_proposal',
      content: proposalBody
    },
    reason: 'Generated from Hermes Evolve proposal body. Stage 29 records this as a structured patch only; stage 30 will decide runtime overlay consumption.',
    riskLevel,
    requiresApproval: true
  }];
}

function isStructuredPatch(value: unknown): value is EvolutionStructuredPatch {
  if (!isObject(value)) {
    return false;
  }
  return value.schemaVersion === 'evolution.patch.v1'
    && typeof value.patchId === 'string'
    && typeof value.kind === 'string'
    && value.applyMode === 'proposal_only'
    && isObject(value.target)
    && Array.isArray(value.operations);
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
