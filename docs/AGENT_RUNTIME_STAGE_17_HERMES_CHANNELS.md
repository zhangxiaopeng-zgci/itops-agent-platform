# Agent Runtime Evolution - Stage 17 Hermes Channels

阶段 17 将 Hermes 的连接、模型、工具白名单和健康状态从 Agent 的 `runtime_config` 中抽象为可管理的 Channel。

## 当前实现

- 新增 `hermes_channels` 表。
- 新增 `hermes_channel_tools` 表。
- 在 `agents` 上增加过渡字段 `channel_id`。
- 初始化 3 个默认 Channel：
  - `Hermes 诊断通道`
  - `Hermes 修复编排通道`
  - `Hermes 复盘通道`
- 将 3 个默认 Hermes Agent 绑定到对应 Channel：
  - `Hermes 诊断修复 Agent` -> `hermes-channel-diagnose`
  - `Hermes 修复编排 Agent` -> `hermes-channel-remediate`
  - `Hermes 复盘进化 Agent` -> `hermes-channel-review`
- 新增 `/api/hermes-channels` API。
- 新增前端 `Hermes 控制台` 页面。
- Hermes Runtime Adapter 优先读取 Agent 绑定的 Channel；未绑定时继续兼容旧 `runtime_config`。

## Channel 内容

Channel 管理以下能力边界：

- runtime type
- base URL
- model
- API key reference
- timeout
- max tool rounds
- temperature
- policy id
- enabled state
- health status
- allowed tools

Channel 不保存 API key 明文，只保存密钥引用，例如 `HERMES_API_KEY`。

## API

```text
GET  /api/hermes-channels
GET  /api/hermes-channels/tools
GET  /api/hermes-channels/:id
POST /api/hermes-channels
PUT  /api/hermes-channels/:id
POST /api/hermes-channels/:id/test
```

权限：

- `viewer` / `operator`：只读查看 Channel 和工具目录。
- `admin`：创建、更新、测试 Channel。

## 默认工具白名单

诊断通道：

```text
list_servers
query_alerts
search_knowledge_base
list_workflows
run_readonly_command
submit_remediation_for_approval
run_workflow
get_task_status
verify_remediation
```

修复编排通道：

```text
list_servers
query_alerts
search_knowledge_base
list_workflows
submit_remediation_for_approval
run_workflow
get_task_status
verify_remediation
```

复盘通道：

```text
list_agent_executions
list_tool_approvals
get_correlation_trace
get_task_status
verify_remediation
list_workflows
search_knowledge_base
```

## 兼容策略

- 已存在的 Hermes Agent 会通过迁移绑定默认 Channel。
- 如果 Agent 没有 `channel_id` 或绑定的 Channel 被禁用，Runtime 继续读取旧 `runtime_config`。
- `runtime_config.allowedTools` 暂时保留，后续阶段 20 再从 Agent 表单中弱化或隐藏。

## 后续

阶段 20 继续做 Channel 与 Agent 绑定产品化：

- Agent 管理页选择 Channel。
- Hermes 助手展示当前 Channel 摘要。
- Hermes session 记录 `channelId`、`channelName`、skill ids 和 MCP server ids。

阶段 21 继续收口生产持久化：

- 稳定数据目录。
- Secret file / secret reference。
- 备份恢复演练。
- 容器 restart policy 和健康检查。
