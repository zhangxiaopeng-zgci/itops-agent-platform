# 阶段 29：Structured Evolution Patch

## 目标

阶段 29 把 Hermes Evolve 生成的“文本提案”升级为“结构化 Patch 草案”。

这一步仍然不让 Hermes 自动修改生产对象。它只解决一个关键问题：

```text
proposal body
  -> structuredPatch
  -> deterministic evaluation
  -> admin approval
  -> release payload
```

后续阶段 30 才会决定 active release overlay 如何被 runtime 读取。

## 当前实现

新增后端服务：

- `backend/src/services/evolutionPatchService.ts`

该服务负责：

- 根据 proposal type 生成 `structuredPatch`。
- 校验 patch schema、安全边界和审批要求。
- 从 proposal 中提取 patch。
- 给 evaluation 和 release 使用同一份结构化对象。

## Patch Schema

当前 schema 版本：

```text
evolution.patch.v1
```

结构：

```json
{
  "schemaVersion": "evolution.patch.v1",
  "patchId": "patch-uuid",
  "kind": "skill_patch",
  "applyMode": "proposal_only",
  "target": {
    "objectType": "skill",
    "targetId": "skill-hermes-diagnosis",
    "selector": {}
  },
  "summary": "proposal title",
  "operations": [
    {
      "op": "propose",
      "path": "/skill/content",
      "value": {
        "format": "markdown_proposal",
        "content": "proposal body"
      },
      "reason": "Generated from Hermes Evolve proposal body",
      "riskLevel": "medium",
      "requiresApproval": true
    }
  ],
  "rollbackPlan": {
    "strategy": "release_overlay_revert",
    "notes": "Rollback by deactivating this release overlay"
  }
}
```

## 类型映射

| Proposal Type | Patch Kind | Target |
| --- | --- | --- |
| `skill_update` | `skill_patch` | `skill` |
| `workflow_template_update` | `workflow_template_patch` | `workflow_template` |
| `tool_policy_update` | `tool_policy_patch` | `tool_policy` |
| `knowledge_update` | `knowledge_patch` | `knowledge` |
| `mcp_binding_update` | `mcp_binding_patch` | `mcp_binding` |
| `prompt_update` | `prompt_patch` | `agent_prompt` |

## 安全边界

阶段 29 的 patch 必须满足：

- `schemaVersion = evolution.patch.v1`
- `applyMode = proposal_only`
- 至少包含一个 operation
- operation path 使用 `/...` 形式
- 每个 operation 必须 `requiresApproval = true`
- 必须有 rollback plan

违反关键规则会导致 deterministic evaluation 失败。

## 评估增强

`evaluateEvolutionProposal` 新增 Patch 维度：

```text
final score =
  safety 30%
  evidence 20%
  completeness 20%
  replay 15%
  structured patch 15%
```

评估结果的 `result_summary` 会包含：

```json
{
  "patchScore": 100,
  "structuredPatch": {
    "valid": true,
    "score": 100,
    "findingCount": 0
  }
}
```

## 发布增强

发布前新增强校验：

- proposal 必须 `approved`
- proposal 必须有通过的 evaluation
- proposal 必须包含有效 `structuredPatch`

发布后的 release payload 会包含：

```json
{
  "structuredPatch": {},
  "structuredPatchValidation": {},
  "applyMode": "versioned_release_record"
}
```

这仍然只是 release ledger，不会直接改写 Skill、Workflow、MCP、Policy 或 Prompt 源表。

## 前端增强

`EvolutionProposals` 页面新增“结构化 Patch”面板：

- schema
- kind
- applyMode
- target
- operations
- risk level
- approval requirement
- rollback plan

操作者和管理员可以在审批/发布前直接检查 patch 是否足够明确。

## 远端验证

在 `10.1.132.58` 已完成验证：

- backend production build 通过。
- frontend production build 通过。
- backend/frontend 已用 production compose 重启。
- 新建 smoke proposal 自动生成 `structuredPatch`。
- evaluation 返回：

```text
passed=1
score=90
patchScore=100
findings=0
```

测试提案验证后已归档。

## 阶段 29 不做

- 不把 active release 自动应用到 runtime。
- 不改写生产 Skill / Workflow / MCP / Policy / Prompt。
- 不开放 MCP tool execution。
- 不绕过 evaluation / approval / publish。

## 阶段 30 衔接

阶段 30 可以在当前基础上继续做：

```text
active release
  -> structuredPatch
  -> release overlay resolver
  -> runtime prompt / skill / policy overlay
  -> trace records overlayVersion
  -> rollback restores previous overlay
```

阶段 30 的重点不是生成 patch，而是让已发布、已审批、可回滚的 patch 以 overlay 形式进入运行态。
