# AIOps Agent 收口演进路线

## 背景

当前系统已经完成 Hermes Runtime、三 Worker、Channel、Skill、MCP Registry、Proposal、Evaluation、Release Version 和持续进化任务的基线能力。

接下来不应该继续只叠加新功能，而要进入“产品化收口”：

- UI 体验一致。
- 测试机部署方式稳定。
- 容器网络和 Worker 编排固化。
- Hermes 控制台能解释能力关系。
- 持续进化能解释提案来源和价值。
- Release Version 从“账本”逐步演进为“可控运行态 overlay”。

## 当前待收口问题

### 1. 浅色模式下监控大屏仍然是深色

现象：

- 主题系统已经支持 `system / dark / light`。
- 大多数页面可跟随浅色主题。
- `监控大屏` 仍然大量使用 `bg-slate-*`、`text-white`、`border-slate-*`、`bg-[#0b0f14]` 等硬编码深色样式。

判断：

- 这不是主题 Context 失效。
- 本质是 `BigScreenDashboard.tsx` 被当作独立大屏设计，内部样式没有抽象成主题 token。

收口方向：

- 保留深色大屏作为默认值，因为监控墙、值守大屏天然适合深色。
- 在浅色模式下提供专业浅色大屏，不再强制深色。
- 如果后续需要，可增加“大屏独立主题：跟随系统 / 固定深色 / 固定浅色”。

### 2. 测试机仍是开发式启动

现象：

- 当前 `frontend` 跑的是 Vite dev server。
- 正式 `docker/Dockerfile.frontend` 已经支持 nginx 静态生产包，但测试机没有切换过去。

风险：

- Vite dev server 不适合长期运行。
- 依赖运行时源码和 node_modules。
- `/api` 代理依赖开发模式网络解析。
- 重启、重建、资源占用和安全边界都不如 nginx 静态包。

收口方向：

- 使用生产 compose 启动 nginx frontend。
- backend 使用生产 build。
- 三个 Hermes Worker 纳入 compose。
- 将数据、备份、secret、日志和 healthcheck 固化。

### 3. backend/frontend 网络 alias 是手动修复

现象：

- 当前登录问题通过 `docker network connect --alias backend itops-stage10 backend` 修复。
- 容器 restart 后仍然有效。
- 但如果容器被删除重建，alias 需要重新声明。

收口方向：

- 在 compose 中声明统一 network。
- service name 和 network alias 都固定为 `backend` / `frontend`。
- frontend nginx 通过 `/api` 反代到 `http://backend:3001`。
- Hermes Worker 通过服务名访问，backend 不再依赖宿主机端口访问 Worker。

### 4. Stage 26 Release Version 仍是账本

现状：

- Release Version 能发布、回滚、记录事件。
- 但不会实际影响 Skill / MCP / Workflow / Policy / Prompt 的运行态。

判断：

- 这个边界是正确的。
- 不应该把非结构化 proposal 文本直接写入生产对象。

收口方向：

- 先做结构化 patch。
- 再做 runtime overlay。
- 最后才允许受控生效，并保持可回滚。

### 5. Stage 27 持续进化缺少运营视图

现状：

- 持续任务能运行。
- 能把失败、fallback、拒绝审批样本放入 review queue。
- 能生成 proposal、评估 proposal、推动到 `approval_pending`。

不足：

- 操作者不容易看出：
  - 哪个失败产生了哪个提案。
  - 这个提案为什么通过或失败。
  - 它是否值得发布。
  - 发布后会影响哪个 Channel / Skill / MCP / Workflow / Policy。

收口方向：

- 建立 proposal lineage。
- 建立 evidence-to-proposal 关系视图。
- 展示评估理由、风险、收益和影响面。

### 6. Hermes 控制台还需要产品化

现状：

- Channel / Skill / MCP / Agent / Worker 已有雏形。
- 但它们仍分散在多个区域，用户需要自己理解关系。

收口方向：

- 推进阶段 28：Hermes Capability Control Plane。
- 先做只读概览，再做能力图谱，再做风险摘要。

## 推荐推进顺序

建议采用两条主线交替推进：

```text
主线 A：运行与体验收口
  -> 28e 主题体验收口
  -> 21c 生产化 compose 收口

主线 B：Hermes 产品化和自我进化收口
  -> 28a 控制台只读概览
  -> 28b Capability Graph
  -> 28c Risk Summary
  -> 27b Evolution Operations View
  -> 29 结构化 Evolution Patch
  -> 30 Release Overlay Runtime 注入
```

这样安排的原因：

- 浅色主题和生产部署是基础体验与稳定性，应该先处理。
- Hermes 控制台概览能承接 27/28 的复杂对象关系。
- 结构化 patch 和 runtime overlay 风险较高，需要等控制面可解释之后再做。

## 阶段 28e：主题体验收口

目标：

- 修复浅色模式下 `监控大屏` 仍然深色的问题。
- 保持深色大屏体验不退化。
- 不引入新的主题体系。

工作项：

- 在 `BigScreenDashboard.tsx` 使用当前 ThemeContext。
- 抽象页面级主题 class：
  - page background
  - panel background
  - border
  - primary text
  - secondary text
  - muted text
- 替换关键区域硬编码深色：
  - 页面根背景。
  - header。
  - 顶部状态胶囊。
  - 统计卡片。
  - 系统资源监控。
  - 服务器负载。
  - 中央趋势和任务面板。
- 浅色模式保留图表可读性。
- 全屏模式仍按当前主题展示。

验收：

- 浅色模式打开 `/big-screen` 不再是深色底。
- 深色模式打开 `/big-screen` 视觉基本保持现状。
- 文本、卡片、边框在浅色模式下可读。
- 不影响普通 Dashboard。

## 阶段 21c：生产化部署与容器编排收口

目标：

- 测试机从开发式容器切到生产式 compose。
- frontend 使用 nginx 静态生产包。
- backend、frontend、三个 Hermes Worker 使用同一 compose 网络。
- 网络 alias 不再依赖手工修复。

工作项：

- 新增或更新 `docker-compose.hermes.yml`。
- 服务：
  - `backend`
  - `frontend`
  - `hermes-diagnose`
  - `hermes-remediate`
  - `hermes-evolve`
- 固化 volumes：
  - `/opt/itops-agent-platform/data -> /app/data`
  - `/opt/itops-agent-platform/backups -> /app/backups`
  - `/opt/itops-agent-platform/secrets -> /run/secrets:ro`
- 固化 network：
  - service name `backend`
  - service name `frontend`
  - Worker 服务名作为 backend runtime URL。
- frontend nginx 反代：
  - `/api -> http://backend:3001`
  - `/socket.io -> http://backend:3001`
- 增加部署切换步骤：
  - 备份 DB。
  - 构建镜像。
  - 启动新 compose。
  - 验证 health。
  - 验证登录。
  - 验证 Hermes Worker。

验收：

- `http://10.1.132.58:3000` 仍可访问。
- HTML 不再包含 Vite dev client。
- `/api/auth/login` 通过 frontend 返回 200。
- backend 能访问三个 Worker 服务名。
- 删除重建容器后不需要手动 `docker network connect`。

## 阶段 28a：Hermes 控制台只读概览

目标：

- 管理员在一个页面看懂 Hermes 当前状态。
- 不改运行逻辑。

工作项：

- 新增 `GET /api/hermes-control-plane/overview`。
- 聚合：
  - Channel。
  - Agent 绑定。
  - Worker health / run metrics。
  - Skill Pack。
  - MCP Server。
  - Tool allowlist。
  - Proposal / Evaluation / Release summary。
  - Review queue summary。
- Hermes 控制台增加 `概览` Tab。

验收：

- 能看清三个 Hermes 通道分别对应哪个 Agent、Worker、Skill、MCP 和工具边界。
- 能看到近期 fallback、失败、proposal 和 release 状态。
- 页面只读，不新增风险操作。

## 阶段 28b：Capability Graph

目标：

- 把 Hermes 能力关系从表格升级为图谱。

工作项：

- 新增 `GET /api/hermes-control-plane/capability-graph`。
- 返回 nodes / edges：
  - Agent。
  - Channel。
  - Worker。
  - Skill。
  - MCP。
  - Tool。
  - Release。
- 前端显示分组拓扑或轻量关系图。
- 节点支持跳转详情页。

验收：

- 能一眼看到一个 Agent 的能力来源和执行路径。
- 能识别某个 Skill/MCP/Tool 被哪些 Channel 使用。

## 阶段 28c：Risk Summary

目标：

- 管理员不翻日志也能知道 Hermes 控制面的风险。

工作项：

- 新增 `GET /api/hermes-control-plane/risk-summary`。
- 识别：
  - Worker fallback 频繁。
  - Channel 未绑定 Worker。
  - Agent 使用 legacy runtime config。
  - 高风险工具缺少审批策略。
  - MCP Server 健康异常。
  - review queue 长期未处理。
  - proposal 高分但长期未审批。
  - active release 没有清晰目标对象。
- 控制台展示风险等级、影响对象、建议动作。

验收：

- 风险项可以跳转到对应 Channel / Worker / Proposal / Release。
- 不做自动修复。

## 阶段 27b：Evolution Operations View

目标：

- 让持续进化过程可运营、可解释。

工作项：

- 增强 review queue 展示：
  - 来源类型。
  - 来源 ID。
  - 对应 Worker run / Agent execution / Approval。
  - 首次发现时间。
  - 最近更新时间。
- 增强 proposal 展示：
  - 来自哪些 queue item。
  - 来自哪些 trace/correlation。
  - 为什么通过/失败 evaluation。
  - 预计影响对象。
  - 是否值得发布的评分摘要。
- 增加 filters：
  - source type。
  - severity。
  - proposal status。
  - channel / worker。

验收：

- 能回答“这个提案从哪里来”。
- 能回答“为什么它值得或不值得发布”。
- 能回答“发布会影响什么”。

## 阶段 29：结构化 Evolution Patch

目标：

- 让 proposal 从自然语言建议变成可验证变更集。

新增 patch 类型：

```text
skill_patch
workflow_template_patch
tool_policy_patch
mcp_binding_patch
channel_runtime_patch
prompt_patch
```

工作项：

- 新增 patch schema。
- proposal 生成时要求 Hermes Evolve 输出 structured patch。
- evaluation 对 patch 做 schema validation。
- patch 只进入 proposal/release，不直接写生产源表。

验收：

- proposal 必须有结构化 patch 才能进入 publish。
- 不合规 patch 评估失败。
- patch 可以显示 diff。

## 阶段 30：Release Overlay Runtime 注入

目标：

- 让 active release 以 overlay 方式影响 runtime，而不是直接改源表。

工作项：

- 定义 overlay 读取顺序：

```text
source config
  -> active release overlay
  -> runtime effective config
```

- Channel runtime 解析 active release。
- Skill prompt 注入读取 active skill overlay。
- Tool allowlist 读取 active policy overlay。
- MCP binding 读取 active binding overlay。
- 所有 effective config 写入 trace metadata。

边界：

- 仅 admin publish 后 active release 生效。
- rollback 后 runtime 自动回退。
- 不直接修改原始 Skill/MCP/Workflow/Policy 表。

验收：

- 发布一个测试 Skill patch 后，下一次 Hermes run metadata 能看到 overlay version。
- rollback 后 metadata 回到旧版本。
- trace 能解释本次运行用了哪个 release。

## 阶段 31：MCP Tool Bridge 受控执行

目标：

- 在 MCP Registry 基础上，让 MCP tool 能受控进入 Tool API。

工作项：

- MCP capability discovery。
- MCP tools/resources/prompts 缓存。
- 将 MCP tool 映射为平台 Tool API 描述。
- 接入 PolicyGuard、Approval、Audit、Trace。
- 默认关闭，需要 admin 显式启用。

验收：

- 未启用 MCP tool 不出现在 Hermes tool list。
- 启用后仍经过审批和审计。
- MCP 调用失败不会绕过平台控制面。

## 阶段 32：多环境、灰度和治理

目标：

- 让 Hermes 变更适合真实生产环境。

工作项：

- 环境维度：
  - dev
  - staging
  - production
- release 灰度：
  - 按 Channel。
  - 按 Agent。
  - 按用户角色。
  - 按服务器分组。
- 回放验证：
  - 历史 trace replay。
  - shadow run。
  - 对比报告。
- 治理：
  - release approval policy。
  - mandatory rollback plan。
  - change window。

验收：

- 生产发布前必须通过 staging replay。
- 高风险 release 必须有 rollback plan。
- 发布过程可审计。

## 最小推进顺序

建议从以下顺序开始：

```text
1. 阶段 28e：主题体验收口
2. 阶段 21c：生产化 compose 收口
3. 阶段 28a：Hermes 控制台只读概览
4. 阶段 28b：Capability Graph
5. 阶段 28c：Risk Summary
6. 阶段 27b：Evolution Operations View
7. 阶段 29：结构化 Evolution Patch
8. 阶段 30：Release Overlay Runtime 注入
```

前四步完成后，系统会从“功能已经很多”变成“可以稳定运行、可以解释、可以管理”。

阶段 29/30 再开始让 Hermes 自我进化真正影响运行态，但仍保持审批、发布和回滚边界。
