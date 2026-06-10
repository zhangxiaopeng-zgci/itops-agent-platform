# 阶段 22：Hermes 三 Worker Runtime 基线

## 目标

阶段 22 将 Hermes Runtime 从 backend 直接调用外部模型，升级为优先路由到三个真实 Worker 实例：

- `hermes-diagnose`
- `hermes-remediate`
- `hermes-evolve`

backend 继续负责工具执行、审批、审计和 trace。Worker 只负责 LLM 推理调用。

## Worker 接口

每个 Worker 暴露：

```text
GET  /health
GET  /capabilities
POST /run
```

`/run` 接收 OpenAI-compatible chat completion body，并调用 Worker 自己配置的上游：

```text
HERMES_API_BASE
HERMES_API_KEY_FILE
HERMES_MODEL
```

## Runtime Router

backend 根据 Channel type 路由：

| Channel Type | Worker URL 环境变量 |
| --- | --- |
| `diagnose` | `HERMES_WORKER_DIAGNOSE_URL` |
| `remediate` | `HERMES_WORKER_REMEDIATE_URL` |
| `review` | `HERMES_WORKER_EVOLVE_URL` |

如果 Worker 不可用，默认 fallback 到 backend 内置 Hermes Runtime。

可通过以下环境变量关闭 fallback：

```text
HERMES_WORKER_FALLBACK_ENABLED=false
```

## 容器启动示例

```bash
docker run -d --name hermes-diagnose \
  --restart unless-stopped \
  --workdir /app \
  -v /opt/itops-agent-platform/app/backend:/app \
  -v /opt/itops-agent-platform/secrets:/run/secrets:ro \
  -e HERMES_WORKER_ROLE=diagnose \
  -e HERMES_WORKER_PORT=4101 \
  -e HERMES_API_BASE=https://hub.zgci.org/v1 \
  -e HERMES_MODEL=smart-router \
  -e HERMES_API_KEY_FILE=/run/secrets/hermes_api_key \
  -p 4101:4101 \
  node:20 node dist/hermesWorker.js
```

`remediate` 和 `evolve` 只需要调整：

```text
HERMES_WORKER_ROLE
HERMES_WORKER_PORT
container name
port mapping
```

backend 需要配置：

```text
HERMES_WORKER_DIAGNOSE_URL=http://10.1.132.58:4101
HERMES_WORKER_REMEDIATE_URL=http://10.1.132.58:4102
HERMES_WORKER_EVOLVE_URL=http://10.1.132.58:4103
```

## 观测入口

新增：

```text
GET /api/hermes-workers
GET /api/hermes-workers/definitions
```

Hermes 控制台展示三个 Worker 的：

- role
- channel type
- configured
- health
- latency
- URL

Hermes Agent 执行 metadata 新增：

```json
{
  "worker": {
    "attempted": true,
    "used": true,
    "fallbackUsed": false,
    "role": "diagnose",
    "url": "http://10.1.132.58:4101",
    "latencyMs": 1234
  }
}
```

## 安全边界

- Worker 不连接平台数据库。
- Worker 不执行 Tool API。
- Worker 不绕过 Approval。
- Worker 不保存 API key 明文，只读取 secret file。
- backend fallback 保留，用于切换期高可用。

## 阶段 22 结论

阶段 22 完成后，Hermes 具备真实三实例 Runtime 架构。后续阶段 23 可以继续补 Worker heartbeat、run history、错误率和版本观测。

阶段 23 已在此基础上补充 Worker registry、heartbeat 和 run history，详见：

```text
docs/AGENT_RUNTIME_STAGE_23_WORKER_OBSERVABILITY.md
```
