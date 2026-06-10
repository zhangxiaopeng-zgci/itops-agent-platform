# 阶段 27：持续进化任务

## 目标

阶段 27 将 Hermes 自我进化闭环从手动操作推进到持续运行。

它不会自动发布，也不会自动修改生产对象。它只负责：

- 定时复盘。
- 失败和拒绝审批入队。
- 自动生成受控 proposal。
- 自动评估 proposal。
- 对高价值 proposal 自动推进到 `approval_pending`。

发布仍然必须经过 admin 审批和阶段 26 的版本化发布。

## 数据模型

新增迁移：

```text
backend/src/models/migrations/v018_add_evolution_continuous_tasks.ts
```

新增表：

| 表 | 用途 |
| --- | --- |
| `evolution_continuous_tasks` | 持续进化任务定义和 cron |
| `evolution_task_runs` | 每次任务运行记录 |
| `evolution_review_queue` | 失败、fallback、拒绝审批等待复盘样本 |

## 默认任务

| Kind | Schedule | 作用 |
| --- | --- | --- |
| `daily_review` | `0 2 * * *` | 每日复盘最近 24 小时并生成受控 proposal |
| `weekly_report` | `0 4 * * 0` | 每周复盘最近 7 天并生成更高层优化 proposal |
| `failure_review` | `30 * * * *` | 将失败 worker run、fallback、失败 Agent execution 入队 |
| `rejected_approval_review` | `45 * * * *` | 将被拒绝的 tool approval 入队 |
| `proposal_promotion` | `*/30 * * * *` | 将高分 eval_passed proposal 推进到 `approval_pending` |

## 自动推进边界

持续任务最多只能自动推进到：

```text
approval_pending
```

它不能：

- 自动 approve。
- 自动 publish。
- 自动 rollback。
- 自动修改 Skill / Workflow / Tool Policy / MCP / Knowledge / Prompt。

## API

新增：

```text
GET  /api/evolution-tasks
GET  /api/evolution-tasks/runs
GET  /api/evolution-tasks/queue
PUT  /api/evolution-tasks/:id
POST /api/evolution-tasks/:id/run
```

权限：

| 操作 | viewer | operator | admin |
| --- | --- | --- | --- |
| 查看任务/运行/队列 | yes | yes | yes |
| 手动运行任务 | no | yes | yes |
| 修改任务 schedule/enabled | no | no | yes |

## 前端

`/evolution-proposals` 增加持续进化任务面板：

- 查看默认持续任务。
- 查看最近运行记录。
- 查看复盘队列。
- 手动运行任务。

## 验收标准

- backend 启动时自动调度 enabled 的持续进化任务。
- 手动运行 `failure_review` 能产生 `evolution_task_runs`。
- 如果存在失败/fallback 样本，会写入 `evolution_review_queue`。
- 手动运行 `proposal_promotion` 只会把高价值 `eval_passed` proposal 推进到 `approval_pending`。
- 不会自动 approve 或 publish。

## 后续方向

阶段 27 之后可以继续做：

- 26b：结构化 patch，让 proposal 从文本变成可验证变更集。
- 27b：review queue 到 proposal 的批量转化。
- 27c：将 release active version 安全注入 Channel runtime，但仍保持回滚能力。
