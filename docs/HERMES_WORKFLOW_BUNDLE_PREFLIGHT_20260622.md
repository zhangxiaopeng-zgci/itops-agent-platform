# P13 Hermes Workflow Capability Bundle Preflight

## 背景

P12 已经把 Hermes Channel 聚合成 `effectiveBundle`，能在 Hermes 控制台中看到一个通道当前真正可用的 Agent、Tool、Skill、MCP、Release、Policy 和 Worker 质量。

P13 的目标不是继续增加配置入口，而是把这个能力包带到工作流使用路径：操作者在选择或执行 Workflow 时，应能提前知道该工作流依赖哪些 Hermes Channel，这些 Channel 的能力包是否 ready，是否存在风险提示，以及关联了哪些生效 Release。

## 目标

- 让 Workflow 列表成为 Hermes 能力包的使用视图之一。
- 执行 Workflow 前展示 Channel Bundle readiness。
- 不改变现有执行器，不阻断旧工作流。
- 为后续真正的发布门禁和执行前策略校验留下稳定数据契约。

## 本阶段实现

### 后端能力摘要增强

`workflowCapabilityService` 在原有 `capability_summary` 中新增 `channelBundles`：

- `count`: 工作流引用的 Hermes Channel 数量
- `ready`: ready 的能力包数量
- `needsReview`: 需要复核的能力包数量
- `releaseOverlays`: 关联的生效 Release 数量
- `warnings`: 聚合后的能力包风险
- `channels`: 每个 Channel 的 ready、warnings、Agent/Tool/Skill/MCP/Release/成功率摘要

该数据来自 P12 `effectiveBundle`，不重复计算业务规则。

### 前端工作流预检

Workflow 卡片能力摘要新增：

- 能力包 ready 数
- 关联生效 Release 数
- 每个 Channel 的 ready / needs review 状态
- 能力包 warnings

执行确认增强：

- 普通执行：如果存在 needs review 的能力包，确认文案会提示风险。
- 选择服务器执行：弹窗内展示 Hermes 能力包预检摘要，并在最终执行前提示风险。

## 收口边界

本阶段不做：

- 不阻断执行。
- 不修改 Workflow Executor 调度逻辑。
- 不让 Release 自动作用到 Workflow。
- 不新增可编辑的 Bundle 配置。

## 验收口径

- `/api/workflows` 中每个工作流的 `capability_summary.channelBundles` 正常返回。
- Hermes 增强工作流能显示绑定 Channel 的 Bundle ready 状态。
- 普通工作流无 Channel 时不显示多余预检。
- 中英文文案均可切换。
- 远端生产 compose 构建通过，API smoke 通过。

## 后续方向

P13 后可以继续收口到 P14：

- 执行前策略门禁：按角色、风险、Policy 决定是否允许直接执行。
- Release 影响面校验：发布前展示会影响哪些 Workflow Bundle。
- Workflow 编辑器节点选择 Agent 时展示该 Agent 的 Channel Bundle 摘要。
- 审批单中记录 Workflow 当时的 Bundle snapshot，提升审计可复盘性。
