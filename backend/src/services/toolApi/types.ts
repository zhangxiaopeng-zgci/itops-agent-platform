export type ToolRiskLevel = 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk' | 'destructive';

export type ToolDecisionStatus = 'allowed' | 'approval_required' | 'denied';

export interface ToolDecision {
  status: ToolDecisionStatus;
  reason?: string;
  riskLevel: ToolRiskLevel;
}

export interface ToolContext {
  userId?: string;
  userRole: string;
  ipAddress?: string;
  source?: 'api' | 'agent_runtime';
}

export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema?: Record<string, unknown>;
  execute(input: TInput, context: ToolContext): Promise<TOutput> | TOutput;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema?: Record<string, unknown>;
}

export interface ToolInvocationResult<TOutput = unknown> {
  success: boolean;
  tool: string;
  decision: ToolDecision;
  data?: TOutput;
  error?: string;
  auditId?: string | null;
  approvalId?: string | null;
}

export interface ToolInvocationOptions {
  skipApproval?: boolean;
}
