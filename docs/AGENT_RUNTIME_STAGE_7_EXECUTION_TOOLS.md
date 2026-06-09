# Agent Runtime Evolution - Stage 7 Approved Execution Tools

阶段 7 把审批后的工具执行接到真实 ITOps 执行链。

## 新增工具

| Tool | 风险 | 说明 |
| --- | --- | --- |
| `run_workflow` | `medium_risk` | 审批通过后创建 task，并调用现有 `executeWorkflow(...)`。 |
| `get_task_status` | `read_only` | 查询 task 状态、节点结果、日志和上下文。 |
| `verify_remediation` | `read_only` | 根据 task 状态和失败节点验证一次修复执行是否通过。 |

阶段 6 的 `submit_remediation_for_approval` 继续保留，用于提交修复建议进入审批队列。

## 执行路径

```text
Hermes / API
  -> run_workflow tool call
  -> PolicyGuard returns approval_required
  -> tool_approvals pending row
  -> human approves in frontend
  -> invokeTool(..., skipApproval: true)
  -> create task row
  -> executeWorkflow(taskId, workflow, input, context)
  -> get_task_status / verify_remediation observe result
```

`run_workflow` 不创建第二套执行器，而是复用现有工作流执行系统：

```text
backend/src/services/workflowExecutor.ts
```

## Hermes 工具暴露策略

Hermes 默认只收到 `read_only` 工具。

如果 Agent 的 `runtime_config.allowedTools` 显式包含审批型工具，例如：

```json
{
  "allowedTools": [
    "query_alerts",
    "search_knowledge_base",
    "submit_remediation_for_approval",
    "run_workflow",
    "get_task_status",
    "verify_remediation"
  ]
}
```

Adapter 会把这些非 destructive 工具暴露给 Hermes。但实际执行仍走 Tool API：

- `read_only` 自动执行。
- `medium_risk` 进入审批队列。
- `destructive` 仍不暴露且默认拒绝。

## 当前限制

- `run_workflow` 批准后会异步启动任务，审批接口返回的是 task id，不等待整个工作流完成。
- `verify_remediation` 目前基于 task 状态和失败节点做结构化验证，尚未接入业务指标或外部探针。
- rollback 仍未开放为工具，避免在没有完整回滚策略前引入风险。

## 下一步

阶段 8 建议创建一个端到端 Hermes 诊断/修复 Agent：

- 默认只读诊断。
- 需要执行修复时提交 `run_workflow` 审批。
- 审批后用 `get_task_status` 和 `verify_remediation` 追踪结果。
