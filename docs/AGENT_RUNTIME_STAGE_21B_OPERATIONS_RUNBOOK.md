# 阶段 21b：运维化收口

## 目标

阶段 21b 在 21a 的部署硬化基础上，补齐长期运行所需的运维闭环：

- 备份恢复演练。
- MCP / Skill 能力包导入导出。
- 健康巡检。
- Hermes Channel 运维手册。

## 当前部署约定

测试部署机器：

```text
10.1.132.58
```

生产化目录：

```text
/opt/itops-agent-platform/app
/opt/itops-agent-platform/data
/opt/itops-agent-platform/backups
/opt/itops-agent-platform/secrets
```

容器：

```text
backend
frontend
```

当前没有单独的 Hermes 容器。Hermes 是通过 backend 中的 Hermes Runtime Adapter 调用外部 OpenAI-compatible endpoint。

## MCP / Skill 能力包导入导出

新增能力包格式：

```json
{
  "kind": "itops-agent-platform.hermes-capabilities",
  "version": 1,
  "exportedAt": "2026-06-10T00:00:00.000Z",
  "skills": [],
  "mcpServers": [],
  "channelSkillBindings": [],
  "channelMcpServerBindings": []
}
```

API：

```text
GET  /api/import-export/hermes-capabilities/export
POST /api/import-export/hermes-capabilities/import
```

导出内容包含：

- Skill Pack。
- MCP Server registry。
- Channel 到 Skill 的绑定。
- Channel 到 MCP Server 的绑定。

导出内容不包含：

- API key 明文。
- secret 文件内容。
- runtime 临时 trace。
- Agent execution 历史。

导入策略：

- 使用 `id` 做 upsert。
- 只导入已经存在的 Channel 绑定。
- `secret_ref` 只作为引用保留，不导入密钥值。
- MCP `tool_import_mode` 默认仍是 `disabled`。

## 备份恢复演练

创建手动备份：

```bash
TOKEN="$(curl -s -X POST http://127.0.0.1:3001/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Admin@123"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"], end="")')"

curl -s -X POST http://127.0.0.1:3001/api/backups/create \
  -H "authorization: Bearer $TOKEN"
```

校验备份文件：

```bash
ls -lh /opt/itops-agent-platform/backups
gzip -t /opt/itops-agent-platform/backups/*.gz
```

恢复演练建议使用隔离 DB，不要直接覆盖生产 DB：

```bash
mkdir -p /tmp/itops-restore-drill
gzip -dc /opt/itops-agent-platform/backups/<backup>.db.gz \
  > /tmp/itops-restore-drill/app.db

docker run --rm \
  -v /tmp/itops-restore-drill:/restore \
  -w /restore \
  node:20 sh -lc "node -e \"
    const Database=require('better-sqlite3');
    const db=new Database('/restore/app.db', {readonly:true});
    console.log(db.prepare('PRAGMA integrity_check').get());
    console.log(db.prepare(\\\"SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'\\\").get());
    db.close();
  \""
```

正式恢复入口：

```text
POST /api/backups/restore/:id
```

正式恢复会：

- 校验备份完整性。
- 保存当前 DB 的 pre-restore 副本。
- 覆盖数据库文件。
- 删除 WAL/SHM。
- 触发 backend graceful restart。

阶段 21b 起，备份服务在复制 SQLite 主库文件前会执行：

```text
PRAGMA wal_checkpoint(TRUNCATE)
```

这样可以避免新迁移或近期写入仍停留在 WAL 中，导致隔离恢复时出现主库文件缺表或缺数据。

## 健康巡检

公开健康检查：

```text
GET /health/live
GET /health/ready
GET /health
```

认证后健康摘要：

```text
GET /api/health/summary
GET /api/health/history
```

阶段 21b 新增 `hermes_capability_registry` 服务巡检项：

```text
enabled channels
enabled skills
enabled MCP servers
```

巡检命令：

```bash
curl -s http://127.0.0.1:3001/health/ready
curl -s http://127.0.0.1:3001/health | python3 -m json.tool
docker ps --format '{{.Names}} {{.Status}}'
docker inspect backend --format '{{json .Config.Env}}' | grep -E 'HERMES_API_KEY=' && echo "BAD: plaintext key found" || echo "OK: no plaintext key"
```

## 日常运维清单

每日：

- 查看 `/health/ready`。
- 查看 `backend` / `frontend` 容器状态。
- 查看最近一次备份时间和备份是否 verified。
- 查看 Hermes Channel 健康状态。

每周：

- 导出 Hermes capability bundle。
- 做一次隔离恢复演练。
- 检查 `/opt/itops-agent-platform/backups` 空间。
- 检查 MCP Server 中是否仍有无用或失败连接器。

变更前：

- 创建手动备份。
- 导出 Hermes capability bundle。
- 记录当前 commit 和镜像/容器启动参数。

变更后：

- 检查 `/health/ready`。
- 登录 UI 检查 Hermes 控制台。
- 运行一次 Hermes Channel 连接测试。
- 抽查 Hermes Agent metadata 是否包含 Channel / Skill / MCP 摘要。

## 阶段 21b 结论

阶段 21b 完成后，平台具备了基本的运维闭环：

```text
备份 -> 校验 -> 隔离恢复演练
能力配置 -> 导出 -> 导入
健康检查 -> 巡检清单 -> 运行手册
```

后续还可以继续演进：

- docker compose / systemd 正式托管。
- 容器 healthcheck 和日志轮转配置文件化。
- 定时导出 Hermes capability bundle。
- MCP capabilities discovery 和 tool bridge。
