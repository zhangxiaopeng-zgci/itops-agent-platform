# Hermes Agent Roles

当前平台已经落地两个 Hermes 角色：

```text
Hermes 诊断修复 Agent
Hermes 修复编排 Agent
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

## 目标三角色形态

后续建议补第三个 Hermes 角色：

```text
Hermes Evolution / Reviewer Agent
```

它只负责复盘 trace、失败任务、审批反馈和执行结果，生成改进 proposal。它不直接改生产配置，也不直接执行修复。
