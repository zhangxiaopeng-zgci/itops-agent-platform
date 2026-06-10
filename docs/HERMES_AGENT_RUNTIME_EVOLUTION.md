# Hermes Agent Runtime Evolution Plan

## Goal

Evolve ITOps Agent Platform into a safe operations control plane that can use
Hermes or similar external agent runtimes as an upper-level reasoning brain.

The intended architecture is:

- ITOps owns assets, credentials, alert intake, workflow execution, approvals,
  command policy, audit logs, verification, rollback, reports, and deployment.
- Hermes owns diagnosis, planning, multi-step reasoning, memory, skills, and
  controlled improvement proposals.
- A runtime adapter and tool policy boundary sits between them.

In short: Hermes as brain, ITOps as control plane.

## Architecture Principles

1. Do not replace the existing Agent system in one large rewrite.
2. Keep SSH credentials and command execution inside ITOps.
3. External agents may request tool calls, but ITOps decides whether and how to
   execute them.
4. High-risk or destructive actions must go through approval, verification, and
   rollback flows.
5. Self-evolution must start as proposal generation plus evaluation plus human
   approval, not automatic production mutation.

## Target Runtime Model

Agents should support multiple runtime types:

```text
builtin      Existing server command and inspection agents
llm          Existing direct LLM prompt-based agents
custom_http  Generic external runtime adapter
hermes       Hermes runtime adapter
openclaw     OpenClaw runtime adapter
mcp          MCP-backed runtime or tool bridge
```

The agent execution path should become:

```text
executeAgentNode
  -> AgentRuntimeRegistry
    -> builtin runtime
    -> llm runtime
    -> custom HTTP runtime
    -> Hermes runtime
    -> other future runtimes
```

## Phase 0: Baseline And Fork Preparation

Objectives:

- Point the workspace at the fork repository.
- Create a feature branch for the runtime architecture work.
- Confirm the current project builds and the existing behavior is understood.
- Keep a clean baseline before making behavioral changes.

Initial branch:

```text
feat/agent-runtime-architecture
```

Baseline checks:

- Backend install/build/test status.
- Frontend install/build status.
- Docker compose build status where practical.
- Deployment notes for the test host `ubuntu@10.1.132.58`.

## Phase 1: Runtime Adapter Abstraction

Objectives:

- Introduce an `AgentRuntime` interface.
- Move current behavior into `builtin` and `llm` adapters.
- Add database fields that describe runtime configuration.
- Preserve existing agent behavior.

New backend structure:

```text
backend/src/services/agentRuntime/
  types.ts
  registry.ts
  builtinRuntime.ts
  llmRuntime.ts
```

Runtime request and result shape:

```ts
interface AgentRunRequest {
  agentId: string;
  input: string;
  context?: Record<string, unknown>;
  taskId?: string;
  nodeId?: string;
}

interface AgentRunResult {
  output: string;
  status: 'success' | 'error';
  trace?: AgentTraceEvent[];
  metadata?: Record<string, unknown>;
}
```

Database additions:

```text
agents.runtime
agents.runtime_config
agents.autonomy_level
agents.tool_policy_id
```

Compatibility mapping:

- Server command execution agents use `builtin`.
- System inspection and automatic inspection agents use `builtin`.
- Other agents use `llm`.

Acceptance criteria:

- Existing agent test endpoints still work.
- Existing workflows still execute agent nodes.
- Existing preset agents keep their current behavior.
- A migration upgrades old rows with safe default runtime values.

## Phase 2: Generic External Runtime

Objectives:

- Add `custom_http` runtime before integrating Hermes.
- Validate request/response shape, timeout behavior, errors, task logs, and
  frontend configuration without depending on Hermes availability.

Runtime config example:

```json
{
  "endpoint": "http://localhost:9001/run",
  "timeoutMs": 300000,
  "headers": {
    "Authorization": "Bearer token"
  }
}
```

External request:

```json
{
  "agent_id": "agent-id",
  "input": "task input",
  "context": {},
  "allowed_tools": [],
  "task_id": "task-id"
}
```

External response:

```json
{
  "output": "final answer",
  "status": "success",
  "trace": [],
  "metadata": {}
}
```

## Phase 3: Tool API And PolicyGuard

Objectives:

- Expose selected ITOps capabilities as controlled tools.
- Centralize command safety, approvals, audit, and risk levels.
- Prevent external agents from bypassing ITOps execution boundaries.

Initial tool set:

```text
list_servers
get_server_detail
get_server_metrics
query_alerts
get_alert_detail
search_knowledge_base
run_readonly_command
submit_remediation_for_approval
run_workflow
get_task_status
verify_remediation
```

Risk levels:

```text
read_only       automatic, audited
low_risk        automatic, strongly audited
medium_risk     approval required
high_risk       administrator approval required
destructive     denied by default
```

## Phase 4: Hermes Sidecar Integration

Objectives:

- Add Hermes runtime support through a backend adapter.
- Call an OpenAI-compatible Hermes endpoint through backend runtime_config.
- Send only scoped context and read-only allowed tools to Hermes.
- Route Hermes tool calls back through the ITOps Tool API, PolicyGuard, and
  audit logs.
- Keep API keys in environment variables, not in agent records.

Implemented adapter:

```text
backend/src/services/agentRuntime/hermesRuntime.ts
```

Runtime config example:

```json
{
  "baseUrl": "https://your-openai-compatible-endpoint/v1",
  "model": "smart-router",
  "apiKeyEnv": "HERMES_API_KEY",
  "timeoutMs": 300000,
  "maxToolRounds": 3,
  "allowedTools": [
    "list_servers",
    "query_alerts",
    "search_knowledge_base",
    "run_readonly_command"
  ]
}
```

Detailed stage notes:

```text
docs/AGENT_RUNTIME_STAGE_4_HERMES.md
```

## Phase 5: Frontend Runtime Configuration And Trace

Objectives:

- Add runtime configuration to the Agent edit experience.
- Add a Hermes connection test endpoint.
- Persist runtime metadata and trace in `agent_executions.metadata`.
- Show runtime and trace summaries in Agent execution history.

Implemented:

```text
POST /api/agents/runtime/hermes/test-connection
frontend/src/pages/Agents.tsx
docs/AGENT_RUNTIME_STAGE_5_FRONTEND_TRACE.md
```

Agent test execution now stores:

```json
{
  "runtime": "hermes",
  "runtimeMetadata": {},
  "trace": [],
  "context": {}
}
```

## Phase 6: Tool Approval Workflow

Objectives:

- Persist `approval_required` tool calls as reviewable approval records.
- Add human approve/reject APIs.
- Add a frontend approval queue.
- Execute an approved tool request through ITOps, not through the external runtime.

Implemented:

```text
backend/src/models/migrations/v008_add_tool_approvals.ts
backend/src/services/toolApi/approvalService.ts
backend/src/routes/toolApprovalRoutes.ts
frontend/src/pages/ToolApprovals.tsx
docs/AGENT_RUNTIME_STAGE_6_APPROVALS.md
```

Initial approval-only tool:

```text
submit_remediation_for_approval
```

## Phase 7: Approved Execution Tools

Objectives:

- Add real execution tools behind approval.
- Reuse the existing workflow task engine.
- Let Hermes request approved actions without direct execution rights.
- Add read-only task observation and remediation verification tools.

Implemented tools:

```text
run_workflow                 medium_risk, approval required
get_task_status              read_only
verify_remediation           read_only
```

Detailed stage notes:

```text
docs/AGENT_RUNTIME_STAGE_7_EXECUTION_TOOLS.md
```

## Phase 8: Hermes Ops Agent

Objectives:

- Provide a first end-to-end Hermes-powered operations agent.
- Let Hermes discover workflow ids through a read-only tool before requesting execution.
- Keep remediation execution behind the existing approval queue.
- Seed the agent for both fresh and existing installations without storing endpoint secrets.

Implemented additions:

```text
Hermes 诊断修复 Agent
Hermes 修复编排 Agent
Hermes 复盘进化 Agent
list_workflows
list_agent_executions
list_tool_approvals
get_correlation_trace
```

Default loop:

```text
Hermes 诊断修复 Agent
  -> read-only diagnosis
  -> list_workflows
  -> hand off remediation intent
Hermes 修复编排 Agent
  -> run_workflow approval
  -> get_task_status
  -> verify_remediation
Hermes 复盘进化 Agent
  -> get_correlation_trace / list_agent_executions / list_tool_approvals
  -> review failed or delayed executions
  -> propose prompt / workflow / policy / knowledge improvements
```

Detailed stage notes:

```text
docs/AGENT_RUNTIME_STAGE_8_HERMES_OPS_AGENT.md
```

## Phase 9: Approval, Task, Trace UX

Objectives:

- Make approved workflow execution easier to follow from the UI.
- Link tool approvals to created workflow tasks.
- Support task detail deep links.
- Show complete Agent trace timelines instead of a short preview.

Implemented additions:

```text
Tool approval -> task link
/tasks?taskId=<task-id>
Agent execution trace timeline
```

Detailed stage notes:

```text
docs/AGENT_RUNTIME_STAGE_9_APPROVAL_TASK_TRACE_UX.md
```

## Phase 10: Correlated Observability

Objectives:

- Assign a stable correlation id to each Agent runtime execution chain.
- Propagate the correlation id through Hermes trace events, tool approvals,
  workflow tasks, and audit logs.
- Add a backend query API for retrieving the full chain.
- Make Agent trace approval/task references navigable from the UI.

Implemented additions:

```text
correlationId
GET /api/correlations/:id
/tool-approvals?approvalId=<approval-id>
```

Detailed stage notes:

```text
docs/AGENT_RUNTIME_STAGE_10_CORRELATED_OBSERVABILITY.md
```

Suggested backend structure:

```text
backend/src/services/hermes/
  hermesClient.ts
  hermesRuntime.ts
  hermesToolBridge.ts
```

Recommended deployment:

```text
itops-backend
itops-frontend
hermes-runtime
```

Hermes should produce plans and tool-call requests. ITOps should execute or
reject those requests through policy.

## Operator Roadmap: Phase 11-16

Phase 10 has provided the correlation foundation. The next product line is to
turn Hermes from a hidden runtime into an operator-facing AIOps workspace.

Detailed plan:

```text
docs/AGENT_RUNTIME_STAGE_11_16_HERMES_OPERATOR_ROADMAP.md
```

Recommended sequence:

```text
Phase 11: Hermes 使用入口梳理
Phase 12: 诊断上下文增强
Phase 13: 审批与任务闭环嵌入
Phase 14: Hermes 工作流模板化
Phase 15: Trace 与会话持久化
Phase 16: 产品化和权限边界
```

Key boundary:

- Phase 11-13 primarily expose and compose existing runtime, approval, task,
  trace, and correlation capabilities.
- Phase 14 adds Hermes-enhanced workflow templates without replacing legacy
  templates.
- Phase 15 strengthens persistence and correlation evidence.
- Phase 16 closes role-based permissions, risk visibility, and product safety.

## Historical First Implementation Slice

The first implementation slice was intentionally limited to:

- Phase 0 preparation.
- Phase 1 runtime abstraction.
- Migration for runtime metadata.
- No behavior change for existing agents.
- Tests or build checks for the refactor.

That kept the runtime foundation small, reviewable, and easy to roll back. The
current active product roadmap is Phase 11-16 above.
