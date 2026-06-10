# 阶段 18：MCP Server Registry

## 目标

阶段 18 将 MCP Server 从“未来可接入能力”变成 Hermes Channel 下的受控连接器清单。当前阶段只做注册、测试、启停和 Channel 绑定，不直接开放 MCP tool execution。

## 本阶段范围

- 新增 MCP Server 注册表。
- 新增 Hermes Channel 与 MCP Server 的绑定关系。
- 新增 MCP Server API。
- Hermes Channel 响应中展示已绑定 MCP Server。
- Hermes Runtime metadata 记录 Channel 当前绑定的 MCP Server 摘要。
- Hermes 控制台支持：
  - 登记 MCP Server。
  - 测试 MCP Server。
  - 将 MCP Server 绑定到 Channel。

## 数据模型

新增表：

- `mcp_servers`
  - 保存 MCP Server 的名称、说明、transport、URL/command、密钥引用、超时、健康状态和能力摘要。
- `hermes_channel_mcp_servers`
  - 保存 Channel 与 MCP Server 的绑定。
  - `tool_import_mode` 默认是 `disabled`。

支持 transport：

- `http`
- `sse`
- `stdio`

## API

新增：

```text
GET  /api/mcp-servers
GET  /api/mcp-servers/:id
POST /api/mcp-servers
PUT  /api/mcp-servers/:id
POST /api/mcp-servers/:id/test
PUT  /api/hermes-channels/:id/mcp-servers
```

扩展：

```text
GET /api/hermes-channels
PUT /api/hermes-channels/:id
```

Channel 响应新增 `mcpServers` 字段，Channel 更新请求可携带 `mcpServers: string[]` 保存绑定。

## 测试策略

- `http` / `sse`：对配置 URL 做轻量 HTTP GET，用于确认端点可达。
- `stdio`：只验证 command 配置存在，不启动本地进程。

这是有意限制：阶段 18 的重点是 Registry 和安全边界，不是 MCP 执行器。

## Runtime 行为

Hermes Runtime 当前只读取 Channel 绑定的 MCP Server 并写入 metadata：

```json
{
  "mcpServers": [
    {
      "id": "...",
      "name": "...",
      "transport": "http",
      "toolImportMode": "disabled",
      "healthStatus": "healthy"
    }
  ]
}
```

MCP tools 不会出现在 Hermes tool list，也不会绕过 Tool Policy、Approval 或 Audit。

## 后续演进

阶段 18b/18c 可以继续补：

- MCP capabilities discovery。
- MCP tools/resources/prompts 缓存。
- admin 显式启用 tool import。
- 将 MCP tool 映射为 ITOps Tool API 工具描述。
- MCP tool 调用接入 PolicyGuard、Approval、Audit 和 Trace。

## 阶段 18 结论

本阶段完成后，Hermes Channel 的能力模型变为：

```text
Hermes Channel
  -> Runtime 连接
  -> Tool 白名单
  -> Skill Pack
  -> MCP Server Registry
  -> Policy / Approval
```

MCP 已具备可管理入口，但执行能力仍保持关闭，适合继续进入能力发现和 Tool Bridge 阶段。
