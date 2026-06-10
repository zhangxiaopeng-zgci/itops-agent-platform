# Agent Runtime Evolution - Stage 17-21 Hermes Channel Roadmap

这份文档定义 Hermes 从“3 个预设 Agent + runtime_config.allowedTools”继续演进为“可管理、可审计、可扩展的能力通道”的阶段计划。

当前系统已经完成：

- 3 个 Hermes Agent：诊断修复、修复编排、复盘进化。
- Hermes Runtime Adapter。
- Tool API、PolicyGuard、审批、任务、trace、Hermes session。
- 操作者入口和角色权限边界。

当前系统尚未完成：

- Hermes Channel 不是一等对象。
- Skills 不是一等对象。
- MCP Server / Connector 不是一等对象。
- `allowedTools` 仍保存在 Agent 的 `runtime_config` 中，难以复用、审计和批量调整。
- 当前测试部署不是生产化容器编排，数据目录和密钥管理还需要收口。

## 核心判断

短期不需要把 3 个 Hermes Agent 拆成 3 个 Docker container。

更合理的目标架构是：

```text
Frontend
  -> Backend
    -> Hermes Channel Registry
      -> Hermes Runtime Adapter
        -> OpenAI-compatible endpoint / local Hermes sidecar
      -> Tool API
      -> MCP Gateway
      -> Skill Registry
      -> PolicyGuard / Approval / Audit
```

即：

```text
1 个 Backend
1 个 Hermes Runtime Adapter
N 个 Hermes Channel
3 个默认 Hermes Agent 绑定不同 Channel/Profile
```

只有在以下场景明确出现时，才考虑多个 Hermes runtime container：

- 诊断、修复、复盘需要不同本地 runtime、模型版本或资源隔离。
- 修复编排需要独立网络隔离或强审计边界。
- 不同团队有独立密钥、配额、限流和故障域。
- MCP server 或本地工具必须运行在隔离 sidecar 中。

## Channel 定义

Hermes Channel 是一个可管理的 Hermes 能力入口：

```text
Runtime endpoint
+ model
+ secret reference
+ tool allowlist
+ MCP connectors
+ skill packs
+ policy
+ roles
+ persistence scope
+ health check
```

Channel 不替代 Agent。Agent 仍负责角色、提示词和业务职责；Channel 负责能力来源、连接方式、工具边界和运行策略。

## 推荐数据模型

```text
hermes_channels
  id
  name
  description
  type                 default / diagnose / remediate / review / custom
  runtime_type          external_openai_compatible / local_sidecar
  base_url
  model
  api_key_ref
  timeout_ms
  max_tool_rounds
  temperature
  policy_id
  enabled
  health_status
  last_checked_at
  created_by
  created_at
  updated_at

hermes_channel_tools
  id
  channel_id
  tool_name
  enabled
  risk_level_override
  created_at

hermes_channel_skills
  id
  channel_id
  skill_id
  enabled
  config
  created_at

mcp_servers
  id
  name
  description
  transport            stdio / http / sse
  command
  url
  env_ref
  enabled
  health_status
  last_checked_at
  created_at
  updated_at

hermes_channel_mcp_servers
  id
  channel_id
  mcp_server_id
  enabled
  tool_prefix
  created_at

agent_channel_bindings
  id
  agent_id
  channel_id
  mode                 default / diagnose / remediate / review
  created_at
```

## 前端入口

新增 `Hermes 控制台`，作为管理入口。`Hermes 运维助手` 继续作为操作者使用入口。

建议导航：

```text
自动化
  Hermes 助手
  Hermes 控制台
  Agent 管理
  工具审批
  工作流
```

Hermes 控制台建议 Tab：

```text
通道 Channels
Agent 绑定
Skills
MCP Servers
工具策略
运行记录
健康检查
```

## 阶段 17：Hermes Channel 管理入口

目标：把 Hermes endpoint、model、密钥引用、工具白名单和健康状态从 Agent 表单里抽出来，形成可管理的 Channel。

工作项：

- 新增 `hermes_channels` 表。
- 初始化 3 个默认 Channel：
  - `Hermes 诊断通道`
  - `Hermes 修复编排通道`
  - `Hermes 复盘通道`
- 新增 Channel API：
  - `GET /api/hermes-channels`
  - `GET /api/hermes-channels/:id`
  - `POST /api/hermes-channels`
  - `PUT /api/hermes-channels/:id`
  - `POST /api/hermes-channels/:id/test`
- 新增 Channel 工具白名单表 `hermes_channel_tools`。
- Hermes Runtime Adapter 优先读取 Agent 绑定的 Channel；未绑定时兼容读取 `agents.runtime_config`。
- 新增 `Hermes 控制台` 页面，先实现 Channel 列表、详情、连接测试、工具白名单展示。

权限边界：

- `viewer`：只读查看 Channel 状态。
- `operator`：只读查看 Channel 状态和可用工具。
- `admin`：创建、编辑、测试 Channel，调整工具白名单。

验收标准：

- 3 个默认 Hermes Agent 均能绑定到默认 Channel。
- 不破坏现有 `runtime_config` 兼容。
- admin 能测试 Channel 连接。
- 页面能展示 Channel 的健康状态、model、工具数量、最近检查时间。

产出：Hermes 从“Agent 内部配置”变成“可管理通道”。

## 阶段 18：MCP Server Registry

目标：为 Hermes 接入 MCP 做准备，先把 MCP Server 作为可登记、可测试、可审计的连接器，而不是直接让 Hermes 随意连外部工具。

工作项：

- 新增 `mcp_servers` 表。
- 新增 `hermes_channel_mcp_servers` 绑定表。
- 新增 MCP API：
  - `GET /api/mcp-servers`
  - `POST /api/mcp-servers`
  - `PUT /api/mcp-servers/:id`
  - `POST /api/mcp-servers/:id/test`
  - `POST /api/hermes-channels/:id/mcp-servers`
- 支持 transport 元数据：
  - `stdio`
  - `http`
  - `sse`
- 第一阶段只做注册、启停、健康检查和绑定，不直接放开 MCP tool execution。
- 定义 MCP 工具导入策略：
  - 默认禁用。
  - admin 显式启用。
  - 导入后仍映射成 ITOps Tool API 工具描述。
  - 仍经过 PolicyGuard、Approval、Audit。

权限边界：

- `viewer` / `operator`：可查看 MCP server 状态。
- `admin`：可配置 MCP server、绑定 Channel、启用工具。

验收标准：

- admin 能登记 MCP server 并测试连接。
- Channel 页面能看到绑定的 MCP server。
- 未启用的 MCP tool 不会出现在 Hermes tool list。

产出：MCP 从“未来概念”变成“受控连接器清单”。

## 阶段 19：Skill Pack Registry

目标：把 skill 作为可管理的提示词/流程/工具组合包，供 Channel 或 Agent 复用。

Skill 不等于 Tool：

- Tool 是可执行能力。
- Skill 是能力使用方法、提示模板、上下文装配方式、输出规范和风险约束。

工作项：

- 新增 `skills` 表：
  - name
  - description
  - category
  - version
  - content
  - required_tools
  - risk_notes
  - enabled
- 新增 `hermes_channel_skills` 绑定表。
- 新增 Skill API：
  - `GET /api/skills`
  - `POST /api/skills`
  - `PUT /api/skills/:id`
  - `POST /api/hermes-channels/:id/skills`
- Hermes Runtime Adapter 构建 system prompt 时，将 Channel 绑定的 enabled skills 注入为受控上下文。
- 默认初始化 3 类技能包：
  - 故障诊断 Skill Pack
  - 审批修复 Skill Pack
  - 复盘进化 Skill Pack

权限边界：

- `viewer` / `operator`：可查看 enabled skill。
- `admin`：可新增、编辑、启用、绑定 skill。

验收标准：

- Channel 详情页能看到绑定 skills。
- Hermes run trace 中记录本次使用的 skill ids 和 versions。
- Skill 禁用后不再注入到 Hermes prompt。

产出：Hermes 的“会什么”从硬编码提示词变成可版本化管理的能力包。

## 阶段 20：Channel 与 Agent 绑定

目标：让 Agent 与 Channel/Profile 解耦，一个 Channel 可以服务多个 Agent，一个 Agent 可以明确绑定默认 Channel。

工作项：

- 新增 `agent_channel_bindings` 表，或在 `agents` 表增加 `channel_id` 过渡字段。
- Agent 管理页改造：
  - runtime 为 Hermes 时选择 Channel。
  - 不再直接编辑 endpoint/API key。
  - 显示 Channel 的工具、skills、MCP server 和 policy 摘要。
- Hermes 运维助手改造：
  - 展示当前 Agent 绑定的 Channel。
  - 展示 Channel 能力摘要。
  - trace/session 保存 `channelId`、`channelName`、`skillIds`、`mcpServerIds`。
- Workflow 节点执行时，将 Channel metadata 写入 node result。

兼容策略：

- 已有 Agent 的 `runtime_config` 保留。
- 如果 Agent 没有 Channel，继续读取 `runtime_config`。
- 迁移脚本为 3 个 Hermes Agent 自动绑定默认 Channel。

验收标准：

- admin 能在 Agent 表单里选择 Hermes Channel。
- 运行 Hermes 后 session 中能看到 Channel 信息。
- 修改 Channel 工具白名单后，绑定该 Channel 的 Agent 立即生效。

产出：Agent 负责职责，Channel 负责能力，二者边界清晰。

## 阶段 21：部署、密钥和持久化生产化

目标：把当前验证部署收口为可长期运行、可备份恢复、密钥不裸露的生产形态。

当前风险：

- 当前测试机只有 `backend` 和 `frontend` 两个容器，没有 Hermes 独立容器。
- 当前容器没有 restart policy。
- 当前数据目录在 `/tmp/itops-agent-runtime-stage10/backend/data`，不适合作为长期生产目录。
- 当前 `HERMES_API_KEY` 以容器环境变量存在，可通过 `docker inspect` 看到。
- 备份服务启用但尚未形成备份文件和恢复演练记录。

工作项：

- 制定生产目录：
  - `/opt/itops-agent-platform/data`
  - `/opt/itops-agent-platform/backups`
  - `/opt/itops-agent-platform/config`
  - `/opt/itops-agent-platform/secrets`
- 更新 compose：
  - 使用稳定 bind mount 或 named volume。
  - 设置 `restart: unless-stopped`。
  - 增加 healthcheck。
  - 增加日志轮转。
- 密钥改为 secret reference：
  - 支持 `HERMES_API_KEY_FILE`。
  - Channel 保存 `api_key_ref`，不保存明文。
  - 页面不回显密钥。
- 备份闭环：
  - 创建一次手动备份。
  - 验证压缩包/DB 可读。
  - 记录恢复演练步骤。
  - 增加定时备份和保留策略。
- SQLite 维护：
  - WAL checkpoint。
  - 数据库大小监控。
  - 备份前确保一致性。
- 文档更新：
  - 生产部署文档。
  - 备份恢复文档。
  - Hermes Channel 运维手册。

验收标准：

- 重启机器后服务自动恢复。
- 删除并重建容器后数据仍存在。
- 备份文件可下载、可校验、可恢复。
- `docker inspect` 不暴露 Hermes 明文 API key。
- Channel 页面能显示密钥引用状态，但不显示密钥值。

产出：Hermes 能力管理和平台数据进入可长期运行状态。

## 推荐实施顺序

```text
阶段 17：Hermes Channel 管理入口
阶段 20：Channel 与 Agent 绑定
阶段 21：部署、密钥和持久化生产化
阶段 18：MCP Server Registry
阶段 19：Skill Pack Registry
```

原因：

- 先有 Channel，Agent 才有可绑定的能力入口。
- 先完成 Channel 绑定和生产持久化，避免后续 MCP/Skills 配置继续散落。
- MCP 和 Skills 都应挂到 Channel 上，而不是直接塞进 Agent。

## 最小可用切片

第一步建议只做阶段 17 的最小版本：

```text
新增 hermes_channels
  -> 初始化 3 个默认 Channel
  -> Channel API
  -> Hermes 控制台 Channel 列表/详情/连接测试
  -> Runtime Adapter 兼容读取 Channel 或旧 runtime_config
```

这一切片完成后，Hermes 管理会从“改 Agent 表单里的 runtime_config”升级为“管理 Channel”。
