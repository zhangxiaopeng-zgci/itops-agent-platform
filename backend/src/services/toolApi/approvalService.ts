import { randomUUID } from 'crypto';
import db from '../../models/database';
import { recordOperationCaseEvent } from '../operationCaseService';
import { ToolContext, ToolDecision, ToolInvocationResult } from './types';

export type ToolApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface ToolApprovalRecord {
  id: string;
  tool_name: string;
  input: Record<string, unknown>;
  requester_user_id?: string | null;
  requester_role?: string | null;
  source?: string | null;
  risk_level: string;
  reason?: string | null;
  status: ToolApprovalStatus;
  requested_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  execution_result?: ToolInvocationResult | null;
  execution_audit_id?: string | null;
  correlation_id?: string | null;
  ip_address?: string | null;
}

export interface ApprovalVerificationRequirement {
  schemaVersion: 'approval.verificationRequirement.v1';
  required: true;
  status: 'pending';
  source: 'tool_approval';
  approvalId: string;
  toolName: string;
  riskLevel: string;
  correlationId: string | null;
  taskId: string | null;
  method: 'verify_remediation' | 'manual_confirmation';
  expectedStatus: 'completed';
  validationPlan: string | null;
  createdAt: string;
}

interface RawToolApprovalRecord {
  id: string;
  tool_name: string;
  input: string;
  requester_user_id?: string | null;
  requester_role?: string | null;
  source?: string | null;
  risk_level: string;
  reason?: string | null;
  status: ToolApprovalStatus;
  requested_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  execution_result?: string | null;
  execution_audit_id?: string | null;
  correlation_id?: string | null;
  ip_address?: string | null;
}

export function createToolApproval(data: {
  toolName: string;
  input: Record<string, unknown>;
  context: ToolContext;
  decision: ToolDecision;
}): ToolApprovalRecord {
  const id = randomUUID();
  const approvalInput = {
    ...data.input,
    ...(data.decision.safetyReview ? { safetyReview: data.decision.safetyReview } : {}),
    safetyPlan: buildApprovalSafetyPlan(data.toolName, data.input, data.decision)
  };

  db.prepare(`
    INSERT INTO tool_approvals (
      id, tool_name, input, requester_user_id, requester_role, source,
      risk_level, reason, status, correlation_id, ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    data.toolName,
    JSON.stringify(approvalInput),
    data.context.userId || null,
    data.context.userRole,
    data.context.source || 'api',
    data.decision.riskLevel,
    data.decision.reason || null,
    data.context.correlationId || null,
    data.context.ipAddress || null
  );

  const approval = getToolApproval(id)!;
  recordOperationCaseEvent({
    correlationId: approval.correlation_id,
    eventType: 'tool_approval_created',
    sourceType: 'tool_approval',
    sourceId: approval.id,
    nextStatus: 'approval_pending',
    createdBy: data.context.userId || null,
    payload: {
      toolName: approval.tool_name,
      riskLevel: approval.risk_level,
      reason: approval.reason || null,
      requesterRole: approval.requester_role || null
    }
  });

  return approval;
}

export function stripApprovalMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const { safetyPlan, safetyReview, ...rest } = input;
  return rest;
}

export function attachApprovalVerificationRequirement(
  approval: ToolApprovalRecord,
  result: ToolInvocationResult
): ToolInvocationResult {
  const requirement = buildApprovalVerificationRequirement(approval, result);
  if (!requirement) {
    return result;
  }

  const resultData = result.data;
  const data = resultData && typeof resultData === 'object' && !Array.isArray(resultData)
    ? { ...(resultData as Record<string, unknown>), verificationRequirement: requirement }
    : { value: resultData ?? null, verificationRequirement: requirement };

  return {
    ...result,
    data
  };
}

export function listToolApprovals(filters: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): { approvals: ToolApprovalRecord[]; total: number } {
  const params: unknown[] = [];
  let query = 'SELECT * FROM tool_approvals WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM tool_approvals WHERE 1=1';

  if (filters.status) {
    query += ' AND status = ?';
    countQuery += ' AND status = ?';
    params.push(filters.status);
  }

  const total = (db.prepare(countQuery).get(...params) as { count: number }).count;
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
  const offset = Math.max(filters.offset || 0, 0);

  query += ' ORDER BY requested_at DESC LIMIT ? OFFSET ?';
  const rows = db.prepare(query).all(...params, limit, offset) as RawToolApprovalRecord[];

  return {
    approvals: rows.map(parseApproval),
    total
  };
}

export function getToolApproval(id: string): ToolApprovalRecord | null {
  const row = db.prepare('SELECT * FROM tool_approvals WHERE id = ?').get(id) as RawToolApprovalRecord | undefined;
  return row ? parseApproval(row) : null;
}

export function markToolApprovalRejected(id: string, reviewerId: string, comment?: string): ToolApprovalRecord {
  const existing = getToolApproval(id);
  if (!existing) {
    throw new Error('Tool approval not found');
  }
  if (existing.status !== 'pending') {
    throw new Error(`Tool approval is already ${existing.status}`);
  }

  db.prepare(`
    UPDATE tool_approvals
    SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_comment = ?
    WHERE id = ?
  `).run(reviewerId, comment || null, id);

  const approval = getToolApproval(id)!;
  recordOperationCaseEvent({
    correlationId: approval.correlation_id,
    eventType: 'tool_approval_rejected',
    sourceType: 'tool_approval',
    sourceId: approval.id,
    nextStatus: 'reviewing',
    createdBy: reviewerId,
    payload: {
      toolName: approval.tool_name,
      comment: comment || null
    }
  });

  return approval;
}

export function markToolApprovalApproved(id: string, reviewerId: string, comment?: string): ToolApprovalRecord {
  const existing = getToolApproval(id);
  if (!existing) {
    throw new Error('Tool approval not found');
  }

  const result = db.prepare(`
    UPDATE tool_approvals
    SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_comment = ?
    WHERE id = ? AND status = 'pending'
  `).run(reviewerId, comment || null, id);

  if (result.changes === 0) {
    const current = getToolApproval(id);
    throw new Error(`Tool approval is already ${current?.status || 'unavailable'}`);
  }

  const approval = getToolApproval(id)!;
  recordOperationCaseEvent({
    correlationId: approval.correlation_id,
    eventType: 'tool_approval_approved',
    sourceType: 'tool_approval',
    sourceId: approval.id,
    nextStatus: 'executing',
    createdBy: reviewerId,
    payload: {
      toolName: approval.tool_name,
      comment: comment || null
    }
  });

  return approval;
}

export function markToolApprovalExecuted(
  id: string,
  reviewerId: string,
  result: ToolInvocationResult,
  comment?: string
): ToolApprovalRecord {
  const status: ToolApprovalStatus = result.success ? 'executed' : 'failed';

  db.prepare(`
    UPDATE tool_approvals
    SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
        review_comment = ?, execution_result = ?, execution_audit_id = ?
    WHERE id = ?
  `).run(
    status,
    reviewerId,
    comment || null,
    JSON.stringify(result),
    result.auditId || null,
    id
  );

  const approval = getToolApproval(id)!;
  const taskId = extractTaskId(result);
  recordOperationCaseEvent({
    correlationId: approval.correlation_id,
    eventType: result.success ? 'tool_approval_executed' : 'tool_approval_execution_failed',
    sourceType: 'tool_approval',
    sourceId: approval.id,
    nextStatus: result.success ? (taskId ? 'executing' : 'verifying') : 'reviewing',
    createdBy: reviewerId,
    payload: {
      toolName: approval.tool_name,
      status,
      taskId,
      auditId: result.auditId || null,
      error: result.error || null
    }
  });

  return approval;
}

function parseApproval(row: RawToolApprovalRecord): ToolApprovalRecord {
  return {
    ...row,
    input: parseJson(row.input, {}),
    execution_result: row.execution_result ? parseJson(row.execution_result, null) : null
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractTaskId(result: ToolInvocationResult): string | null {
  const data = result.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const taskId = (data as Record<string, unknown>).taskId;
    return typeof taskId === 'string' ? taskId : null;
  }
  return null;
}

function buildApprovalSafetyPlan(
  toolName: string,
  input: Record<string, unknown>,
  decision: ToolDecision
): Record<string, unknown> {
  const proposedAction = readString(input.proposedAction)
    || readString(input.action)
    || readString(input.input)
    || readString(input.description)
    || `Invoke tool ${toolName}`;
  const impact = readString(input.impact)
    || readString(input.impactAnalysis)
    || buildDefaultImpact(toolName, decision.riskLevel, input);
  const rollback = readString(input.rollbackPlan)
    || readString(input.rollback)
    || buildDefaultRollback(toolName, decision.riskLevel);
  const validation = readString(input.verificationPlan)
    || readString(input.validationPlan)
    || buildDefaultValidation(toolName, input);
  const destructive = decision.riskLevel === 'destructive';

  return {
    schemaVersion: 'approval.safetyPlan.v1',
    toolName,
    riskLevel: decision.riskLevel,
    riskClass: normalizeRiskClass(decision.riskLevel),
    approvalRequired: decision.status === 'approval_required',
    verificationRequired: decision.riskLevel !== 'read_only',
    destructive,
    proposedAction,
    impact,
    rollback,
    validation,
    generatedAt: new Date().toISOString(),
    sourceFields: {
      impact: Boolean(readString(input.impact) || readString(input.impactAnalysis)),
      rollback: Boolean(readString(input.rollbackPlan) || readString(input.rollback)),
      validation: Boolean(readString(input.verificationPlan) || readString(input.validationPlan))
    }
  };
}

function buildApprovalVerificationRequirement(
  approval: ToolApprovalRecord,
  result: ToolInvocationResult
): ApprovalVerificationRequirement | null {
  if (!result.success) {
    return null;
  }

  const safetyPlan = readRecord(approval.input.safetyPlan);
  if (!safetyPlan || safetyPlan.verificationRequired !== true) {
    return null;
  }

  const taskId = findStringField(result.data, 'taskId') || findStringField(approval.input, 'taskId');
  const validationPlan = readString(safetyPlan.validation);

  return {
    schemaVersion: 'approval.verificationRequirement.v1',
    required: true,
    status: 'pending',
    source: 'tool_approval',
    approvalId: approval.id,
    toolName: approval.tool_name,
    riskLevel: approval.risk_level,
    correlationId: approval.correlation_id || null,
    taskId,
    method: taskId ? 'verify_remediation' : 'manual_confirmation',
    expectedStatus: 'completed',
    validationPlan,
    createdAt: new Date().toISOString()
  };
}

function normalizeRiskClass(riskLevel: string): string {
  if (riskLevel === 'read_only') return 'read_only';
  if (riskLevel === 'low_risk') return 'low_risk';
  if (riskLevel === 'medium_risk' || riskLevel === 'high_risk') return 'high_risk';
  return 'destructive';
}

function buildDefaultImpact(toolName: string, riskLevel: string, input: Record<string, unknown>): string {
  if (toolName === 'run_workflow') {
    return `Starts workflow ${readString(input.workflowId) || 'unknown'} and may create operational changes through workflow nodes.`;
  }
  if (toolName === 'submit_remediation_for_approval') {
    return 'Records a remediation proposal for human review without directly changing runtime state.';
  }
  return `Invokes ${toolName} with ${riskLevel} risk; reviewer must confirm target scope and blast radius before approval.`;
}

function buildDefaultRollback(toolName: string, riskLevel: string): string {
  if (riskLevel === 'read_only') {
    return 'No rollback is required for read-only actions.';
  }
  if (toolName === 'run_workflow') {
    return 'Use workflow/task logs to identify changed nodes, then run the workflow-specific rollback or manual remediation procedure before retrying.';
  }
  return 'Reviewer must ensure a manual rollback path exists before approving this action.';
}

function buildDefaultValidation(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'run_workflow') {
    return 'After execution, run verify_remediation against the created task and inspect failed nodes/logs.';
  }
  if (readString(input.taskId)) {
    return `Verify task ${readString(input.taskId)} status and failed nodes after execution.`;
  }
  return 'After execution, verify command output, metrics, logs, and operator confirmation as applicable.';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findStringField(value: unknown, key: string, depth = 0): string | null {
  if (depth > 8 || !value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, key, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = readString(record[key]);
  if (direct) {
    return direct;
  }

  for (const child of Object.values(record)) {
    const found = findStringField(child, key, depth + 1);
    if (found) return found;
  }

  return null;
}
