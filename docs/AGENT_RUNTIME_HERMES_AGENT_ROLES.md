# Hermes Agent Roles

当前平台已经落地三个 Hermes 角色：

```text
Hermes 诊断修复 Agent
Hermes 修复编排 Agent
Hermes 复盘进化 Agent
```

## Hermes 诊断修复 Agent

定位：

- 告警理解
- 上下文收集
- 只读诊断
- 知识库检索
- 修复方案建议

它可以提交审批型动作，但默认更适合先完成事实收集和方案生成。

## Hermes 修复编排 Agent

定位：

- 确认 workflow id
- 提交 `run_workflow` 审批
- 输出 approval id / task id / correlation id
- 追踪任务状态
- 调用 `verify_remediation` 验证结果

它不能绕过审批，也不能直接执行 destructive 操作。

## Hermes 复盘进化 Agent

定位：

- 读取 persisted trace
- 读取 tool approval 记录
- 读取 correlation chain
- 复盘任务执行和验证结果
- 生成 prompt / tool / workflow / policy / knowledge proposal

它只负责复盘 trace、失败任务、审批反馈和执行结果，生成改进 proposal。它不直接改生产配置，也不直接执行修复。

允许工具：

```text
list_agent_executions
list_tool_approvals
get_correlation_trace
get_task_status
verify_remediation
list_workflows
search_knowledge_base
```

明确不允许：

```text
run_workflow
submit_remediation_for_approval
```
