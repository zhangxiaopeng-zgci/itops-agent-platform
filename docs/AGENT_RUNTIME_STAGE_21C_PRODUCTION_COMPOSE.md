# 阶段 21c：生产化 Compose 与容器网络收口

## 目标

阶段 21c 将当前测试机从开发式容器启动方式收口到生产式 Compose：

- frontend 使用 nginx 静态生产包，不再运行 Vite dev server。
- backend 使用生产 build，不再每次启动时 `npm run build`。
- 三个 Hermes Worker 纳入同一个 Compose。
- backend / frontend / Worker 共享固定 Docker network。
- `/api` 和 `/socket.io` 通过 nginx 反代到 `backend:3001`。
- backend 通过服务名访问 Worker：
  - `http://hermes-diagnose:4101`
  - `http://hermes-remediate:4102`
  - `http://hermes-evolve:4103`

## Compose 文件

新增：

```text
docker-compose.hermes.yml
```

服务：

| 服务 | 容器名 | 端口 | 说明 |
| --- | --- | --- | --- |
| `frontend` | `frontend` | `3000:80` | nginx 静态前端 |
| `backend` | `backend` | `3001:3001` | backend 控制面 |
| `hermes-diagnose` | `hermes-diagnose` | `4101:4101` | 诊断 Worker |
| `hermes-remediate` | `hermes-remediate` | `4102:4102` | 修复编排 Worker |
| `hermes-evolve` | `hermes-evolve` | `4103:4103` | 复盘进化 Worker |

网络：

```text
itops-runtime
```

## 数据与 Secret

保留当前生产化目录：

```text
/opt/itops-agent-platform/data     -> /app/data
/opt/itops-agent-platform/backups  -> /app/backups
/opt/itops-agent-platform/secrets  -> /run/secrets:ro
```

Hermes API key 仍通过文件引用：

```text
HERMES_API_KEY_FILE=/run/secrets/hermes_api_key
```

backend image 会在 entrypoint 中把 root-only secret 文件复制到容器内临时只读路径，再降权运行。这样 appuser 可以读取 secret，同时不会通过 `docker inspect` 暴露明文 key。

## 部署步骤

```bash
cd /opt/itops-agent-platform/app

# 1. 创建备份
curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Admin@123"}'

# 2. 构建镜像
docker compose -f docker-compose.hermes.yml build

# 3. 替换旧开发式容器
docker rm -f frontend backend hermes-diagnose hermes-remediate hermes-evolve

# 4. 启动生产式 compose
docker compose -f docker-compose.hermes.yml up -d
```

## 验收标准

- `http://10.1.132.58:3000` 可访问。
- 首页 HTML 不包含 Vite dev client。
- `POST http://127.0.0.1:3000/api/auth/login` 返回 200。
- `GET http://127.0.0.1:3001/health/ready` 返回 ready。
- `GET http://127.0.0.1:3001/api/hermes-workers` 能看到三个 Worker healthy。
- `docker exec frontend getent hosts backend` 能解析。
- `docker exec backend getent hosts hermes-diagnose` 能解析。
- `docker inspect backend` 不出现 `HERMES_API_KEY=...` 明文。

## 回滚方式

如果生产式 compose 启动失败：

```bash
docker compose -f docker-compose.hermes.yml logs --tail=200
docker compose -f docker-compose.hermes.yml down
```

保留的数据目录不会被删除：

```text
/opt/itops-agent-platform/data
/opt/itops-agent-platform/backups
/opt/itops-agent-platform/secrets
```

必要时可使用阶段 21b 的备份恢复流程恢复数据库。
