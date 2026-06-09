import { randomUUID } from 'crypto';
import db from '../../models/database';
import { executeCommand } from '../sshService';
import { executeWorkflow } from '../workflowExecutor';
import { evaluateReadOnlyCommand } from './policyGuard';
import { ToolContext, ToolDefinition, ToolInvocationResult } from './types';
import { WorkflowParsed } from '../../types';

const VALID_ALERT_STATUSES = new Set(['new', 'acknowledged', 'resolved']);
const VALID_ALERT_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

type ParsedTaskRow = Record<string, unknown> & {
  node_results: unknown;
  logs: unknown[];
  metrics: unknown;
  context: unknown;
  execution_order: unknown[];
  status?: unknown;
  end_time?: unknown;
};

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return Math.min(parsed, maxValue);
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

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function parseTask(row: Record<string, unknown>): ParsedTaskRow {
  return {
    ...row,
    node_results: parseJsonField(row.node_results, null),
    logs: parseJsonField(row.logs, []),
    metrics: parseJsonField(row.metrics, null),
    context: parseJsonField(row.context, null),
    execution_order: parseJsonField(row.execution_order, [])
  };
}

function toWorkflowParsed(row: Record<string, unknown>): WorkflowParsed {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    nodes: parseJsonField(row.nodes, []),
    edges: parseJsonField(row.edges, []),
    agent_configs: parseJsonField(row.agent_configs, {}),
    is_template: row.is_template as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string
  };
}

export const listServersTool: ToolDefinition = {
  name: 'list_servers',
  description: 'List managed servers without returning secrets such as passwords or private keys.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      limit: { type: 'number', minimum: 1, maximum: 200 }
    }
  },
  execute(input: Record<string, unknown>) {
    const limit = clampLimit(input.limit, 50, 200);
    let query = `
      SELECT id, name, hostname, port, username, description, tags, os, os_type, enabled,
             last_connected, ip_address, private_ip, cloud_provider, cloud_instance_id,
             created_at, updated_at
      FROM servers
    `;
    const params: unknown[] = [];

    if (typeof input.enabled === 'boolean') {
      query += ' WHERE enabled = ?';
      params.push(input.enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const servers = db.prepare(query).all(...params) as Array<{ tags?: string; [key: string]: unknown }>;
    return servers.map((server) => ({
      ...server,
      tags: parseJsonField(server.tags, [])
    }));
  }
};

export const queryAlertsTool: ToolDefinition = {
  name: 'query_alerts',
  description: 'Query recent alerts by status and severity.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: Array.from(VALID_ALERT_STATUSES) },
      severity: { type: 'string', enum: Array.from(VALID_ALERT_SEVERITIES) },
      limit: { type: 'number', minimum: 1, maximum: 100 }
    }
  },
  execute(input: Record<string, unknown>) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (typeof input.status === 'string' && VALID_ALERT_STATUSES.has(input.status)) {
      conditions.push('status = ?');
      params.push(input.status);
    }

    if (typeof input.severity === 'string' && VALID_ALERT_SEVERITIES.has(input.severity)) {
      conditions.push('severity = ?');
      params.push(input.severity);
    }

    let query = 'SELECT * FROM alerts';
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(clampLimit(input.limit, 50, 100));

    const alerts = db.prepare(query).all(...params) as Array<{ metadata?: string; [key: string]: unknown }>;
    return alerts.map((alert) => ({
      ...alert,
      metadata: parseJsonField(alert.metadata, {})
    }));
  }
};

export const searchKnowledgeBaseTool: ToolDefinition = {
  name: 'search_knowledge_base',
  description: 'Search operational knowledge base entries by query text and optional category.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string' },
      category: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 50 }
    }
  },
  execute(input: Record<string, unknown>) {
    const queryText = requireString(input, 'query');
    const params: unknown[] = [`%${queryText}%`, `%${queryText}%`];
    const conditions = ['(title LIKE ? OR content LIKE ?)'];

    if (typeof input.category === 'string' && input.category.trim().length > 0) {
      conditions.push('category = ?');
      params.push(input.category.trim());
    }

    const limit = clampLimit(input.limit, 20, 50);
    params.push(limit);

    const rows = db.prepare(`
      SELECT *
      FROM knowledge_base
      WHERE ${conditions.join(' AND ')}
      ORDER BY usage_count DESC, created_at DESC
      LIMIT ?
    `).all(...params) as Array<{ tags?: string; solutions?: string; related_alerts?: string; [key: string]: unknown }>;

    return rows.map((row) => ({
      ...row,
      tags: parseJsonField(row.tags, []),
      solutions: parseJsonField(row.solutions, []),
      related_alerts: parseJsonField(row.related_alerts, [])
    }));
  }
};

export const runReadOnlyCommandTool: ToolDefinition = {
  name: 'run_readonly_command',
  description: 'Run a command from a strict read-only allowlist against a managed server.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['serverId', 'command'],
    properties: {
      serverId: { type: 'string' },
      command: { type: 'string' },
      timeout: { type: 'number', minimum: 1000, maximum: 30000 }
    }
  },
  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolInvocationResult> {
    const serverId = requireString(input, 'serverId');
    const command = requireString(input, 'command');
    const commandDecision = evaluateReadOnlyCommand(command, context.userRole);

    if (commandDecision.status !== 'allowed') {
      return {
        success: false,
        tool: 'run_readonly_command',
        decision: commandDecision,
        error: commandDecision.reason || 'Command was not allowed'
      };
    }

    const timeout = clampLimit(input.timeout, 30000, 30000);
    const result = await executeCommand(serverId, command, {
      timeout,
      executedBy: context.userId || 'tool-api'
    });

    return {
      success: result.success,
      tool: 'run_readonly_command',
      decision: commandDecision,
      data: result,
      error: result.success ? undefined : result.error || result.stderr || 'Command failed'
    };
  }
};

export const submitRemediationForApprovalTool: ToolDefinition = {
  name: 'submit_remediation_for_approval',
  description: 'Submit a proposed remediation action for human approval before any operational change is executed.',
  riskLevel: 'medium_risk',
  inputSchema: {
    type: 'object',
    required: ['title', 'description'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      targetType: { type: 'string' },
      targetId: { type: 'string' },
      proposedAction: { type: 'string' },
      rollbackPlan: { type: 'string' },
      verificationPlan: { type: 'string' },
      riskNotes: { type: 'string' }
    }
  },
  execute(input: Record<string, unknown>, context: ToolContext) {
    return {
      approved: true,
      submittedBy: context.userId || 'unknown',
      title: requireString(input, 'title'),
      description: requireString(input, 'description'),
      targetType: typeof input.targetType === 'string' ? input.targetType : null,
      targetId: typeof input.targetId === 'string' ? input.targetId : null,
      proposedAction: typeof input.proposedAction === 'string' ? input.proposedAction : null,
      rollbackPlan: typeof input.rollbackPlan === 'string' ? input.rollbackPlan : null,
      verificationPlan: typeof input.verificationPlan === 'string' ? input.verificationPlan : null,
      riskNotes: typeof input.riskNotes === 'string' ? input.riskNotes : null,
      message: 'Remediation proposal approved. Stage 6 records approval only; execution wiring is added in the next phase.'
    };
  }
};

export const runWorkflowTool: ToolDefinition = {
  name: 'run_workflow',
  description: 'Start an ITOps workflow after human approval and return the created task id.',
  riskLevel: 'medium_risk',
  inputSchema: {
    type: 'object',
    required: ['workflowId'],
    properties: {
      workflowId: { type: 'string' },
      name: { type: 'string' },
      input: { type: 'string' },
      context: { type: 'object' }
    }
  },
  execute(input: Record<string, unknown>, context: ToolContext) {
    const workflowId = requireString(input, 'workflowId');
    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId) as Record<string, unknown> | undefined;

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const taskId = randomUUID();
    const taskContext = {
      ...(input.context && typeof input.context === 'object' && !Array.isArray(input.context) ? input.context as Record<string, unknown> : {}),
      toolInvocation: {
        source: context.source || 'api',
        approvedBy: context.userId || null,
        toolName: 'run_workflow'
      }
    };

    db.prepare(`
      INSERT INTO tasks (id, workflow_id, name, status, context)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(
      taskId,
      workflowId,
      typeof input.name === 'string' && input.name.trim() ? input.name.trim() : `Tool workflow: ${workflow.name}`,
      JSON.stringify(taskContext)
    );

    const parsedWorkflow = toWorkflowParsed(workflow);
    setImmediate(() => {
      executeWorkflow(
        taskId,
        parsedWorkflow,
        typeof input.input === 'string' ? input.input : undefined,
        taskContext
      ).catch(() => {
        // executeWorkflow already records failure state and logs details.
      });
    });

    return {
      taskId,
      workflowId,
      workflowName: workflow.name,
      status: 'pending',
      message: 'Workflow task created and execution scheduled'
    };
  }
};

export const getTaskStatusTool: ToolDefinition = {
  name: 'get_task_status',
  description: 'Read task status and execution details by task id.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { type: 'string' }
    }
  },
  execute(input: Record<string, unknown>) {
    const taskId = requireString(input, 'taskId');
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { [key: string]: unknown } | undefined;
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return parseTask(task);
  }
};

export const verifyRemediationTool: ToolDefinition = {
  name: 'verify_remediation',
  description: 'Verify a workflow-backed remediation task by checking task completion and failed nodes.',
  riskLevel: 'read_only',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { type: 'string' },
      expectedStatus: { type: 'string' }
    }
  },
  execute(input: Record<string, unknown>) {
    const taskId = requireString(input, 'taskId');
    const expectedStatus = typeof input.expectedStatus === 'string' ? input.expectedStatus : 'completed';
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { [key: string]: unknown } | undefined;
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const parsedTask = parseTask(task);
    const nodeResults = parsedTask.node_results && typeof parsedTask.node_results === 'object'
      ? parsedTask.node_results as Record<string, { status?: string; error?: string }>
      : {};
    const failedNodes = Object.entries(nodeResults)
      .filter(([, result]) => result.status === 'failed')
      .map(([nodeId, result]) => ({ nodeId, error: result.error || 'Node failed' }));
    const actualStatus = String(parsedTask.status || '');

    return {
      taskId,
      verified: actualStatus === expectedStatus && failedNodes.length === 0,
      expectedStatus,
      actualStatus,
      failedNodes,
      completedAt: parsedTask.end_time || null,
      message: actualStatus === expectedStatus && failedNodes.length === 0
        ? 'Remediation task verification passed'
        : 'Remediation task verification did not pass'
    };
  }
};

export const toolDefinitions = [
  listServersTool,
  queryAlertsTool,
  searchKnowledgeBaseTool,
  runReadOnlyCommandTool,
  submitRemediationForApprovalTool,
  runWorkflowTool,
  getTaskStatusTool,
  verifyRemediationTool
];
