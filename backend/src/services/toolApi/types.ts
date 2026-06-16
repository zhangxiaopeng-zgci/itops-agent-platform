export type ToolRiskLevel = 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk' | 'destructive';

export type ToolDecisionStatus = 'allowed' | 'approval_required' | 'denied';

export interface ToolSafetyReview {
  schemaVersion: 'tool.safetyReview.v1';
  status: 'safe' | 'requires_approval' | 'blocked';
  riskClass: ToolRiskLevel;
  matchedPolicies: Array<{
    policy: string;
    severity: 'high_risk' | 'destructive';
    field: string;
    excerpt: string;
  }>;
  explanation: string;
  operatorGuidance: string;
  generatedAt: string;
}

export interface ToolDecision {
  status: ToolDecisionStatus;
  reason?: string;
  riskLevel: ToolRiskLevel;
  safetyReview?: ToolSafetyReview;
}

export interface ToolContext {
  userId?: string;
  userRole: string;
  ipAddress?: string;
  source?: 'api' | 'agent_runtime';
  correlationId?: string;
  agentExecutionId?: string;
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
