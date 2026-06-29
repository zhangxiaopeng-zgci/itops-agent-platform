# 测试指南

## 测试范围

本项目测试覆盖以下方面：

### 1. API 接口测试

启动服务后验证核心接口：

```bash
# 健康检查
curl http://localhost:3001/health

# 登录获取 Token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# 使用 Token 访问受保护接口
curl http://localhost:3001/api/agents \
  -H "Authorization: Bearer <token>"
```

### 2. Webhook 告警测试

项目提供了测试脚本：

```bash
# Windows PowerShell
cd examples
.\test-alerts.ps1

# Linux/Mac
cd examples
chmod +x test-alerts.sh && ./test-alerts.sh
```

### 3. Zabbix 集成测试

详见 `examples/zabbix/` 目录下的测试脚本和配置示例。

### 4. 前端功能验证

启动应用后逐一验证以下功能：

- [ ] 登录/登出
- [ ] 仪表盘数据展示
- [ ] 服务器添加和 SSH 连接
- [ ] Agent 创建和测试
- [ ] 工作流创建和编辑
- [ ] 任务执行和进度监控
- [ ] 告警 Webhook 接收
- [ ] 知识库搜索
- [ ] AI Copilot 对话
- [ ] 报告生成和导出

### 5. TypeScript 编译检查

```bash
# 后端
cd backend && npx tsc --noEmit

# 前端
cd frontend && npx tsc --noEmit
```

### 6. Docker 构建测试

```bash
docker-compose build
docker-compose -f docker-compose.simple.yml build
```

### 7. 生产验收门禁

生产试运行或正式发布前，使用统一验收脚本串联 API smoke、闭环 smoke、Playwright E2E、主库备份恢复演练、Kite 备份恢复演练、Hermes Worker 健康和生产就绪汇总。

```bash
ACCEPTANCE_PASSWORD="<admin-password>" \
API_BASE=http://127.0.0.1:3001 \
E2E_BASE_URL=http://10.1.132.58:3000 \
E2E_API_BASE=http://10.1.132.58:3001 \
E2E_KITE_BASE=http://10.1.132.58:3002 \
E2E_CLEANUP_SUDO=true \
npm run acceptance:production
```

输出报告保存在 `reports/production-acceptance-*.json`，该目录下的 JSON 报告是运行证据，不提交到 Git。

验收通过条件：

- API smoke 和闭环 smoke 全部通过。
- Playwright E2E 全部通过，且测试前后自动清理 E2E 数据。
- 主库备份 verified，dry-run restore drill 为 passed。
- Kite 备份 verified，dry-run restore drill 为 passed。
- 3 个 Hermes Worker 均 configured 且 healthy。
- `/api/ops-readiness/summary` 返回 ready，score 达到 100，无 blocker 和 warning。
- 验收结束后 `cleanup:e2e` dry-run 不再发现 E2E 测试数据。

## 测试环境

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:8080 |
| 后端 API | http://localhost:3001 |
| 健康检查 | http://localhost:3001/health |

**测试账户**: `admin` / `admin`
