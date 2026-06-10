# 阶段 23：Hermes Worker 状态与观测

## 目标

阶段 23 在阶段 22 的三 Worker Runtime 基线上，补齐控制面的 Worker registry、heartbeat 和 run history。

它解决三个问题：

- 当前三个 Worker 是否配置、健康、响应多快。
- 每次 Hermes Agent 运行到底用了哪个 Worker，是否 fallback。
- 后续自我进化需要的运行样本、失败样本和链路追踪底账。

## 数据模型

新增迁移：

```text
backend/src/models/migrations/v014_add_hermes_worker_observability.ts
```

新增表：

| 表 | 用途 | 保留策略 |
| --- | --- | --- |
| `hermes_workers` | 当前 Worker registry 和最后一次健康状态 | 长期保留，按 role upsert |
| `hermes_worker_heartbeats` | Worker 健康检查历史 | 7 天 |
| `hermes_worker_runs` | Worker 调用历史、fallback、失败记录 | 30 天 |

`hermes_worker_runs` 记录：

- `worker_role`
- `worker_url`
- `agent_id`
- `channel_id`
- `correlation_id`
- `status`: `success` / `failed` / `fallback` / `not_configured`
- `latency_ms`
- `fallback_used`
- `error`
- `created_at`

## Runtime 写入规则

```text
Agent run
  -> resolve channel type
  -> resolve Worker role
  -> POST Worker /run
      -> success: record success
      -> failed and fallback enabled: call backend direct runtime, record fallback
      -> failed and fallback disabled: record failed
      -> channel mapped but Worker URL missing: record not_configured
```

Worker 仍然不连接平台数据库。所有观测数据由 backend 控制面写入。

## API

新增或增强：

```text
GET /api/hermes-workers
GET /api/hermes-workers/definitions
GET /api/hermes-workers/runs?limit=50
GET /api/hermes-workers/heartbeats?limit=100
```

`GET /api/hermes-workers` 返回每个 Worker 的：

- 配置状态。
- 健康状态。
- 最近 health latency。
- 24 小时 run 统计。
- 最近一次 run。

## 前端入口

Hermes 控制台 Worker 区域展示：

- Worker health。
- 当前 endpoint。
- 24 小时调用量。
- fallback 次数。
- 平均延迟。
- 最近一次 run status。

## 验收标准

- 三个 Worker container 仍保持健康。
- 调用 Hermes Agent 后，`hermes_worker_runs` 有对应记录。
- 打开 Hermes 控制台能看到 run/fallback/latency 摘要。
- 停掉任意 Worker 后执行 Agent，backend fallback 成功，并记录 `fallback`。
- backend 和 Worker container 内不出现 Hermes API key 明文。

## 后续衔接

阶段 24 的 Evolution Proposal 应从这些数据中抽取样本：

- 高频失败 Worker run。
- fallback run。
- 带 `correlation_id` 的完整处理链路。
- 修复失败后的复盘输出。

阶段 25 的评估回放也应复用 `hermes_worker_runs` 和 trace，而不是重新发明运行样本来源。
