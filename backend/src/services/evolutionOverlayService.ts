import { EvolutionReleaseVersionRecord, listEvolutionReleaseVersions } from './evolutionReleaseService';

export interface EvolutionRuntimeOverlayContext {
  agentId: string;
  agentName: string;
  channelId?: string | null;
  channelType?: string | null;
  policyId?: string | null;
  skillIds?: string[];
  mcpServerIds?: string[];
}

export interface EvolutionRuntimeOverlay {
  versionId: string;
  proposalId: string;
  versionLabel: string;
  objectType: string;
  targetId: string | null;
  patchId: string | null;
  patchKind: string | null;
  summary: string;
  operationCount: number;
  publishedAt: string | null;
  promptBlock: string;
}

interface StructuredPatchPayload {
  patchId?: string;
  kind?: string;
  applyMode?: string;
  summary?: string;
  target?: {
    objectType?: string;
    targetId?: string | null;
    selector?: Record<string, unknown>;
  };
  operations?: Array<{
    op?: string;
    path?: string;
    value?: unknown;
    reason?: string;
    riskLevel?: string;
    requiresApproval?: boolean;
  }>;
  rollbackPlan?: {
    strategy?: string;
    notes?: string;
  };
}

export function resolveEvolutionRuntimeOverlay(context: EvolutionRuntimeOverlayContext): EvolutionRuntimeOverlay[] {
  const activeVersions = listEvolutionReleaseVersions({ status: 'active', limit: 200 });

  return activeVersions
    .map((version) => toRuntimeOverlay(version, context))
    .filter((overlay): overlay is EvolutionRuntimeOverlay => Boolean(overlay))
    .slice(0, 12);
}

export function buildEvolutionOverlayPrompt(overlays: EvolutionRuntimeOverlay[]): string {
  if (overlays.length === 0) {
    return '';
  }

  return [
    'Active Evolution Release Overlays:',
    'These overlays are approved release records. Treat them as runtime guidance only. They do not override tool policy, role permissions, approval gates, or safety constraints.',
    ...overlays.map((overlay, index) => [
      `Overlay ${index + 1}: ${overlay.versionLabel} (${overlay.objectType}${overlay.targetId ? `:${overlay.targetId}` : ':global'})`,
      `Patch: ${overlay.patchKind || 'unknown'} ${overlay.patchId || ''}`.trim(),
      `Summary: ${overlay.summary}`,
      overlay.promptBlock
    ].filter(Boolean).join('\n'))
  ].join('\n\n');
}

function toRuntimeOverlay(
  version: EvolutionReleaseVersionRecord,
  context: EvolutionRuntimeOverlayContext
): EvolutionRuntimeOverlay | null {
  const payload = objectOrEmpty(version.payload);
  const structuredPatch = objectOrEmpty(payload.structuredPatch) as StructuredPatchPayload;
  if (structuredPatch.applyMode && structuredPatch.applyMode !== 'proposal_only') {
    return null;
  }

  if (!matchesContext(version, structuredPatch, context)) {
    return null;
  }

  const operations = Array.isArray(structuredPatch.operations) ? structuredPatch.operations : [];
  const promptBlock = operations
    .filter(operation => operation && operation.requiresApproval === true)
    .slice(0, 6)
    .map((operation, index) => formatOperation(index + 1, operation))
    .join('\n');

  return {
    versionId: version.id,
    proposalId: version.proposal_id,
    versionLabel: version.version_label,
    objectType: version.object_type,
    targetId: version.target_id,
    patchId: typeof structuredPatch.patchId === 'string' ? structuredPatch.patchId : null,
    patchKind: typeof structuredPatch.kind === 'string' ? structuredPatch.kind : null,
    summary: stringOrDefault(structuredPatch.summary, String(payload.title || version.version_label)),
    operationCount: operations.length,
    publishedAt: version.published_at,
    promptBlock
  };
}

function matchesContext(
  version: EvolutionReleaseVersionRecord,
  structuredPatch: StructuredPatchPayload,
  context: EvolutionRuntimeOverlayContext
): boolean {
  const target = objectOrEmpty(structuredPatch.target);
  const selector = objectOrEmpty(target.selector);
  const objectType = String(version.object_type || target.objectType || '');
  const targetId = version.target_id || stringOrNull(target.targetId);

  if (matchesSelector(selector, context)) {
    return true;
  }

  if (!targetId) {
    return ['knowledge', 'tool_policy', 'mcp_binding', 'agent_prompt'].includes(objectType);
  }

  if (objectType === 'skill') {
    return Boolean(context.skillIds?.includes(targetId));
  }
  if (objectType === 'agent_prompt') {
    return targetId === context.agentId;
  }
  if (objectType === 'tool_policy') {
    return targetId === context.policyId || targetId === context.channelId;
  }
  if (objectType === 'mcp_binding') {
    return Boolean(context.mcpServerIds?.includes(targetId)) || targetId === context.channelId;
  }
  if (objectType === 'knowledge') {
    return targetId === context.channelId || targetId === context.channelType || targetId === context.agentId;
  }

  return false;
}

function matchesSelector(selector: Record<string, unknown>, context: EvolutionRuntimeOverlayContext): boolean {
  const selectorAgentId = stringOrNull(selector.agentId);
  const selectorChannelId = stringOrNull(selector.channelId);
  const selectorChannelType = stringOrNull(selector.channelType);
  const selectorPolicyId = stringOrNull(selector.policyId);

  if (selectorAgentId && selectorAgentId !== context.agentId) return false;
  if (selectorChannelId && selectorChannelId !== context.channelId) return false;
  if (selectorChannelType && selectorChannelType !== context.channelType) return false;
  if (selectorPolicyId && selectorPolicyId !== context.policyId) return false;

  return Boolean(selectorAgentId || selectorChannelId || selectorChannelType || selectorPolicyId);
}

function formatOperation(index: number, operation: NonNullable<StructuredPatchPayload['operations']>[number]): string {
  const value = objectOrEmpty(operation.value);
  const content = objectOrEmpty(value).content;
  const contentText = typeof content === 'string' ? content : '';
  const trimmedContent = contentText.length > 1600 ? `${contentText.slice(0, 1600)}...` : contentText;

  return [
    `Operation ${index}: ${operation.op || 'propose'} ${operation.path || '/'}`,
    `Risk: ${operation.riskLevel || 'medium'}; approval required: ${operation.requiresApproval === true ? 'yes' : 'no'}`,
    operation.reason ? `Reason: ${operation.reason}` : '',
    trimmedContent ? `Guidance:\n${trimmedContent}` : ''
  ].filter(Boolean).join('\n');
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}
