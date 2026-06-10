export type AgentRuntimeType = 'builtin' | 'llm' | 'custom_http' | 'hermes' | 'openclaw' | 'mcp';

export type AgentAutonomyLevel = 'suggest' | 'read_only' | 'approval_required' | 'auto';

export interface AgentTraceEvent {
  type: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunRequest {
  agentId: string;
  input: string;
  context?: Record<string, unknown>;
  taskId?: string;
  nodeId?: string;
}

export interface AgentRunResult {
  output: string;
  status: 'success' | 'error';
  trace?: AgentTraceEvent[];
  metadata?: Record<string, unknown>;
}

export interface AgentRuntime {
  type: AgentRuntimeType;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export interface RuntimeAgentRecord {
  id: string;
  name: string;
  system_prompt?: string;
  runtime?: AgentRuntimeType | string | null;
  runtime_config?: string | null;
  autonomy_level?: AgentAutonomyLevel | string | null;
  tool_policy_id?: string | null;
  channel_id?: string | null;
}
