# 阶段 24：Evolution Proposal

## 目标

阶段 24 将“自我进化”从口头能力落成受控的提案机制。

Hermes Evolve 可以读取近期运行证据，生成改进 proposal，但不能直接修改 Skill、Workflow、Tool Policy、MCP 绑定、知识库或 Agent Prompt。

## 边界

本阶段只做：

- 生成 proposal。
- 保存 evidence snapshot。
- 保存状态流转事件。
- 支持人工推进到评估、待审批、批准、拒绝或归档。

本阶段不做：

- 自动评估回放。
- 自动发布。
- 修改生产配置。
- 回滚执行。

这些留给阶段 25 和阶段 26。

## 数据模型

新增迁移：

```text
backend/src/models/migrations/v015_add_evolution_proposals.ts
```

新增表：

| 表 | 用途 |
| --- | --- |
| `evolution_proposals` | 保存受控进化提案 |
| `evolution_proposal_events` | 保存提案状态流转事件 |

Proposal 类型：

- `skill_update`
- `workflow_template_update`
- `tool_policy_update`
- `knowledge_update`
- `mcp_binding_update`
- `prompt_update`

Proposal 状态：

- `draft`
- `generated`
- `eval_pending`
- `eval_passed`
- `eval_failed`
- `approval_pending`
- `approved`
- `rejected`
- `archived`

## 证据来源

Hermes Evolve 生成 proposal 时，backend 自动收集：

- `hermes_worker_runs`
- `hermes_sessions`
- `agent_executions`
- `tool_approvals`

可以按 `correlationId` 收敛到单条链路，也可以按最近 N 小时汇总。

## API

新增：

```text
GET  /api/evolution-proposals
GET  /api/evolution-proposals/:id
POST /api/evolution-proposals
POST /api/evolution-proposals/generate
POST /api/evolution-proposals/:id/status
```

权限：

| 操作 | viewer | operator | admin |
| --- | --- | --- | --- |
| 查看 proposal | yes | yes | yes |
| 手工创建 proposal | no | yes | yes |
| Hermes Evolve 生成 proposal | no | yes | yes |
| 推进评估/待审批/拒绝/归档 | no | yes | yes |
| 批准 proposal | no | no | yes |

## 前端入口

新增页面：

```text
/evolution-proposals
```

导航位置：

```text
自动化执行 -> 进化提案
```

页面能力：

- 选择 proposal 类型、优先级、证据窗口和 correlationId。
- 调用 Hermes Evolve 生成 proposal。
- 查看 proposal 内容、证据快照、关联 execution/session/correlation。
- 查看状态事件。
- 人工推进状态。

## 验收标准

- 生成 proposal 后，`evolution_proposals` 有记录。
- 生成链路通过 `Hermes 复盘进化 Agent` 和 `hermes-evolve` Worker。
- 生成结果同时保存 `agent_execution_id` 和 `hermes_session_id`。
- 页面能展示 proposal、证据快照和事件。
- operator 不能批准 proposal，admin 可以批准。
- 没有任何接口会自动应用 proposal。

## 下一阶段

阶段 25 将围绕 proposal 建立 eval harness：

- 从历史 trace 抽样回放。
- 检查安全规则。
- 对比旧/新 Skill 或 Prompt 输出。
- 计算评估结果。
- 只有评估通过的 proposal 才能进入阶段 26 发布审批。
