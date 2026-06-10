# Agent Runtime Evolution - Stage 11-16 Hermes Operator Roadmap

这份文档固化 Hermes 从“隐藏 runtime 能力”演进为“操作者可直接使用的 AIOps 工作台”的阶段计划。

阶段 0-10 已经完成 runtime、Tool API、审批、任务、trace 和 correlation 基础能力。阶段 11-16 不重新设计执行核心，而是围绕现有能力做产品化、闭环化和权限收口。

阶段 17-21 将继续把 Hermes 管理面升级为 Channel、MCP、Skills 和生产持久化能力，详见 `docs/AGENT_RUNTIME_STAGE_17_21_HERMES_CHANNEL_ROADMAP.md`。

## 总体原则

- Hermes 负责诊断、规划、复盘和提出受控动作。
- ITOps 平台负责工具边界、审批、任务执行、审计和权限。
- 前端先把现有链路清晰暴露出来，再逐步增强闭环体验。
- 不把 Hermes API key 暴露到前端。
- 不让 Hermes 绕过 Tool API、PolicyGuard 或人工审批。
- 每个阶段都保持可独立上线、可回滚。

## 当前 Hermes 角色

平台默认维护 3 个 Hermes Agent：

```text
Hermes 诊断修复 Agent
Hermes 修复编排 Agent
Hermes 复盘进化 Agent
```

职责边界：

- `Hermes 诊断修复 Agent`：告警理解、上下文收集、只读诊断、证据整理、修复建议。
- `Hermes 修复编排 Agent`：选择 workflow、提交审批型修复、追踪任务、触发验证。
- `Hermes 复盘进化 Agent`：读取 trace、审批、任务和 audit，输出改进 proposal，不直接修改生产配置。

## 阶段 11：Hermes 使用入口梳理

状态：已完成基线实现。

目标：先把现有 Hermes 能力清晰暴露出来，不大改执行逻辑。

工作项：

- 新增 `Hermes 运维助手` 页面。
- 页面提供三个入口：
  - 诊断问题
  - 修复编排
  - 复盘优化
- 自动绑定现有 3 个 Hermes Agent：
  - `Hermes 诊断修复 Agent`
  - `Hermes 修复编排 Agent`
  - `Hermes 复盘进化 Agent`
- 每个入口调用对应 Agent 的测试/执行接口。
- 显示 Hermes 输出、runtime、trace 摘要。
- 从 trace 中识别：
  - `approvalId`
  - `taskId`
  - `correlationId`
- 提供快捷跳转：
  - 工具审批
  - 任务详情
  - 关联链路视图

实现边界：

- 不新增 Agent Runtime 类型。
- 不修改 Tool API 审批策略。
- 不改变 workflow 执行器。

验收标准：

- 操作者能在 `/hermes` 页面选择三个 Hermes 模式。
- 能运行对应 Hermes Agent 并看到输出。
- 如果 trace 中包含审批、任务或 correlation 信息，页面能提取并提供跳转。

产出：操作者能在一个页面完成基本 Hermes 使用，而不是去多个页面找线索。

## 阶段 12：诊断上下文增强

状态：已完成基线实现。

目标：让操作者少填信息，Hermes 自动拿到更多上下文。

工作项：

- 在 Hermes 页面支持选择：
  - 服务器
  - 告警
  - 工作流模板
  - 知识库分类
- 调用 Agent 时自动组装 context：
  - `serverId`
  - `serverIds`
  - `alertId`
  - `workflowId`
  - `correlationId`
  - 当前用户角色
- 将已选上下文写入 Hermes prompt，让 Hermes 能直接看到操作者选择的对象。
- 增加快捷 Prompt：
  - 诊断这台服务器当前状态
  - 分析这个告警是否需要处理
  - 给出修复方案但不要执行
  - 提交修复审批
  - 复盘最近一次处理链路
- Hermes 输出建议保持结构化：
  - 证据
  - 风险
  - 建议动作
  - 是否已提交审批

实现边界：

- 前端只传对象 id 和必要摘要，不复制凭证、密钥或敏感字段。
- 上下文只增强 Hermes 判断，不改变权限。
- 当前用户角色以后端鉴权结果为准，前端只作为展示和提示。

验收标准：

- 选择服务器、告警、工作流和知识分类后，Agent 执行请求里包含对应 context。
- Hermes prompt 中包含可读的已选上下文块。
- 快捷 Prompt 能基于已选对象自动生成输入。

产出：操作者可以像填工单一样使用 Hermes。

## 阶段 13：审批与任务闭环嵌入

状态：已完成基线实现。

目标：把审批和任务状态直接嵌进 Hermes 使用页面。

工作项：

- 在 Hermes 页面内展示关联审批单：
  - `pending`
  - `approved`
  - `executed`
  - `failed`
  - `rejected`
- 支持从页面直接跳转或处理审批：
  - 查看审批详情
  - 通过审批
  - 拒绝审批
  - 跳转到工具审批页
- 识别 `run_workflow` 返回的任务 ID。
- 嵌入任务状态卡片：
  - 当前状态
  - 节点进度
  - 失败节点
  - 执行日志摘要
- 增加操作按钮：
  - 刷新状态
  - 验证修复
- 验证结果回写到同一条 Hermes 会话视图。

推荐实现方式：

- 继续以 Hermes 页面为主入口。
- 优先从当前 run 的 trace 中提取 `approvalId`、`taskId`、`correlationId`。
- 如果 trace 只有 `approvalId`，通过 `GET /api/tool-approvals/:id` 补齐审批执行结果。
- 如果审批通过后产生 `taskId`，从审批 `execution_result` 或 correlation chain 中识别任务。
- 如果只有 `correlationId`，通过 `GET /api/correlations/:id` 拉取关联链路。
- 任务状态使用 `GET /api/tasks/:id`。
- 验证修复使用 `POST /api/tools/verify_remediation/invoke`，输入至少包含 `taskId`。

前端建议组件：

```text
HermesAssistant
  HermesRunResultPanel
  HermesApprovalPanel
  HermesTaskStatusCard
  HermesCorrelationPanel
  HermesVerificationResult
```

实现边界：

- 阶段 13 不新建会话表。
- 阶段 13 不重写审批服务。
- 阶段 13 不修改 workflow 执行语义。
- 直接审批操作仍走现有后端接口和角色权限。

验收标准：

- Hermes run 产生审批单后，页面内能看到审批状态。
- 审批通过后，页面能识别并展示关联任务。
- 任务运行中/成功/失败时，页面状态可刷新。
- 点击验证修复后，验证结果显示在同一个 Hermes run 视图内。

产出：操作者不用在 Agent、审批、任务页面之间来回跳。

## 阶段 14：Hermes 工作流模板化

目标：让默认工作流真正纳入 Hermes，但不破坏旧模板。

新增模板：

### Hermes 告警诊断与修复闭环

节点建议：

```text
Hermes 诊断修复 Agent
日志分析 Agent
服务器命令执行 Agent
Hermes 修复编排 Agent
文档生成 Agent
```

适用场景：

- 告警进入后先诊断。
- 需要多 Agent 补证据。
- 最后由 Hermes 编排修复审批和总结。

### Hermes 故障诊断与审批修复

节点建议：

```text
Hermes 诊断修复 Agent
服务器命令执行 Agent
Hermes 修复编排 Agent
Hermes 复盘进化 Agent
```

适用场景：

- 明确故障处理。
- 需要审批式修复。
- 需要把复盘建议留在同一条链路里。

### Hermes 巡检复盘与优化建议

节点建议：

```text
系统巡检 Agent
服务器命令执行 Agent
文档生成 Agent
Hermes 复盘进化 Agent
```

适用场景：

- 定期巡检。
- 生成报告。
- 从巡检结果中提炼优化 proposal。

实现边界：

- 保留旧默认工作流。
- 新模板作为 Hermes 增强版模板，不替换旧模板。
- 模板节点优先复用现有 Agent 和 workflow 数据结构。
- 如果阶段 15 之前 workflow 节点 trace 不完整，可先在任务结果中保留 runtime metadata 摘要。

验收标准：

- 新安装和既有安装都能看到 Hermes 增强版工作流模板。
- 旧默认工作流仍存在且可执行。
- Hermes 模板能被阶段 12/13 的 Hermes 页面选中。

产出：操作者可以直接选择 Hermes 工作流，而不是手动拼节点。

## 阶段 15：Trace 与会话持久化

状态：已完成基线实现。

目标：让 Hermes 使用过程可审计、可复盘、可继续。

工作项：

- 新增 Hermes 会话表，或复用并增强 `agent_executions.metadata`。
- 保存：
  - `input`
  - `output`
  - selected context
  - trace
  - `approvalId`
  - `taskId`
  - `correlationId`
- 工作流执行器改用 `executeAgentRun`，把每个 Agent 节点的 runtime metadata 和 trace 写入 node result。
- correlation trace 页面补充：
  - Hermes 会话
  - Agent 节点 trace
  - Tool approval
  - Task
  - Audit log
- 支持从复盘 Agent 一键带入 `correlationId`。

推荐数据模型：

```text
hermes_sessions
  id
  agent_execution_id
  mode
  input
  output
  selected_context
  extracted_refs
  correlation_id
  status
  created_by
  created_at
  updated_at
```

如果短期不新增表，可先约定 `agent_executions.metadata.hermes`：

```json
{
  "mode": "diagnose",
  "selectedContext": [],
  "approvalIds": [],
  "taskIds": [],
  "correlationId": "..."
}
```

实现边界：

- 会话持久化不改变运行权限。
- Trace 持久化需要脱敏，不能保存密钥、密码、私钥正文。
- 工作流执行器接入 runtime trace 时，要保持旧 Agent 节点兼容。

验收标准：

- Hermes 页面刷新后仍能找回最近会话。
- correlation 页面能看到同一链路下的 Hermes 会话、审批、任务和审计记录。
- 工作流中的 Hermes 节点能保存 runtime 和 trace metadata。

产出：Hermes 真正形成闭环证据链。

## 阶段 16：产品化和权限边界

状态：当前收口中。详细边界见 `docs/AGENT_RUNTIME_STAGE_16_PERMISSION_BOUNDARY.md`。

目标：让 Hermes 对不同角色安全可用。

角色边界：

### viewer

- 只读诊断。
- 查看结果。
- 不能提交修复审批。
- 不能审批或执行工具。

### operator

- 可提交修复审批。
- 可执行低风险操作。
- 可查看自己或被授权范围内的会话、任务和审批。
- 不能配置 Hermes runtime。

### admin

- 可审批。
- 可配置 Hermes runtime。
- 可调整允许工具。
- 可管理 Agent、工作流模板和策略。

页面展示：

- 当前模式：
  - 只读
  - 需审批
  - 自动
- 可用工具。
- 风险级别。
- 本次是否会修改生产环境。
- 审批策略来源。

安全增强：

- 对危险 prompt 做拦截提示。
- 在只读模式下隐藏或禁用提交修复审批。
- 在需要审批模式下明确展示“本次不会直接修改生产环境，必须通过审批后执行”。
- 对高风险工具保留后端 PolicyGuard 最终裁决。

验收标准：

- viewer 无法提交审批和执行工具。
- operator 可以提交审批，但不能绕过审批。
- admin 可以配置 Hermes runtime 和 allowed tools。
- 页面清楚展示本次运行的权限、工具和风险状态。

产出：Hermes 可面向真实操作者开放，而不是只给开发者测试。

## 推荐实现顺序

```text
阶段 11：Hermes 运维助手页面
阶段 12：上下文选择和快捷 Prompt
阶段 13：审批/任务状态嵌入
阶段 14：Hermes 增强版工作流模板
阶段 15：trace 持久化增强
阶段 16：权限和产品化收口
```

最小可用版本：

```text
新增 Hermes 运维助手页面
  -> 三个入口
  -> 调用现有 Hermes Agent
  -> 展示输出和 trace
  -> 提取 approvalId/taskId/correlationId
  -> 提供跳转
```

这一步完成后，Hermes 对操作者就从“隐藏 runtime”变成“可使用功能”。

## 下一步：阶段 17-21

阶段 11-16 已经让 Hermes 对操作者可用，并形成审批、任务、trace、会话和权限闭环。下一步不建议继续把能力配置堆在 Agent 的 `runtime_config` 中，而是抽象出 Hermes Channel：

```text
Hermes Channel
  -> Runtime endpoint / model / secret ref
  -> Tool allowlist
  -> MCP servers
  -> Skill packs
  -> Policy
  -> Health check
```

推荐顺序：

```text
阶段 17：Hermes Channel 管理入口
阶段 20：Channel 与 Agent 绑定
阶段 21：部署、密钥和持久化生产化
阶段 18：MCP Server Registry
阶段 19：Skill Pack Registry
```

详细计划见 `docs/AGENT_RUNTIME_STAGE_17_21_HERMES_CHANNEL_ROADMAP.md`。
