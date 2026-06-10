# Agent Runtime Evolution - Stage 20 Agent Channel Binding

阶段 20 将 Hermes Agent 的能力入口从直接编辑 `runtime_config` 调整为选择 Hermes Channel。

## 当前实现

- Agent 管理页中，Hermes runtime 改为选择 `Hermes Channel`。
- Channel 选择后展示：
  - model
  - secret reference
  - health status
  - enabled tool count
  - tool allowlist 摘要
- Hermes 连接测试优先调用所选 Channel 的测试接口。
- 未选择 Channel 时继续兼容旧 `runtime_config`。
- Hermes 运维助手的当前 Agent 卡片展示绑定的 Channel 摘要。
- Hermes 助手中的工具列表优先来自 Channel 的 `hermes_channel_tools`。

## 兼容策略

- 已有 3 个 Hermes Agent 由阶段 17 迁移绑定默认 Channel。
- 旧 `runtime_config` 不删除，作为未绑定 Channel 的 fallback。
- 后端 Runtime Adapter 已在阶段 17 支持优先读取 Channel。

## 产品边界

- Agent 负责职责、角色和提示词。
- Channel 负责 endpoint、model、secret reference、工具白名单和健康状态。
- 非 admin 仍不能修改 runtime/Channel 相关配置。

## 后续

- Hermes session 增强保存 `channelId`、`channelName`、skill ids 和 MCP server ids。
- Agent 详情页展示 Channel 深链跳转。
- Channel 变更增加审计日志。
