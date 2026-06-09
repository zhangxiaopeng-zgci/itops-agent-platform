# Agent Runtime Evolution - Stage 8 Hermes Ops Agent

阶段 8 增加一个端到端 Hermes 运维 Agent 模板，让外部大模型运行时可以完成：

```text
只读诊断 -> 选择工作流 -> 提交审批 -> 人工批准 -> 追踪任务 -> 验证修复
```

## 新增能力

### Hermes 诊断修复 Agent

平台初始化时会确保存在一个预设 Agent：

```text
Hermes 诊断修复 Agent
```

默认配置：

```json
{
  "runtime": "hermes",
  "autonomy_level": "approval_required",
  "runtime_config": {
    "model": "smart-router",
    "apiKeyEnv": "HERMES_API_KEY",
    "maxToolRounds": 5,
    "allowedTools": [
      "list_servers",
      "query_alerts",
      "search_knowledge_base",
      "list_workflows",
      "run_readonly_command",
      "submit_remediation_for_approval",
      "run_workflow",
      "get_task_status",
      "verify_remediation"
    ]
  }
}
```

`runtime_config` 不保存 API key。实际 endpoint 和 key 仍通过环境变量提供：

```text
HERMES_API_BASE
HERMES_API_KEY
```

### Hermes 修复编排 Agent

平台也会确保存在一个更专注的修复编排 Agent：

```text
Hermes 修复编排 Agent
```

它与 `Hermes 诊断修复 Agent` 的区别：

- 诊断修复 Agent 偏“发现问题、收集证据、提出方案”。
- 修复编排 Agent 偏“确认工作流、提交审批、追踪任务、验证修复”。

默认配置仍然使用 `hermes` runtime 和 `approval_required` 自主级别。它可以请求：

```text
list_workflows
submit_remediation_for_approval
run_workflow
get_task_status
verify_remediation
```

其中 `run_workflow` 仍必须进入工具审批队列。

### list_workflows 工具

阶段 7 的 `run_workflow` 需要 `workflowId`。阶段 8 增加只读工具：

```text
list_workflows
```

它返回 workflow id、名称、描述、模板标记、节点数量和节点关联 Agent 信息，让 Hermes 可以先选择工作流，再提交 `run_workflow`。

## 执行闭环

```text
Hermes 诊断修复 Agent / Hermes 修复编排 Agent
  -> query_alerts / list_servers / search_knowledge_base / run_readonly_command
  -> list_workflows
  -> run_workflow
  -> tool_approvals pending
  -> human approves
  -> executeWorkflow
  -> get_task_status
  -> verify_remediation
```

## 安全边界

- Hermes 默认不能直接执行修复。
- `run_workflow` 是 `medium_risk`，即使暴露给 Hermes，也必须经过 Tool API 审批。
- `destructive` 工具仍不暴露。
- Agent prompt 要求：不能声称修复完成，除非 `get_task_status` 或 `verify_remediation` 已证明通过。

## 使用建议

1. 配置服务端环境变量 `HERMES_API_BASE` 和 `HERMES_API_KEY`。
2. 在 Agent 管理中找到 `Hermes 诊断修复 Agent` 或 `Hermes 修复编排 Agent`。
3. 用连接测试确认 Hermes endpoint 可用。
4. 输入告警、服务器或故障现象，让 Agent 先诊断。
5. 当 Agent 返回审批单时，在工具审批页面批准或拒绝。
6. 审批执行后，用同一个 Agent 查询 task id 并验证修复结果。

## 下一步

阶段 9 建议把审批后的任务追踪做成更强的用户体验：

- 在审批记录中突出显示 task id。
- 从审批结果一键跳转到任务详情。
- Agent 执行记录中展示 tool trace 时间线。
- 可选：增加“继续追踪此审批/任务”的快捷入口。
