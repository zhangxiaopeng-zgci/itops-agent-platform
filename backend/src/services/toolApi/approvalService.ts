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
  ip_address?: string | null;
}

export function createToolApproval(data: {
  toolName: string;
  input: Record<string, unknown>;
  context: ToolContext;
  decision: ToolDecision;
}): ToolApprovalRecord {
  const id = randomUUID();

  db.prepare(`
    INSERT INTO tool_approvals (
      id, tool_name, input, requester_user_id, requester_role, source,
      risk_level, reason, status, ip_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    data.toolName,
    JSON.stringify(data.input),
    data.context.userId || null,
    data.context.userRole,
    data.context.source || 'api',
    data.decision.riskLevel,
    data.decision.reason || null,
    data.context.ipAddress || null
  );

  return getToolApproval(id)!;
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
