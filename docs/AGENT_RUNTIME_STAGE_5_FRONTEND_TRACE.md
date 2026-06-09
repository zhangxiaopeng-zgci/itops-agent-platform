# Agent Runtime Evolution - Stage 5 Runtime UI And Trace

阶段 5 把 Hermes Runtime 从后端能力推进到可操作形态：

- Agent 编辑页可配置 runtime。
- Hermes 可在保存前测试连接。
- Agent 测试执行会持久化 runtime metadata 和 trace。
- Agent 详情页可查看执行 trace 摘要。

## 前端 Runtime 配置

Agent 编辑弹窗新增 Runtime 区域：

- `runtime`: `llm`、`builtin`、`custom_http`、`hermes`
- `autonomy_level`: `suggest`、`read_only`、`approval_required`、`auto`
- Hermes 配置：
  - `baseUrl`
  - `model`
  - `apiKeyEnv`
  - `timeoutMs`
  - `maxToolRounds`
  - `allowedTools`

API key 不在页面中输入明文，只填写环境变量名，例如 `HERMES_API_KEY`。

## Hermes 连接测试

新增接口：

```text
POST /api/agents/runtime/hermes/test-connection
```

请求体：

```json
{
  "runtime_config": {
    "baseUrl": "https://your-openai-compatible-endpoint/v1",
    "model": "smart-router",
    "apiKeyEnv": "HERMES_API_KEY"
  }
}
```

后端会：

1. 从 `runtime_config.baseUrl` 或 `HERMES_API_BASE` 获取 endpoint。
2. 从 `apiKeyEnv` 指定的环境变量读取 API key。
3. 发送一个短的 OpenAI-compatible `/chat/completions` 请求。
4. 返回是否成功、模型、延迟和简短响应。

## Trace 持久化

`executeAgentNode` 仍保持兼容，返回字符串输出。

新增内部函数：

```text
executeAgentRun(...)
```

Agent 测试接口使用完整结果，并把以下内容保存到 `agent_executions.metadata`：

- `runtime`
- `runtimeMetadata`
- `trace`
- `context`
- `serverId/serverIds`

Agent 详情页的执行历史会展示 runtime 标签和最多 5 条 trace 摘要。

## 当前限制

- Workflow 执行路径仍只消费字符串输出，trace 还未写入 task log。
- `custom_http` 的结构化配置 UI 还未展开。
- `approval_required` 尚未进入人工审批表。

## 下一步

阶段 6 建议进入审批与可回放执行：

- 新增 approval task 表。
- Tool API 对 `approval_required` 生成待审批记录。
- 前端增加审批队列。
- Agent execution detail 支持完整 trace 展开和重放。
