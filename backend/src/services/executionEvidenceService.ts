import type { AgentTraceEvent } from './agentRuntime/types';

export interface ExecutionEvidenceSummary {
  schemaVersion: 'execution.evidence.v1';
  input: {
    preview: string;
    length: number;
  };
  context: {
    keys: string[];
    taskId: string | null;
    workflowId: string | null;
    workflowName: string | null;
    nodeId: string | null;
    nodeName: string | null;
    agentId: string | null;
    agentName: string | null;
    userRole: string | null;
  };
  evidence: {
    required: string[];
    observedRefs: {
      approvalIds: string[];
      taskIds: string[];
      correlationIds: string[];
    };
    traceEventCount: number;
    toolCalls: string[];
    releaseOverlayVersionIds: string[];
  };
  hypothesis: string | null;
  riskLevel: string | null;
  plannedActions: string[];
  approvalId: string | null;
  taskId: string | null;
  verificationResult: string | null;
  traceId: string | null;
  correlationId: string | null;
  status: string | null;
  runtime: string | null;
  skillIds: string[];
  mcpServerIds: string[];
  generatedAt: string;
}

export function buildExecutionEvidenceSummary(input: {
  inputText: string;
  outputText?: string | null;
  errorMessage?: string | null;
  status?: string | null;
  context?: Record<string, unknown> | null;
  trace?: AgentTraceEvent[];
  runtimeMetadata?: Record<string, unknown> | null;
  runbook?: Record<string, unknown> | null;
  agentId?: string | null;
  agentName?: string | null;
  taskId?: string | null;
  nodeId?: string | null;
}): ExecutionEvidenceSummary {
  const context = objectOrEmpty(input.context);
  const runtimeMetadata = objectOrEmpty(input.runtimeMetadata);
  const runbook = objectOrEmpty(input.runbook);
  const trace = Array.isArray(input.trace) ? input.trace : [];
  const refs = collectExecutionRefs([
    context,
    runtimeMetadata,
    runbook,
    input.outputText || '',
    input.errorMessage || '',
    trace
  ]);
  const correlationId = stringOrNull(context.correlationId)
    || stringOrNull(runtimeMetadata.correlationId)
    || refs.correlationIds[0]
    || null;
  const taskId = input.taskId
    || stringOrNull(context.taskId)
    || stringOrNull(runtimeMetadata.taskId)
    || refs.taskIds[0]
    || null;
  const nodeId = input.nodeId || stringOrNull(context.nodeId);
  const traceId = correlationId || [taskId, nodeId].filter(Boolean).join(':') || null;

  return {
    schemaVersion: 'execution.evidence.v1',
    input: {
      preview: compactText(input.inputText, 240),
      length: input.inputText.length
    },
    context: {
      keys: Object.keys(context).sort(),
      taskId,
      workflowId: stringOrNull(context.workflowId),
      workflowName: stringOrNull(context.workflowName),
      nodeId,
      nodeName: stringOrNull(context.nodeName),
      agentId: input.agentId || stringOrNull(context.agentId),
      agentName: input.agentName || stringOrNull(runtimeMetadata.agentName),
      userRole: stringOrNull(context.userRole)
    },
    evidence: {
      required: normalizeStringList(runbook.evidenceRequired),
      observedRefs: refs,
      traceEventCount: trace.length,
      toolCalls: collectToolCalls(trace),
      releaseOverlayVersionIds: normalizeStringList(runtimeMetadata.releaseOverlayVersionIds)
        .concat(collectReleaseOverlayIds(runtimeMetadata.releaseOverlays))
    },
    hypothesis: extractHypothesis(input.outputText),
    riskLevel: stringOrNull(runbook.riskGate) || stringOrNull(context.riskGate) || stringOrNull(runtimeMetadata.riskLevel),
    plannedActions: extractPlannedActions(input.outputText, trace),
    approvalId: refs.approvalIds[0] || null,
    taskId,
    verificationResult: extractVerificationResult(input.outputText),
    traceId,
    correlationId,
    status: input.status || null,
    runtime: stringOrNull(runtimeMetadata.runtime),
    skillIds: collectIds(runtimeMetadata.skills).concat(normalizeStringList(runbook.recommendedSkillIds)),
    mcpServerIds: collectIds(runtimeMetadata.mcpServers),
    generatedAt: new Date().toISOString()
  };
}

function collectExecutionRefs(values: unknown[]): {
  approvalIds: string[];
  taskIds: string[];
  correlationIds: string[];
} {
  const refs = {
    approvalIds: new Set<string>(),
    taskIds: new Set<string>(),
    correlationIds: new Set<string>()
  };
  values.forEach(value => collectRefs(value, refs));
  return {
    approvalIds: Array.from(refs.approvalIds),
    taskIds: Array.from(refs.taskIds),
    correlationIds: Array.from(refs.correlationIds)
  };
}

function collectRefs(
  value: unknown,
  refs: { approvalIds: Set<string>; taskIds: Set<string>; correlationIds: Set<string> }
): void {
  if (!value) return;
  if (typeof value === 'string') {
    try {
      collectRefs(JSON.parse(value), refs);
    } catch {
      collectLooseRefs(value, refs);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectRefs(item, refs));
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  addRef(record.approvalId, refs.approvalIds);
  addRef(record.approval_id, refs.approvalIds);
  addRef(record.taskId, refs.taskIds);
  addRef(record.task_id, refs.taskIds);
  addRef(record.correlationId, refs.correlationIds);
  addRef(record.correlation_id, refs.correlationIds);
  Object.values(record).forEach(item => collectRefs(item, refs));
}

function collectLooseRefs(
  text: string,
  refs: { approvalIds: Set<string>; taskIds: Set<string>; correlationIds: Set<string> }
): void {
  const patterns: Array<[RegExp, Set<string>]> = [
    [/(?:approvalId|approval_id|approval)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.approvalIds],
    [/(?:taskId|task_id|task)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.taskIds],
    [/(?:correlationId|correlation_id|corr)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.correlationIds]
  ];
  patterns.forEach(([pattern, target]) => {
    Array.from(text.matchAll(pattern)).forEach(match => addRef(match[1], target));
  });
}

function addRef(value: unknown, target: Set<string>): void {
  if (typeof value === 'string' && value.length >= 8) {
    target.add(value);
  }
}

function collectToolCalls(trace: AgentTraceEvent[]): string[] {
  const calls = new Set<string>();
  trace.forEach(event => {
    const metadata = objectOrEmpty(event.metadata);
    if (typeof metadata.tool === 'string') calls.add(metadata.tool);
    normalizeStringList(metadata.toolCalls).forEach(tool => calls.add(tool));
    try {
      const content = JSON.parse(event.content) as Record<string, unknown>;
      if (typeof content.tool === 'string') calls.add(content.tool);
    } catch {
      // Trace content is often plain assistant text.
    }
  });
  return Array.from(calls);
}

function collectReleaseOverlayIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => stringOrNull(objectOrEmpty(item).versionId))
    .filter((item): item is string => Boolean(item));
}

function collectIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => typeof item === 'string' ? item : stringOrNull(objectOrEmpty(item).id))
    .filter((item): item is string => Boolean(item));
}

function extractHypothesis(outputText?: string | null): string | null {
  const line = findLabeledLine(outputText, /(hypothesis|假设|判断|根因|rca|原因)/i);
  return line ? compactText(line, 240) : compactText(firstNonEmptyLine(outputText), 240) || null;
}

function extractVerificationResult(outputText?: string | null): string | null {
  const line = findLabeledLine(outputText, /(verification|验证|校验|复核|结果)/i);
  return line ? compactText(line, 240) : null;
}

function extractPlannedActions(outputText?: string | null, trace: AgentTraceEvent[] = []): string[] {
  const actions = new Set<string>();
  const lines = String(outputText || '').split('\n');
  lines
    .filter(line => /(action|plan|步骤|动作|执行|修复|建议)/i.test(line))
    .slice(0, 5)
    .forEach(line => actions.add(compactText(line, 180)));
  collectToolCalls(trace).forEach(tool => actions.add(`tool:${tool}`));
  return Array.from(actions).filter(Boolean).slice(0, 8);
}

function findLabeledLine(outputText: string | null | undefined, pattern: RegExp): string | null {
  const lines = String(outputText || '').split('\n').map(line => line.trim()).filter(Boolean);
  return lines.find(line => pattern.test(line)) || null;
}

function firstNonEmptyLine(outputText: string | null | undefined): string {
  return String(outputText || '').split('\n').map(line => line.trim()).find(Boolean) || '';
}

function compactText(value: string, maxLength: number): string {
  const compacted = String(value || '').replace(/\s+/g, ' ').trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
