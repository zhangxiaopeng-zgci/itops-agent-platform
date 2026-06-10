# 阶段 26：审批发布与版本化

## 目标

阶段 26 将 `eval_passed` 的 Evolution Proposal 推进到受控发布：

```text
proposal -> eval_passed -> admin approved -> publish version -> rollbackable
```

本阶段建立发布账本、活跃版本和回滚能力。它不会把非结构化 proposal 文本直接写入 Skill、Workflow、Tool Policy、MCP、Knowledge 或 Prompt 的生产表。

## 发布边界

发布前置条件：

- proposal 状态必须是 `approved`。
- proposal 最新 evaluation 必须 `passed`。
- 发布操作必须由 `admin` 执行。

发布结果：

- 创建 `evolution_release_versions` 记录。
- 同一 `object_type + target_id` 旧 active 版本变为 `superseded`。
- 新版本变为 `active`。
- proposal 状态回写为 `published`。

回滚结果：

- 当前 active 版本变为 `rolled_back`。
- 如果存在 previous version，则 previous version 恢复为 `active`。
- 所有操作写入 `evolution_release_events`。

## 数据模型

新增迁移：

```text
backend/src/models/migrations/v017_add_evolution_release_versions.ts
```

新增表：

| 表 | 用途 |
| --- | --- |
| `evolution_release_versions` | 记录 proposal 发布版本、目标对象、payload、前序版本和状态 |
| `evolution_release_events` | 记录 publish、supersede、rollback、restore 等事件 |

版本状态：

- `active`
- `superseded`
- `rolled_back`

## API

新增：

```text
POST /api/evolution-proposals/:id/publish
GET  /api/evolution-proposals/releases/versions
GET  /api/evolution-proposals/releases/versions/:id/events
POST /api/evolution-proposals/releases/versions/:id/rollback
```

增强：

```text
GET /api/evolution-proposals/:id
```

详情返回：

- `proposal`
- `events`
- `evaluations`
- `releases`

## 前端

`/evolution-proposals` 增加：

- 发布版本按钮。
- 发布版本列表。
- active / superseded / rolled_back 状态。
- active 版本回滚按钮。

## 当前限制

当前发布 payload 保存：

- proposal body
- target descriptor
- evidence refs
- eval summary
- risk notes
- correlation id

它是可审计的版本化 release record，但还不自动修改运行对象。

下一步如果要让 runtime 消费版本，需要阶段 27 或 26b 继续做结构化 patch：

- Skill patch：明确 `skillId`、`content`、`requiredTools`、`riskNotes`。
- Workflow patch：明确 workflow template nodes/edges。
- Tool policy patch：明确工具白名单和风险级别。
- Channel capability patch：明确 channel bindings。

## 验收标准

- 未评估通过的 proposal 不能发布。
- 未 admin approve 的 proposal 不能发布。
- admin publish 后生成 active version。
- 同目标再次 publish 会 supersede 旧 active version。
- rollback active version 后，版本状态变为 `rolled_back`，前序版本恢复 active。
- 发布和回滚不会直接修改生产运行对象。
