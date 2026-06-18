# Stage 31 / P11d Operations Handoff Runbook

本文档是 P11d 运维交付手册，面向接手测试机或单机生产化部署的管理员。

范围覆盖 P11-H01 到 P11-H05：

- 启动、停止、重启和升级。
- 备份、恢复和恢复演练。
- 容器重建和重建后验证。
- Hermes API key、model、worker、Channel、Skill、MCP 配置。
- 发布治理、Release Guard、审计导出和回滚。

## 1. 环境约定

当前测试机：

```text
Host: 10.1.132.58
App URL: http://10.1.132.58:3000
API URL: http://10.1.132.58:3001
SSH: ubuntu@10.1.132.58
App dir: /opt/itops-agent-platform/app
Data dir: /opt/itops-agent-platform/data
Backup dir: /opt/itops-agent-platform/backups
Secret dir: /opt/itops-agent-platform/secrets
Compose file: docker-compose.hermes.yml
```

核心容器：

```text
backend
frontend
hermes-diagnose
hermes-remediate
hermes-evolve
```

持久化边界：

| 数据 | 路径 | 说明 |
| --- | --- | --- |
| SQLite 主库 | `/opt/itops-agent-platform/data/app.db` | backend 容器内映射为 `/app/data/app.db` |
| 自动/手动备份 | `/opt/itops-agent-platform/backups` | backend 容器内映射为 `/app/backups` |
| Hermes API key | `/opt/itops-agent-platform/secrets/hermes_api_key` | 容器内只读挂载为 `/run/secrets/hermes_api_key` |
| Compose 环境变量 | `/opt/itops-agent-platform/app/.env` | `JWT_SECRET`、Hermes endpoint、change window 等 |

## 2. 管理员登录和 API Token

浏览器登录：

```text
URL: http://10.1.132.58:3000
```

命令行获取 token：

```bash
TOKEN=$(
  curl -sS -X POST http://127.0.0.1:3001/api/auth/login \
    -H 'content-type: application/json' \
    -d '{"username":"admin","password":"Admin@123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["token"])'
)
```

生产移交时必须修改默认密码，并为日常使用准备独立账号：

| 角色 | 用途 |
| --- | --- |
| viewer | 只读查看诊断、会话、审批、任务、生产就绪 |
| operator | 发起诊断、提交低风险动作和审批申请 |
| admin | 配置 Channel / Skill / MCP、审批、发布、回滚、备份恢复 |

## 3. 日常巡检

建议每天巡检一次，变更前后必须巡检一次。

### 3.1 容器健康

```bash
ssh ubuntu@10.1.132.58
cd /opt/itops-agent-platform/app
docker compose -f docker-compose.hermes.yml ps
```

预期：

- `backend` 为 running / healthy。
- `frontend` 为 running / healthy。
- `hermes-diagnose` 为 running / healthy。
- `hermes-remediate` 为 running / healthy。
- `hermes-evolve` 为 running / healthy。

### 3.2 应用健康

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/ops-readiness/summary
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-workers
```

重点看：

- `/health` 返回 `healthy`。
- `/api/ops-readiness/summary` 没有 `blockers`。
- `healthyHermesWorkers` 为 3。
- backup、restore drill、container rebuild drill 有最近通过记录。

### 3.3 页面巡检

浏览器打开：

- `/ops-readiness`
- `/hermes`
- `/agents`
- `/hermes-channels`
- `/workflows`
- `/evolution-proposals`
- `/big-screen`
- `/settings`

预期：

- 页面可加载。
- 无明显报错。
- Hermes Worker 显示 3/3 healthy。
- 浅色、深色、跟随系统主题显示正常。

## 4. 启停和重启

所有命令在测试机执行：

```bash
cd /opt/itops-agent-platform/app
```

### 4.1 启动

```bash
docker compose -f docker-compose.hermes.yml up -d
docker compose -f docker-compose.hermes.yml ps
```

### 4.2 停止

```bash
docker compose -f docker-compose.hermes.yml stop
```

只停止容器，不删除数据 volume 和宿主机持久化目录。

### 4.3 重启

```bash
docker compose -f docker-compose.hermes.yml restart backend frontend hermes-diagnose hermes-remediate hermes-evolve
docker compose -f docker-compose.hermes.yml ps
```

### 4.4 查看日志

```bash
docker compose -f docker-compose.hermes.yml logs --tail=200 backend
docker compose -f docker-compose.hermes.yml logs --tail=200 frontend
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-diagnose
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-remediate
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-evolve
```

持续跟踪：

```bash
docker compose -f docker-compose.hermes.yml logs -f backend hermes-diagnose hermes-remediate hermes-evolve
```

## 5. 升级流程

升级原则：

- 先备份，再拉代码或替换镜像。
- 先构建，再重启。
- 重启后必须完成健康检查、生产就绪检查和容器重建 drill 记录。

### 5.1 升级前备份

```bash
TOKEN=$(
  curl -sS -X POST http://127.0.0.1:3001/api/auth/login \
    -H 'content-type: application/json' \
    -d '{"username":"admin","password":"Admin@123"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["token"])'
)

curl -sS -X POST http://127.0.0.1:3001/api/backups/create \
  -H "authorization: Bearer $TOKEN"
```

确认备份：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/backups/status
```

### 5.2 更新代码

```bash
cd /opt/itops-agent-platform/app
git fetch origin
git status --short
git pull --ff-only
```

如果服务器上存在本地未提交修改，先停止升级并人工确认，不要执行强制 reset。

### 5.3 构建和重启

推荐使用 compose 构建：

```bash
docker compose -f docker-compose.hermes.yml build backend frontend hermes-diagnose hermes-remediate hermes-evolve
docker compose -f docker-compose.hermes.yml up -d
```

如果当前环境仍采用前端生产包手工写入镜像的方式，可使用既有兼容流程：

```bash
docker run --rm -v "$PWD/frontend:/app" -w /app node:20-alpine sh -c "npm run build"
CID=$(docker create app-frontend:latest)
docker cp frontend/dist/. "$CID:/usr/share/nginx/html"
docker commit "$CID" app-frontend:latest >/tmp/frontend-image-commit
docker rm "$CID"
docker compose -f docker-compose.hermes.yml up -d backend frontend
```

### 5.4 升级后验证

```bash
docker compose -f docker-compose.hermes.yml ps
curl -sS http://127.0.0.1:3001/health
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/ops-readiness/summary
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-workers
```

升级后浏览器验证：

- `/dashboard`
- `/ops-readiness`
- `/hermes`
- `/hermes-channels`
- `/evolution-proposals`

## 6. 备份、恢复和恢复演练

### 6.1 查看备份状态

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/backups/status
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/backups/history
```

### 6.2 创建手动备份

```bash
curl -sS -X POST http://127.0.0.1:3001/api/backups/create \
  -H "authorization: Bearer $TOKEN"
```

### 6.3 下载备份

```bash
BACKUP_ID=<backup-id>
curl -L -o "./${BACKUP_ID}.backup" \
  -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/backups/download/${BACKUP_ID}"
```

### 6.4 恢复演练

恢复演练用于证明备份可用，不应直接覆盖生产主库。

通过平台记录恢复演练：

```bash
BACKUP_ID=<backup-id>
curl -sS -X POST http://127.0.0.1:3001/api/backups/restore-drills \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{
    \"backupId\": \"${BACKUP_ID}\",
    \"drillType\": \"isolated_restore\",
    \"notes\": \"P11d scheduled restore drill\"
  }"
```

查看恢复演练：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/backups/restore-drills?limit=5"
```

### 6.5 正式恢复

正式恢复会影响当前运行数据，必须满足：

- 已经确认恢复目标备份。
- 已经通知操作者停止变更。
- 已经保留当前主库副本。
- 已经准备恢复后验证窗口。

执行前先停写：

```bash
docker compose -f docker-compose.hermes.yml stop frontend hermes-diagnose hermes-remediate hermes-evolve
```

执行恢复：

```bash
BACKUP_ID=<backup-id>
curl -sS -X POST "http://127.0.0.1:3001/api/backups/restore/${BACKUP_ID}" \
  -H "authorization: Bearer $TOKEN"
```

恢复后重启：

```bash
docker compose -f docker-compose.hermes.yml up -d
docker compose -f docker-compose.hermes.yml ps
curl -sS http://127.0.0.1:3001/health
```

## 7. 容器重建和重建演练

容器重建用于验证：删除或重建容器后，数据库、备份、Hermes 配置和网络 alias 仍可恢复。

### 7.1 保留数据的重建

```bash
cd /opt/itops-agent-platform/app
docker compose -f docker-compose.hermes.yml up -d --force-recreate \
  backend frontend hermes-diagnose hermes-remediate hermes-evolve
```

### 7.2 重建后验证

```bash
docker compose -f docker-compose.hermes.yml ps
curl -sS http://127.0.0.1:3001/health
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-workers
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/ops-readiness/summary
```

### 7.3 记录 container rebuild drill

```bash
curl -sS -X POST http://127.0.0.1:3001/api/ops-readiness/container-drills \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "externalRecreatePerformed": true,
    "notes": "P11d container rebuild drill after force-recreate"
  }'
```

查看记录：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/ops-readiness/container-drills?limit=5"
```

## 8. Hermes Worker 运维

### 8.1 Worker 角色

| 容器 | 端口 | 角色 | 用途 |
| --- | --- | --- | --- |
| `hermes-diagnose` | 4101 | diagnose | 诊断、证据收集、只读分析 |
| `hermes-remediate` | 4102 | remediate | 修复方案、审批型动作编排 |
| `hermes-evolve` | 4103 | evolve | 复盘、进化提案、改进建议 |

backend 通过 compose 网络访问：

```text
http://hermes-diagnose:4101
http://hermes-remediate:4102
http://hermes-evolve:4103
```

### 8.2 Worker 健康检查

宿主机：

```bash
curl -sS http://127.0.0.1:4101/health
curl -sS http://127.0.0.1:4102/health
curl -sS http://127.0.0.1:4103/health
```

平台 API：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-workers
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/hermes-workers/runs?limit=20"
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/hermes-workers/heartbeats?limit=20"
```

### 8.3 Hermes API key 轮换

密钥文件：

```bash
sudo install -m 600 -o ubuntu -g ubuntu /dev/null /opt/itops-agent-platform/secrets/hermes_api_key
sudo sh -c 'printf "%s" "<new-hermes-api-key>" > /opt/itops-agent-platform/secrets/hermes_api_key'
```

重启使用 Hermes 的容器：

```bash
cd /opt/itops-agent-platform/app
docker compose -f docker-compose.hermes.yml restart backend hermes-diagnose hermes-remediate hermes-evolve
```

验证：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-workers
```

浏览器进入 `/hermes-channels`，对三个 Channel 执行连接测试。

### 8.4 Hermes model 和 endpoint

Compose 读取：

```text
HERMES_API_BASE
HERMES_MODEL
HERMES_API_KEY_FILE
```

修改方式：

```bash
cd /opt/itops-agent-platform/app
vi .env
docker compose -f docker-compose.hermes.yml up -d backend hermes-diagnose hermes-remediate hermes-evolve
```

## 9. Channel / Skill / MCP 管理

### 9.1 管理入口

浏览器：

- `/hermes-channels`：数字运维团队控制台，查看 Channel、Skill、MCP、Worker、Release 覆盖。
- `/agents`：Agent 绑定 Channel。
- `/hermes`：操作者使用入口。

API：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-channels
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/skills
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/mcp-servers
curl -sS -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/hermes-control-plane/overview
```

### 9.2 Channel 配置原则

| Channel | 建议工具边界 | 风险边界 |
| --- | --- | --- |
| 诊断通道 | 服务器列表、告警查询、知识库、只读命令 | 不提交修复审批 |
| 修复编排通道 | 工作流列表、提交审批、任务状态、验证修复 | 不绕过审批直接改生产 |
| 复盘通道 | 会话、trace、审批、任务、audit、提案生成 | 不直接发布 release |

### 9.3 Skill 管理原则

Skill 是 Hermes 的运维方法论，不是直接执行器。

变更 Skill 前：

- 明确适用 Channel。
- 写清风险说明。
- 写清验证方法。
- 写清回滚指导。
- 先在低风险 prompt 上验证输出。

API 示例：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/skills?enabled=true"
```

### 9.4 MCP 管理原则

MCP Server 目前作为能力注册和上下文管理入口，默认工具导入模式应保持保守。

新增 MCP 前：

- 确认传输方式：`stdio`、`http` 或 `sse`。
- 确认网络可达性。
- 确认鉴权方式。
- 确认是否允许绑定到 Channel。
- 确认 tool import mode 是否仍为 `disabled`。

测试 MCP：

```bash
MCP_ID=<mcp-server-id>
curl -sS -X POST "http://127.0.0.1:3001/api/mcp-servers/${MCP_ID}/test" \
  -H "authorization: Bearer $TOKEN"
```

### 9.5 能力包导出和导入

导出 Hermes capability bundle：

```bash
curl -L -o hermes-capabilities.json \
  -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:3001/api/import-export/hermes-capabilities/export
```

导入前必须人工检查 JSON：

- Channel 是否存在或可创建。
- Skill 是否启用。
- MCP Server 是否指向正确环境。
- 不导入未知高风险工具边界。

导入：

```bash
curl -sS -X POST http://127.0.0.1:3001/api/import-export/hermes-capabilities/import \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d @hermes-capabilities.json
```

## 10. Hermes 操作者使用闭环

操作者入口：

```text
/hermes
```

推荐流程：

1. 选择模式：诊断问题、修复编排、复盘优化。
2. 选择上下文：服务器、告警、工作流、知识库分类。
3. 使用快捷 prompt。
4. 查看 Hermes 输出、runtime、trace 摘要。
5. 如果产生 approvalId，进入工具审批。
6. 如果产生 taskId，进入任务详情。
7. 验证修复。
8. 使用复盘 Agent 生成改进建议或 evolution proposal。

安全边界：

- viewer 只能只读诊断和查看结果。
- operator 可以提交诊断、低风险动作、审批申请。
- admin 可以审批、配置 runtime、发布和回滚。

## 11. 发布治理和回滚

### 11.1 标准发布流程

```text
proposal
  -> enrich
  -> evaluate
  -> staging replay
  -> release guard
  -> admin approval
  -> publish
  -> audit export
  -> monitor
```

常用 API：

```bash
PROPOSAL_ID=<proposal-id>

curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/enrich" \
  -H "authorization: Bearer $TOKEN"

curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/evaluate" \
  -H "authorization: Bearer $TOKEN"

curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/staging-replay" \
  -H "authorization: Bearer $TOKEN"

curl -sS "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/release-guard" \
  -H "authorization: Bearer $TOKEN"
```

审批 proposal：

```bash
curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/status" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"status":"approved","comment":"Approved for controlled release"}'
```

发布：

```bash
curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/${PROPOSAL_ID}/publish" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"comment":"Published after release guard passed"}'
```

### 11.2 Release Guard blocked 处理

Release Guard blocked 时不要绕过。按 blocker 处理：

| blocker | 处理方式 |
| --- | --- |
| `proposal_approved` | 由 admin 审批 proposal |
| `evaluation_passed` | 重新运行 evaluation，或修复 proposal |
| `structured_patch_valid` | 补齐 structured patch |
| `semantic_guard_passed` | 补齐 Skill / Workflow 语义边界 |
| `rollback_boundary_valid` | 补齐 rollback guidance |
| `dataset_regression_present` | 运行 evaluation 生成 dataset regression |
| `staging_replay_present` | 运行 staging replay |
| `shadow_no_production_mutation` | 确认 staging replay 是 shadow overlay |
| `high_risk_change_window_open` | 等待变更窗口或调整变更窗口配置 |
| `high_risk_dual_approval` | 使用不同管理员完成审查和发布 |
| `high_risk_rollback_plan` | 补齐 rollback plan |

### 11.3 变更窗口

环境变量：

```text
EVOLUTION_RELEASE_CHANGE_WINDOW_ENABLED
EVOLUTION_RELEASE_CHANGE_WINDOW_DAYS
EVOLUTION_RELEASE_CHANGE_WINDOW_START
EVOLUTION_RELEASE_CHANGE_WINDOW_END
EVOLUTION_RELEASE_CHANGE_WINDOW_TIMEZONE
```

修改后重启 backend：

```bash
docker compose -f docker-compose.hermes.yml up -d backend
```

### 11.4 发布审计导出

```bash
VERSION_ID=<release-version-id>

curl -L -o release-audit.json \
  -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/evolution-proposals/releases/versions/${VERSION_ID}/audit?format=json"

curl -L -o release-audit.md \
  -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/evolution-proposals/releases/versions/${VERSION_ID}/audit?format=markdown"
```

### 11.5 回滚 release overlay

只允许 admin 回滚。

```bash
VERSION_ID=<active-release-version-id>

curl -sS -X POST "http://127.0.0.1:3001/api/evolution-proposals/releases/versions/${VERSION_ID}/rollback" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"reason":"Rollback after validation failure"}'
```

验证：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/evolution-proposals/releases/versions/${VERSION_ID}/events"
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/evolution-proposals/releases/versions?status=active"
```

运行态语义：

- 发布只影响 release overlay 注入。
- 不直接改写 Skill / Workflow / MCP / Policy / Prompt 源表。
- 回滚会让下一次 Hermes Runtime 不再注入已回滚 overlay。

## 12. 工具审批和任务闭环

查看审批：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/tool-approvals?limit=20"
```

批准审批：

```bash
APPROVAL_ID=<approval-id>
curl -sS -X POST "http://127.0.0.1:3001/api/tool-approvals/${APPROVAL_ID}/approve" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"comment":"Approved after reviewing scope, risk, rollback and verification"}'
```

拒绝审批：

```bash
curl -sS -X POST "http://127.0.0.1:3001/api/tool-approvals/${APPROVAL_ID}/reject" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"comment":"Rejected: missing rollback plan or target scope"}'
```

审批前必须确认：

- 目标范围。
- 影响面。
- 风险等级。
- 回滚计划。
- 验证方式。
- 是否在变更窗口内。

## 13. 常见故障处理

### 13.1 backend 不健康

```bash
docker compose -f docker-compose.hermes.yml logs --tail=200 backend
curl -sS http://127.0.0.1:3001/health
```

优先检查：

- `.env` 中 `JWT_SECRET` 是否存在。
- `/opt/itops-agent-platform/data` 是否可写。
- 数据库文件是否损坏。
- backend 是否能访问 Hermes Worker 服务名。

### 13.2 frontend 可访问但 API 报错

检查：

```bash
docker compose -f docker-compose.hermes.yml ps backend frontend
curl -sS http://127.0.0.1:3001/health
```

常见原因：

- backend 未健康。
- `ALLOWED_ORIGINS` 未包含当前访问域名。
- 前端镜像不是最新生产包。

### 13.3 Hermes Worker 不健康

```bash
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-diagnose
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-remediate
docker compose -f docker-compose.hermes.yml logs --tail=200 hermes-evolve
ls -l /opt/itops-agent-platform/secrets/hermes_api_key
```

常见原因：

- `hermes_api_key` 缺失或不可读。
- `HERMES_API_BASE` 不可达。
- `HERMES_MODEL` 不存在或被上游拒绝。
- Worker 容器未重启加载新配置。

### 13.4 active_release_tracking warning

含义：当前没有 active release overlay。

处理：

- 如果当前还没有完成受控发布，这是非阻断 warning。
- 如果期望有 active release，检查 release versions：

```bash
curl -sS -H "authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/evolution-proposals/releases/versions?status=active"
```

### 13.5 数据恢复后页面异常

处理顺序：

1. 确认 backend health。
2. 确认数据库路径。
3. 查看 backend 日志是否有 migration 或 SQLite 错误。
4. 确认 frontend 静态包版本是否和 backend schema 兼容。
5. 必要时回滚到恢复前备份。

## 14. 运维交付检查表

移交前必须完成：

- [ ] admin 默认密码已修改。
- [ ] viewer/operator/admin 三类账号已准备。
- [ ] `docker compose ps` 五个核心容器 healthy。
- [ ] `/health` 返回 healthy。
- [ ] `/api/ops-readiness/summary` 无 blocker。
- [ ] 最近一次 backup verified。
- [ ] 最近一次 restore drill passed。
- [ ] 最近一次 container rebuild drill passed。
- [ ] 三个 Hermes Worker healthy。
- [ ] `/hermes-channels` 可看到 Channel / Skill / MCP / Worker 摘要。
- [ ] Hermes API key 轮换步骤已验证或演示。
- [ ] capability bundle 已导出并归档。
- [ ] release audit JSON / Markdown 可导出。
- [ ] rollback 操作步骤已演示或记录。
- [ ] 当前 warning 已写入验收报告。

## 15. P11-H 验收映射

| 验收项 | 手册章节 | 结论 |
| --- | --- | --- |
| P11-H01 启停升级手册 | 第 4、5 章 | pass |
| P11-H02 备份恢复手册 | 第 6 章 | pass |
| P11-H03 容器重建手册 | 第 7 章 | pass |
| P11-H04 Hermes 配置手册 | 第 8、9、10 章 | pass |
| P11-H05 发布治理手册 | 第 11、12 章 | pass |
