# Agent Runtime Evolution - Stage 21a Deployment Hardening

阶段 21a 是在继续 MCP / Skills 之前，对当前测试部署做最小生产化收口。

## 目标

- 数据不再依赖 `/tmp` 目录。
- 容器重启策略可自动恢复。
- Hermes API key 不再通过 `docker inspect` 暴露明文。
- 备份目录稳定，并完成一次手动备份验证。
- 不改变现有业务数据和 Hermes Channel/Agent 绑定。

## 当前部署目录

```text
/opt/itops-agent-platform/app
/opt/itops-agent-platform/data
/opt/itops-agent-platform/backups
/opt/itops-agent-platform/secrets
```

当前容器挂载：

```text
backend:
  /opt/itops-agent-platform/app/backend -> /app
  /opt/itops-agent-platform/data        -> /app/data
  /opt/itops-agent-platform/backups     -> /app/backups
  /opt/itops-agent-platform/secrets     -> /run/secrets:ro

frontend:
  /opt/itops-agent-platform/app/frontend -> /app
```

容器策略：

```text
backend:  restart unless-stopped
frontend: restart unless-stopped
```

## Secret File

Hermes Runtime 现在支持：

```text
HERMES_API_KEY
HERMES_API_KEY_FILE
```

解析顺序：

1. 先读取 `HERMES_API_KEY`。
2. 如果没有，再读取 `HERMES_API_KEY_FILE` 指向的文件。

当前部署使用：

```text
HERMES_API_KEY_FILE=/run/secrets/hermes_api_key
```

Channel 中仍保存密钥引用：

```text
api_key_ref = HERMES_API_KEY
```

这样 Channel 不需要知道 secret file 的真实路径，也不保存明文 key。

## 验证结果

- `/health/ready` 返回 healthy。
- 3 个 Hermes Channel 连接测试通过：
  - `hermes-channel-diagnose`
  - `hermes-channel-remediate`
  - `hermes-channel-review`
- `docker inspect backend` 不再显示 `HERMES_API_KEY=...`。
- `docker inspect backend` 只显示：

```text
HERMES_API_KEY_FILE=/run/secrets/hermes_api_key
```

- 手动备份已通过 `/api/backups/create` 创建。
- 备份 gzip 校验通过。

## 当前保留的边界

阶段 21a 仍保留当前开发式启动方式：

```text
npm run build
npm start
npm run dev -- --host 0.0.0.0
```

阶段 21b 再继续收口：

- 使用 compose 或 systemd 固化容器创建命令。
- 使用生产镜像或明确 build pipeline。
- 增加正式 healthcheck。
- 增加备份恢复演练文档。
- 增加 WAL checkpoint / restore 流程。
- 将 `/opt/itops-agent-platform/secrets` 权限进一步收紧。
