# Agent Runtime Evolution - Stage 4 Hermes Runtime

阶段 4 增加 `hermes` Runtime Adapter，并把 Hermes 的 tool call 接回 ITOps Tool API。

## 架构结果

```text
executeAgentNode
  -> AgentRuntimeRegistry
    -> HermesAgentRuntime
      -> OpenAI-compatible /chat/completions
      -> tool_calls
      -> Tool API invokeTool(...)
      -> PolicyGuard + audit_logs + ITOps execution
      -> tool result back to Hermes
      -> final answer
```

Hermes 只负责推理、规划、总结和决定是否请求工具。工具是否可执行、如何执行、如何审计，仍由 ITOps 控制面决定。

## Runtime 配置

Agent 配置：

```json
{
  "runtime": "hermes",
  "runtime_config": {
    "baseUrl": "https://your-openai-compatible-endpoint/v1",
    "model": "smart-router",
    "apiKeyEnv": "HERMES_API_KEY",
    "timeoutMs": 300000,
    "maxToolRounds": 3,
    "allowedTools": [
      "list_servers",
      "query_alerts",
      "search_knowledge_base",
      "run_readonly_command"
    ]
  },
  "autonomy_level": "read_only"
}
```

环境变量：

```bash
export HERMES_API_KEY="..."
export HERMES_API_BASE="https://your-openai-compatible-endpoint/v1"
```

API key 只从环境变量读取，不写入数据库、不写入文档、不写入 git。

## Tool Call 闭环

`HermesAgentRuntime` 会把阶段 3 的 `GET /api/tools` 等价工具目录转换为 OpenAI-compatible tool definitions：

```json
{
  "type": "function",
  "function": {
    "name": "query_alerts",
    "description": "...",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  }
}
```

当 Hermes 返回 `tool_calls`：

1. Adapter 解析 tool name 和 JSON arguments。
2. Adapter 调用 `invokeTool(name, input, context)`。
3. Tool API 进行角色、风险等级、命令 allowlist 和敏感文件检查。
4. 调用结果写入 `audit_logs`。
5. Adapter 以 `tool` message 把结果回传 Hermes。
6. Hermes 返回最终输出。

## 安全边界

当前默认只暴露 `read_only` 工具。即使 `runtime_config.allowedTools` 配置了更多工具，Adapter 也会过滤掉非 `read_only` 工具。

如果工具返回：

- `denied`：Hermes 收到拒绝结果，只能解释原因并给出安全建议。
- `approval_required`：Hermes 收到待审批结果，不能继续假装已经执行。
- `allowed`：工具正常执行，结果进入最终回答。

## 下一步

阶段 5 建议做：

- 在前端 Agent 编辑页增加 Runtime 配置 UI。
- 增加 Hermes 连接测试接口。
- 增加 `agent_executions.metadata` 中 trace/tool call 的完整保存。
- 引入审批任务表，让 `approval_required` 可以进入人工审批流。
