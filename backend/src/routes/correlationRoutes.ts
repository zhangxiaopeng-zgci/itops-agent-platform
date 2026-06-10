import { Router, Request, Response } from 'express';
import db from '../models/database';
import { requireRole } from '../middleware/auth';
import { listHermesSessionsByCorrelation } from '../services/hermesSessionService';

const router = Router();

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const correlationId = req.params.id;
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(correlationId)) {
      return res.status(400).json({ success: false, error: 'Invalid correlation id' });
    }

    const pattern = `%${escapeLike(correlationId)}%`;
    const likeSql = "LIKE ? ESCAPE '\\'";

    const agentExecutions = db.prepare(`
      SELECT *
      FROM agent_executions
      WHERE IFNULL(metadata, '') ${likeSql}
      ORDER BY created_at DESC
      LIMIT 50
    `).all(pattern).map(parseAgentExecution);

    const hermesSessions = listHermesSessionsByCorrelation(correlationId);

    const approvals = db.prepare(`
      SELECT *
      FROM tool_approvals
      WHERE correlation_id = ?
         OR input ${likeSql}
         OR IFNULL(execution_result, '') ${likeSql}
      ORDER BY requested_at DESC
      LIMIT 50
    `).all(correlationId, pattern, pattern).map(parseToolApproval);

    const tasks = db.prepare(`
      SELECT *
      FROM tasks
      WHERE IFNULL(context, '') ${likeSql}
      ORDER BY created_at DESC
      LIMIT 50
    `).all(pattern).map(parseTask);

    const auditLogs = db.prepare(`
      SELECT *
      FROM audit_logs
      WHERE IFNULL(details, '') ${likeSql}
      ORDER BY created_at DESC
      LIMIT 100
    `).all(pattern).map(parseAuditLog);

    return res.json({
      success: true,
      data: {
        correlationId,
        hermesSessions,
        agentExecutions,
        approvals,
        tasks,
        auditLogs
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch correlation chain'
    });
  }
});

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function parseAgentExecution(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    metadata: parseJson(record.metadata, {})
  };
}

function parseToolApproval(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    input: parseJson(record.input, {}),
    execution_result: parseJson(record.execution_result, null)
  };
}

function parseTask(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    context: parseJson(record.context, {}),
    node_results: parseJson(record.node_results, null),
    logs: parseJson(record.logs, null),
    metrics: parseJson(record.metrics, null),
    execution_order: parseJson(record.execution_order, null)
  };
}

function parseAuditLog(row: unknown): Record<string, unknown> {
  const record = row as Record<string, unknown>;
  return {
    ...record,
    details: parseJson(record.details, null)
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default router;
