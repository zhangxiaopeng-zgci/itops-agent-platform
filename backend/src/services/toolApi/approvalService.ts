import { randomUUID } from 'crypto';
import db from '../../models/database';
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

  return getToolApproval(id)!;
}

export function stripApprovalMetadata(input: Record<string, unknown>): Record<string, unknown> {
  const { safetyPlan, ...rest } = input;
  return rest;
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

  return getToolApproval(id)!;
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

  return getToolApproval(id)!;
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

  return getToolApproval(id)!;
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
