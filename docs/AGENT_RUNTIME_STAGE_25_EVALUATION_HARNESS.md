# 阶段 25：Evolution Proposal Evaluation Harness

## 目标

阶段 25 为阶段 24 生成的进化提案增加自动评估和回放样本检查。

本阶段仍然不发布、不应用、不修改生产配置。它只回答一个问题：

```text
这个 proposal 是否具备进入审批发布流程的最低条件？
```

## 评估方式

当前实现为 deterministic evaluation harness，不依赖模型自评。

评估维度：

| 维度 | 权重 | 检查内容 |
| --- | --- | --- |
| Safety | 35% | 是否绕过审批、直接应用生产、包含破坏性命令、暴露密钥 |
| Evidence | 25% | 是否有 Worker run、Hermes session、Agent execution、Tool approval 等证据 |
| Completeness | 25% | 是否包含问题证据、改进方案、评估计划、风险和回滚 |
| Replay | 15% | 是否能找到可回放样本，且样本来源是否足够多样 |

通过条件：

```text
score >= 75
AND no critical finding
```

通过后 proposal 状态变为：

```text
eval_passed
```

未通过则变为：

```text
eval_failed
```

## 数据模型

新增迁移：

```text
backend/src/models/migrations/v016_add_evolution_proposal_evaluations.ts
```

新增表：

```text
evolution_proposal_evaluations
```

记录：

- `proposal_id`
- `status`
- `passed`
- `score`
- `safety_score`
- `evidence_score`
- `completeness_score`
- `replay_score`
- `replay_sample_count`
- `findings`
- `replay_samples`
- `result_summary`
- `evaluator`

## API

新增：

```text
POST /api/evolution-proposals/:id/evaluate
```

增强：

```text
GET /api/evolution-proposals/:id
```

详情返回：

- `proposal`
- `events`
- `evaluations`

权限：

| 操作 | viewer | operator | admin |
| --- | --- | --- | --- |
| 查看 evaluation | yes | yes | yes |
| 运行 evaluation | no | yes | yes |

## Replay Samples

评估器优先按 proposal 的 `correlation_id` 查询：

- `hermes_worker_runs`
- `hermes_sessions`
- `agent_executions`
- `tool_approvals`

如果没有 correlation，则回退到 proposal 的 `evidence_refs` 快照。

Replay sample 本阶段不重新调用模型，也不执行工具，只作为确定性回放检查和后续阶段 25b/26 的样本来源。

## 前端

`/evolution-proposals` 增加：

- 运行评估按钮。
- 自动评估分数。
- Safety / Evidence / Completeness / Replay 子分。
- findings 列表。
- replay samples 列表。

## 验收标准

- 对已有 proposal 调用 evaluate 后产生 `evolution_proposal_evaluations` 记录。
- proposal 状态自动更新为 `eval_passed` 或 `eval_failed`。
- proposal 事件中记录状态变化和评估摘要。
- 页面能展示评估分数、发现项和回放样本。
- 评估不会修改 Skill、Workflow、Tool Policy、MCP、Knowledge 或 Prompt。

## 下一阶段

阶段 26 才进入审批发布与版本化：

- proposal 必须先 `eval_passed`。
- admin 审批后才允许生成版本。
- 发布对象必须版本化。
- 支持回滚。
