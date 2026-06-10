# Agent Runtime Evolution - Stage 15 Trace Sessions

阶段 15 把 Hermes 从一次性页面运行推进到可审计、可复盘、可继续的会话模型。

## 实现策略

- 新增 `hermes_sessions` 表，而不是只依赖 `agent_executions.metadata`。
- Hermes 页面调用 Agent 测试接口时，如果来源是 `hermes_assistant` 或 runtime 是 `hermes`，会创建一条 session。
- Session 保存：
  - input
  - output
  - selected context
  - trace
  - extracted approval/task/correlation refs
  - correlation id
  - linked agent execution id
- 工作流执行器改用 `executeAgentRun`，继续兼容原输出字符串，同时把每个节点的 runtime metadata 和 trace 写入 `tasks.node_results[nodeId].metadata`。
- `/api/correlations/:id` 和 `get_correlation_trace` 工具都会返回同一链路下的 `hermesSessions`。

## 脱敏边界

Session 持久化会对常见敏感字段和值做脱敏：

- `apiKey` / `token` / `secret` / `password` / `privateKey` / `authorization`
- `Bearer ...`
- `sk-...`
- PEM private key block

## 操作者体验

Hermes 运维助手页面新增“最近会话”：

- 页面刷新后可以恢复最近运行结果。
- 恢复后会复用现有 trace、审批、任务和 correlation 聚合。
- 看到 correlation 后可以一键带入复盘 Agent。

## 后续

阶段 16 可以在这个基础上收口角色权限：

- viewer 只读会话和诊断。
- operator 可提交审批。
- admin 可配置 runtime 和工具边界。
