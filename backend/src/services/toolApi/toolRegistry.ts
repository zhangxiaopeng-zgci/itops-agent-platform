import { createAuditLog } from '../auditService';
import { evaluateToolPolicy } from './policyGuard';
import { toolDefinitions } from './tools';
import { ToolContext, ToolDefinition, ToolDescriptor, ToolInvocationResult } from './types';

const tools = new Map<string, ToolDefinition>();

for (const tool of toolDefinitions) {
  tools.set(tool.name, tool);
}

function describeTool(tool: ToolDefinition): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    riskLevel: tool.riskLevel,
    inputSchema: tool.inputSchema
  };
}

function auditToolInvocation(
  context: ToolContext,
  toolName: string,
  result: Omit<ToolInvocationResult, 'auditId'>,
  input: unknown
): string | null {
  return createAuditLog({
    user_id: context.userId,
    action: 'tool.invoke',
    resource_type: 'tool',
    resource_id: toolName,
    ip_address: context.ipAddress,
    details: {
      source: context.source || 'api',
      input,
      decision: result.decision,
      success: result.success,
      error: result.error
    }
  });
}

export function listTools(): ToolDescriptor[] {
  return Array.from(tools.values()).map(describeTool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export async function invokeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolInvocationResult> {
  const tool = getTool(name);
  if (!tool) {
    return {
      success: false,
      tool: name,
      decision: { status: 'denied', riskLevel: 'read_only', reason: 'Tool not found' },
      error: 'Tool not found'
    };
  }

  const decision = evaluateToolPolicy(tool, context);
  if (decision.status !== 'allowed') {
    const result: Omit<ToolInvocationResult, 'auditId'> = {
      success: false,
      tool: name,
      decision,
      error: decision.reason || 'Tool execution was not allowed'
    };
    return { ...result, auditId: auditToolInvocation(context, name, result, input) };
  }

  try {
    const output = await tool.execute(input, context);
    const normalized: Omit<ToolInvocationResult, 'auditId'> = isToolInvocationResult(output)
      ? output
      : {
        success: true,
        tool: name,
        decision,
        data: output
      };

    const result = {
      ...normalized,
      tool: name,
      decision: normalized.decision || decision
    };

    return { ...result, auditId: auditToolInvocation(context, name, result, input) };
  } catch (error) {
    const result: Omit<ToolInvocationResult, 'auditId'> = {
      success: false,
      tool: name,
      decision,
      error: error instanceof Error ? error.message : String(error)
    };
    return { ...result, auditId: auditToolInvocation(context, name, result, input) };
  }
}

function isToolInvocationResult(value: unknown): value is ToolInvocationResult {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'success' in value &&
    'tool' in value &&
    'decision' in value
  );
}
