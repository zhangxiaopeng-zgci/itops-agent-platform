# Agent Runtime Evolution - Stage 10 Correlated Observability

阶段 10 把阶段 4-9 的能力串成可查询的观测链路：

```text
agent execution
  -> Hermes tool call
  -> tool approval
  -> workflow task
  -> audit log
```

## 新增能力

### Correlation ID

Agent 测试执行会生成或沿用 `correlationId`，并写入：

- `agent_executions.metadata.correlationId`
- Hermes trace event metadata
- Hermes `tool_call_result` 内容
- Tool API context
- `tool_approvals.correlation_id`
- workflow task `context.correlationId`
- audit log `details.correlationId`

### 查询 API

新增链路查询接口：

```text
GET /api/correlations/:id
```

返回：

- agent executions
- tool approvals
- workflow tasks
- audit logs

### 前端跳转

Agent trace 时间线支持：

- 展示 correlation id。
- 展示 tool call id。
- 从 approval badge 跳转到 `/tool-approvals?approvalId=<approval-id>`。
- 从 task badge 跳转到 `/tasks?taskId=<task-id>`。

工具审批页支持 `approvalId` 深链，可直接打开指定审批记录。

## 设计边界

- 不改变审批策略。
- 不新增自动执行权限。
- 不在前端暴露 Hermes API key。
- 当前阶段先提供可查询链路和深链跳转，不引入新的复杂可视化页面。

## 后续增强

- 将 correlation 查询做成单页链路视图。
- 为普通 workflow/manual task 也生成 correlation id。
- 在审计日志页面增加 correlation 筛选。
- 为 remediation execution 和 alert webhook 复用同一 correlation 模型。
