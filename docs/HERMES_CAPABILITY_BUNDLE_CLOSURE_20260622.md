# P12 Hermes Capability Bundle 收口

## 背景

前面的阶段已经把 Hermes Agent、Channel、Skill、MCP、Release、Worker、Kanban 和证据链逐步接进平台，但操作者仍然需要在多个页面之间判断一个 Hermes 通道到底能做什么、由哪个 Agent 使用、有哪些外部连接、是否有生效版本、近期运行质量如何。

P12 不继续扩页面，而是把 Channel 收敛为 Hermes 能力入口：每个 Channel 对外暴露一个只读 Effective Capability Bundle，用来描述当前运行态真正可用的能力包。

## 目标

- 让 Channel 成为 Agent / Workflow 使用 Hermes 能力的产品化入口。
- 在一个视图中聚合 Agent、工具、Skill、MCP、Release、Policy、Delegation 和 Worker 质量。
- 不改变现有执行逻辑，不新增表结构，不绕过审批与发布门禁。
- 为后续 Workflow 选择能力包、发布前检查、运维巡检提供稳定只读契约。

## 本阶段实现

### 后端只读聚合

`GET /api/hermes-channels` 和 `GET /api/hermes-channels/:id` 的 Channel 记录新增 `effectiveBundle` 字段。

字段契约：

- `schemaVersion`: `hermes.channel.effectiveBundle.v1`
- `runtime`: runtime 类型、模型、Base URL、密钥引用、超时、工具轮次、温度
- `policy`: 策略 ID、策略模式、是否需要审批、高危工具数量
- `agents`: 当前绑定到 Channel 的 Hermes Agent
- `tools`: 当前启用工具和风险级别
- `skills`: 当前启用 Skill Pack 及风险、审批、版本状态
- `mcpServers`: 当前启用 MCP Server 及健康状态、导入模式
- `delegation`: 委派、并发、深度、外部 CLI worker、Kanban、熔断阈值
- `releaseOverlays`: 与 Channel、Agent、Skill、MCP、Policy 相关的生效 Release
- `quality`: 近 24 小时 Worker 运行质量
- `summary`: 聚合计数、是否 ready、风险提示

### 前端产品化展示

Hermes Channel 详情页新增“有效能力包”面板：

- Ready / Needs review 状态
- Policy bound / Default guardrails
- Approval required 状态
- Agent、工具、高危工具、Skill、MCP、Release、成功率指标
- 风险提示
- 绑定 Agent、运行策略、工具与 Skill、MCP 与 Release 明细

Channel 列表同时显示能力包 ready 状态和关联 Release 数量，便于快速筛选。

## 收口边界

本阶段刻意不做：

- 不新增 Skill / MCP 运行时执行能力。
- 不让 Release 自动修改生产运行态。
- 不改变 Workflow 执行器的调度逻辑。
- 不引入新的 Hermes 页面入口。
- 不把 Capability Bundle 变成可编辑对象。

## 验收口径

- 三个 Hermes Channel 均返回 `effectiveBundle`。
- 能力包 summary 与现有绑定数据一致。
- 高危工具无策略、MCP 异常、无 Agent 绑定等情况能出现在 warnings。
- 前端中英文均能展示能力包文案。
- 平台 smoke test 通过。
- 远端 `10.1.132.58` 使用生产容器构建验证。

## 后续方向

P12 后的自然收口方向不是继续增加页面，而是把 Effective Capability Bundle 用作跨模块契约：

- Workflow 模板选择 Hermes Channel 时展示能力包摘要。
- 发布 Release 前校验影响到哪些 Bundle。
- Hermes Dashboard / Kanban 卡片展示当前关联 Bundle。
- 运营巡检定期扫描 Bundle ready 状态。
- 备份恢复演练覆盖 Capability Bundle 所依赖的 Skill/MCP/Release 数据。
