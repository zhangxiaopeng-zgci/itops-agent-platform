# 阶段 22-27：Hermes 三实例 Runtime 化与受控自我进化

## 总体目标

将 Hermes 从 backend 内部 Runtime Adapter 升级为三个真实运行的 Hermes Worker 实例，并在此基础上逐步建立受控自我进化闭环。

目标不是让模型绕过平台自己修改生产环境，而是形成：

```text
Trace / Task / Approval / Audit
  -> Hermes Evolve 分析
  -> Evolution Proposal
  -> 自动评估
  -> 人工审批
  -> 版本化发布
  -> 可回滚
```

## 目标架构

```text
frontend
  -> backend 控制面
      -> Channel / Skill / MCP / Tool Policy / Approval / Trace
      -> Hermes Runtime Router
          -> hermes-diagnose worker
          -> hermes-remediate worker
          -> hermes-evolve worker
```

Worker 负责 LLM 推理调用，backend 继续负责：

- 工具执行。
- 审批。
- 审计。
- Trace。
- Task / Workflow。
- Skill / MCP / Channel 管理。

## 三个 Hermes Worker

| Worker | Role | Channel Type | 边界 |
| --- | --- | --- | --- |
| `hermes-diagnose` | `diagnose` | `diagnose` | 只读诊断、证据收集、风险判断 |
| `hermes-remediate` | `remediate` | `remediate` | 修复编排、审批提交、任务跟踪 |
| `hermes-evolve` | `evolve` | `review` | 复盘分析、改进 proposal，不直接改生产 |

阶段 22 的 Worker 是轻量 Runtime Worker：

```text
GET  /health
GET  /capabilities
POST /run
```

它不连接平台数据库，不直接执行 Tool API，只调用外部 OpenAI-compatible endpoint。工具调用仍由 backend 捕获并执行。

## 阶段 22：三 Worker Runtime 基线

工作项：

- 新增 `backend/src/hermesWorker.ts`。
- 三个容器使用同一份 backend build，不同环境变量区分角色：
  - `HERMES_WORKER_ROLE=diagnose`
  - `HERMES_WORKER_ROLE=remediate`
  - `HERMES_WORKER_ROLE=evolve`
- backend Runtime Router 根据 Channel type 选择 Worker：
  - `diagnose` -> `HERMES_WORKER_DIAGNOSE_URL`
  - `remediate` -> `HERMES_WORKER_REMEDIATE_URL`
  - `review` -> `HERMES_WORKER_EVOLVE_URL`
- Worker 不可用时 fallback 到 backend 内置 Hermes Runtime。
- Hermes 控制台展示 Worker 健康状态。

验收标准：

- 远端真实运行三个 Worker container。
- `/api/hermes-workers` 能看到三个 Worker 健康状态。
- Hermes Agent 执行 metadata 能看到 `workerRole` 和 `workerUrl`。
- 停掉 Worker 后 backend fallback 仍可执行。

## 阶段 23：Worker 状态与观测

状态：已进入实现收口。

新增：

```text
hermes_workers
hermes_worker_heartbeats
hermes_worker_runs
```

记录：

- role
- endpoint
- health
- model
- skill bundle version
- mcp bundle version
- latency / error rate
- last run

控制面补充：

- `/api/hermes-workers` 返回健康状态、24 小时调用统计和最近一次 run。
- `/api/hermes-workers/runs` 返回 Worker run history。
- `/api/hermes-workers/heartbeats` 返回 Worker heartbeat history。
- Hermes 控制台展示三个 Worker 的 run/fallback/latency 摘要。

边界：

- 观测数据只由 backend 持久化，Worker 仍不连接平台数据库。
- heartbeat 保留 7 天。
- run history 保留 30 天。
- fallback 也必须记录，避免“看起来成功但实际绕过 Worker”的盲区。

## 阶段 24：Evolution Proposal

状态：已进入实现收口。

新增：

```text
evolution_proposals
```

类型：

- `skill_update`
- `workflow_template_update`
- `tool_policy_update`
- `knowledge_update`
- `mcp_binding_update`
- `prompt_update`

`hermes-evolve` 只能生成 proposal，不能直接应用。

补充：

- proposal 生成入口为 `/api/evolution-proposals/generate`。
- proposal 证据来自 Worker run、Hermes session、Agent execution 和 Tool approval。
- proposal 状态流转保存到 `evolution_proposal_events`。
- `/evolution-proposals` 提供操作者入口。
- admin 才能批准 proposal；批准仍不等于发布。

## 阶段 25：自动评估与回放

状态：已进入实现收口。

新增 eval harness：

- 从历史 trace 抽样。
- 对比旧 Skill 和新 Skill 的输出。
- 检查安全规则。
- 检查审批信息完整度。
- 计算 score。

只有评估通过的 proposal 才能进入审批。

当前阶段 25 基线实现：

- 新增 `evolution_proposal_evaluations`。
- 新增 `POST /api/evolution-proposals/:id/evaluate`。
- 使用 deterministic evaluation harness，先不依赖模型自评。
- 评分维度为 Safety、Evidence、Completeness、Replay。
- `score >= 75` 且无 critical finding 时自动回写 `eval_passed`，否则回写 `eval_failed`。
- `/evolution-proposals` 页面展示分数、finding 和 replay samples。

## 阶段 26：审批发布与版本化

状态：已进入实现收口。

版本化对象：

```text
skill_versions
workflow_template_versions
channel_capability_versions
```

发布流程：

```text
proposal -> eval passed -> admin approval -> publish -> channel uses new version
```

必须支持回滚。

当前阶段 26 基线实现：

- 新增 `evolution_release_versions` 和 `evolution_release_events`。
- 新增发布 API：`POST /api/evolution-proposals/:id/publish`。
- 新增版本查询和回滚 API。
- 发布前置条件为 `eval_passed` 且 admin 已将 proposal 标记为 `approved`。
- 发布生成 active version，同目标旧版本变为 `superseded`。
- 回滚 active version 时恢复 previous version。
- 当前版本 payload 是可审计 release record，不直接修改生产运行对象。

## 阶段 27：持续进化任务

定时触发：

- 每日复盘最近 24 小时。
- 每周生成优化报告。
- 失败任务进入复盘队列。
- 被拒绝审批进入复盘队列。
- 高价值 proposal 自动进入待审批。

## 安全原则

- 自我进化不等于自动上线。
- Worker 不直接修改生产。
- Evolve 只生成 proposal。
- 发布必须经过评估和审批。
- 所有变更必须版本化、可审计、可回滚。
