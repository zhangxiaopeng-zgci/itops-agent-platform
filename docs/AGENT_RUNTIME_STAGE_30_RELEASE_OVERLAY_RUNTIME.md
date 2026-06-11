# 阶段 30：Release Overlay Runtime 注入

## 目标

阶段 30 让已发布、已审批、可回滚的 `structuredPatch` 从 release ledger 进入 Hermes 运行态。

关键边界：

- 不改写 Skill / Workflow / MCP / Policy / Prompt 源表。
- 不让 Hermes Worker 直接访问数据库。
- 不绕过 tool policy、角色权限和审批。
- 不自动执行生产动作。

运行态只读取 active release，并把它作为 overlay guidance 注入 Hermes system prompt。

```text
active release
  -> structuredPatch
  -> overlay resolver
  -> Hermes system prompt
  -> trace / metadata
```

## 新增服务

新增：

```text
backend/src/services/evolutionOverlayService.ts
```

职责：

- 查询 active release versions。
- 从 release payload 中读取 `structuredPatch`。
- 根据当前 Agent / Channel / Skill / MCP / Policy 解析适用 overlay。
- 生成 Hermes Runtime 可注入的 prompt block。
- 生成 metadata / trace 可审计摘要。

## Overlay 匹配规则

运行态上下文：

```ts
{
  agentId,
  agentName,
  channelId,
  channelType,
  policyId,
  skillIds,
  mcpServerIds
}
```

匹配规则：

| objectType | 匹配方式 |
| --- | --- |
| `skill` | `targetId` 命中当前 Channel 启用的 Skill |
| `agent_prompt` | `targetId` 命中当前 Agent |
| `tool_policy` | `targetId` 命中当前 policyId 或 channelId |
| `mcp_binding` | `targetId` 命中当前 MCP Server 或 channelId |
| `knowledge` | `targetId` 命中 channelId / channelType / agentId，或 global |

`structuredPatch.target.selector` 可以显式指定：

- `agentId`
- `channelId`
- `channelType`
- `policyId`

显式 selector 命中时优先视为适用。

## Runtime 注入

Hermes Runtime 在构造 messages 前解析 overlay：

```text
resolveEvolutionRuntimeOverlay(...)
buildEvolutionOverlayPrompt(...)
```

注入到 system prompt 的内容包含：

- release version label
- object type / target
- patch kind / patch id
- summary
- operations
- risk level
- approval required
- markdown proposal guidance

注入提示明确说明：

```text
These overlays are approved release records.
Treat them as runtime guidance only.
They do not override tool policy, role permissions, approval gates, or safety constraints.
```

## 审计记录

每次 Hermes Runtime 执行都会在 trace 中写入：

```text
release_overlay_resolved
```

metadata 包含：

```json
{
  "releaseOverlayVersionIds": [],
  "channelId": "...",
  "channelType": "..."
}
```

Agent run metadata 也会返回：

```json
{
  "releaseOverlays": [
    {
      "versionId": "...",
      "proposalId": "...",
      "versionLabel": "v1",
      "objectType": "skill",
      "targetId": "skill-hermes-diagnosis",
      "patchId": "...",
      "patchKind": "skill_patch",
      "operationCount": 1,
      "publishedAt": "..."
    }
  ]
}
```

这让操作者可以从 Agent 执行、Hermes Session、trace 和 release ledger 追溯本次运行使用了哪些 release overlay。

## 回滚语义

rollback 仍然只操作 release ledger：

- 当前 active release -> `rolled_back`
- previous version 如果存在 -> 恢复为 `active`

由于 runtime 每次执行实时解析 active releases，回滚后下一次 Hermes 执行自然不再注入已回滚 overlay。

## 远端验证

在 `10.1.132.58` 已完成 smoke test：

1. 创建 `skill_update` proposal。
2. 自动生成 `evolution.patch.v1` structured patch。
3. deterministic evaluation 通过，score = 90。
4. admin approve。
5. publish active release。
6. 执行 `Hermes 诊断修复 Agent`。
7. 返回：

```text
RUN=OK overlays=1 status=success
```

8. trace 中存在：

```text
release_overlay_resolved
```

9. smoke release 已 rollback，smoke proposal 已 archive。

## 当前限制

- overlay 只注入 Hermes Runtime，不注入 builtin / custom_http / llm runtime。
- workflow template patch 暂不进入 agent runtime，后续应在 workflow executor 层处理。
- MCP tool execution 仍未开放。
- overlay guidance 不能扩大工具权限。
- overlay guidance 不能降低审批要求。

## 阶段 30 完成状态

阶段 30 已完成最小可用闭环：

```text
structured patch
  -> approved release
  -> active overlay
  -> Hermes runtime prompt
  -> trace / metadata
  -> rollback removes runtime effect
```

下一步可以进入阶段 31：

```text
MCP Tool Bridge 受控执行
```

或先做阶段 30b：

```text
Release Overlay 运维视图
  -> 当前哪些 overlay active
  -> 哪些 Agent/Channel 会受影响
  -> 最近哪些运行使用了 overlay
```
