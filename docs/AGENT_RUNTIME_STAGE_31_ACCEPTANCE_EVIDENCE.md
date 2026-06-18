# Stage 31 / P11 Acceptance Evidence

本文档记录 P11b 在测试机 `10.1.132.58` 上的真实验收第一轮证据。

## 执行摘要

- 执行时间：2026-06-18 15:58 CST
- 本地文档 commit：`bf26658`
- 测试地址：`http://10.1.132.58:3000`
- API 地址：`http://10.1.132.58:3001`
- 结论：核心部署、数据持久化、生产就绪、Hermes Worker、主要页面、发布审计、高风险治理第一轮验收通过。

当前仍需后续收口：

- 生产就绪仍有 `active_release_tracking` warning，因为当前没有 active release version。
- 测试机当前只有 `admin` 用户，viewer / operator 完整角色验收缺少前置账号。
- 运维交付手册仍在 P11d 收敛，本轮只验证了已有手册矩阵入口。

## A. 部署和运行态

### P11-A01 / P11-A04 / P11-A05

角色：admin  
入口：SSH  
步骤：执行 `docker compose -f docker-compose.hermes.yml ps --format json`。  
预期：backend、frontend、3 Hermes Worker 全部 running / healthy。  
实际：通过。

证据：

```json
[
  { "Service": "backend", "State": "running", "Health": "healthy", "Status": "Up 34 seconds (healthy)" },
  { "Service": "frontend", "State": "running", "Health": "healthy", "Status": "Up 28 seconds (healthy)" },
  { "Service": "hermes-diagnose", "State": "running", "Health": "healthy", "Status": "Up 40 seconds (healthy)" },
  { "Service": "hermes-evolve", "State": "running", "Health": "healthy", "Status": "Up 40 seconds (healthy)" },
  { "Service": "hermes-remediate", "State": "running", "Health": "healthy", "Status": "Up 40 seconds (healthy)" }
]
```

结论：pass。

### P11-A02

角色：admin  
入口：API  
步骤：`GET /health`。  
预期：status 为 `healthy`。  
实际：`status=healthy`，HTTP 200。

证据：

```json
{
  "status": 200,
  "health": "healthy"
}
```

结论：pass。

### P11-A03

角色：admin  
入口：浏览器 `/ops-readiness`  
步骤：打开生产就绪页面并检查 console。  
预期：页面加载，无 console error。  
实际：页面显示 `生产治理就绪度`、`Hermes Worker 3/3`、`容器重建演练`，console 无 error。

结论：pass。

## B. 数据持久化和恢复

### P11-B01

角色：admin  
入口：API / 生产就绪  
步骤：读取 `/api/ops-readiness/summary`。  
预期：无 blocked；备份、恢复演练、容器演练有证据。  
实际：无 blocked，score=93，唯一 warning 为 `active_release_tracking`。

证据：

```json
{
  "score": 93,
  "blocked": [],
  "warnings": ["active_release_tracking"],
  "deployment": {
    "backendProductionBuild": true,
    "frontendProductionAssetsDetected": true,
    "expectedHermesWorkers": 3,
    "configuredHermesWorkers": 3,
    "healthyHermesWorkers": 3,
    "containerRebuildDrills": 3,
    "lastContainerRebuildDrillStatus": "passed"
  },
  "data": {
    "backupEnabled": true,
    "totalBackups": 7,
    "lastBackupVerified": true,
    "restoreDrills": 1,
    "lastRestoreDrillStatus": "passed"
  }
}
```

结论：pass，带 warning：`active_release_tracking`。

### P11-B02

角色：admin  
入口：API  
步骤：`GET /api/backups/restore-drills?limit=3`。  
预期：返回最近恢复演练记录。  
实际：最近记录 `a50c91a4-4b78-4a18-b683-92a0fa22a2b7`，`status=passed`，`verification_status=integrity_ok`。

结论：pass。

### P11-B03 / P11-B04 / P11-B05

角色：admin  
入口：SSH / API  
步骤：

1. 执行保留 volume 的容器重建：
   `docker compose -f docker-compose.hermes.yml up -d --force-recreate backend frontend hermes-diagnose hermes-remediate hermes-evolve`
2. 重建后调用 `POST /api/ops-readiness/container-drills` 记录演练。

预期：容器恢复 healthy，数据库和备份仍可用，container drill passed。  
实际：通过。

证据：

```json
{
  "containerDrill": {
    "id": "528a0cb7-b55c-4123-863e-da3b385444e0",
    "status": "passed",
    "verification_status": "rebuild_recovery_ready",
    "completed_at": "2026-06-18 07:58:36"
  },
  "workers": [
    { "role": "diagnose", "healthy": true, "status": "healthy", "url": "http://hermes-diagnose:4101" },
    { "role": "remediate", "healthy": true, "status": "healthy", "url": "http://hermes-remediate:4102" },
    { "role": "evolve", "healthy": true, "status": "healthy", "url": "http://hermes-evolve:4103" }
  ]
}
```

结论：pass。

## C. Hermes 运维助手

### P11-C01 / P11-C02 / P11-C03

角色：admin  
入口：浏览器 `/hermes`  
步骤：打开 Hermes 运维助手。  
预期：诊断问题、修复编排、复盘优化三个入口可见，当前 Agent 和 Channel 能力摘要可见。  
实际：通过，页面显示：

- `Hermes 运维助手`
- `诊断问题`
- `修复编排`
- `复盘优化`
- `Hermes 诊断修复 Agent`
- `Hermes 诊断通道`
- `smart-router`
- `healthy`

结论：pass。

### P11-C04

角色：viewer  
入口：`/hermes`  
步骤：viewer 尝试执行需审批/高风险动作。  
实际：未执行。测试机当前只有 `admin` 用户，缺少 viewer 账号。

结论：warning。  
后续：P11c/P11b 后续轮次需要准备 viewer/operator 验收账号。

## D. Agent / Workflow / Team 控制台

### P11-D01

入口：`/agents`  
实际：页面加载，无 console error；可见 `Hermes 诊断修复 Agent`，绑定 `Hermes 诊断通道`，显示 runtime `Hermes`、Channel、Team、Skill、MCP、Tools 摘要。

结论：pass。

### P11-D02

入口：`/hermes-channels`  
实际：页面加载，无 console error；可见 `数字运维团队控制台`、`Hermes 运营态势`、团队拓扑、通道健康、能力覆盖、风险态势。

结论：pass。

### P11-D03

入口：`/workflows`  
实际：页面加载，无 console error；可见 `Hermes 告警诊断与修复闭环`、`Hermes 故障诊断与审批修复` 等 Hermes 增强模板。

结论：pass。

## E. 进化提案和发布治理

### P11-E01

入口：`/evolution-proposals`  
实际：页面加载，无 console error；可见 `进化提案`、`持续进化任务`、复盘队列。

结论：pass。

### P11-E04

入口：API `GET /api/evolution-proposals/:id/release-guard`  
实际：返回 release guard 和 governance 摘要。

证据：

```json
{
  "status": 200,
  "passed": false,
  "score": 40,
  "governance": {
    "riskLevel": "medium",
    "highRisk": false,
    "changeWindow": {
      "enabled": true,
      "open": true,
      "timezone": "Asia/Shanghai"
    },
    "dualApproval": {
      "required": false,
      "valid": true
    },
    "rollbackPlan": {
      "required": false,
      "valid": true
    }
  }
}
```

结论：pass。

### P11-E05

入口：API  
步骤：

- `GET /api/evolution-proposals/releases/versions/:id/audit?format=json`
- `GET /api/evolution-proposals/releases/versions/:id/audit?format=markdown`

实际：两种格式都导出成功。

证据：

```json
[
  {
    "format": "json",
    "status": 200,
    "contentType": "application/json; charset=utf-8",
    "contentDisposition": "attachment; filename=\"evolution-release-audit-skill-skill-hermes-diagnosis-v1.json\"",
    "containsReleaseId": true
  },
  {
    "format": "markdown",
    "status": 200,
    "contentType": "text/markdown; charset=utf-8",
    "contentDisposition": "attachment; filename=\"evolution-release-audit-skill-skill-hermes-diagnosis-v1.md\"",
    "containsReleaseId": true
  }
]
```

结论：pass。

### P11-E06

入口：API  
步骤：创建临时高风险提案，同一 admin 审批后检查 release guard，再归档临时提案。  
预期：`high_risk_dual_approval` 失败，证明同一人审批和发布会被阻断。  
实际：通过。

证据：

```json
{
  "proposalId": "3b08360a-54af-413f-a232-3eac4fea5fcd",
  "governance": {
    "riskLevel": "high",
    "highRisk": true,
    "dualApproval": {
      "required": true,
      "valid": false,
      "reviewerId": "1",
      "publisherId": "1"
    },
    "rollbackPlan": {
      "required": true,
      "valid": true
    }
  },
  "highRiskChecks": [
    { "key": "high_risk_change_window_open", "status": "passed", "required": true },
    { "key": "high_risk_dual_approval", "status": "failed", "required": true },
    { "key": "high_risk_rollback_plan", "status": "passed", "required": true }
  ]
}
```

结论：pass。  
清理：临时提案已归档。

### P11-E02 / P11-E03 / P11-E07

实际：本轮未执行新的 evaluation / staging replay / rollback 操作，避免在验收中改变已有 release ledger。已有 release audit 中可见历史 evaluation、staging、rollback 证据。

结论：warning。  
后续：P11b 后续轮次可使用专门临时 proposal 做完整发布/回滚演练。

## F. 角色权限

### P11-F04

入口：API  
步骤：未认证直接调用 publish / rollback。  
预期：拒绝。  
实际：HTTP 401。

证据：

```json
[
  { "case": "UNAUTH-PUBLISH", "status": 401, "message": "未提供认证token" },
  { "case": "UNAUTH-ROLLBACK", "status": 401, "message": "未提供认证token" }
]
```

结论：pass。

### P11-F01 / P11-F02 / P11-F03

实际：测试机当前只有 `admin` 用户：

```json
[
  { "id": 1, "username": "admin", "role": "admin", "enabled": 1 }
]
```

结论：

- admin 路径通过。
- viewer/operator 路径 warning，缺少前置账号。

后续：P11c/P11b 后续轮次需要准备 viewer/operator 测试账号，或在验收前由管理员创建。

## G. UI、主题和 i18n

### P11-G01 / P11-G02

入口：全局语言切换  
步骤：中文切换英文，再切回中文。  
实际：

- 点击 `EN` 后，页面显示 `Settings`、`Appearance`、英文导航。
- 英文状态下语言按钮显示 `中`。
- 点击 `中` 后恢复中文，页面显示 `设置`、`语言`。
- console 无 error。

结论：pass。

### P11-G03

入口：`/settings`  
实际：可见 `外观设置` / `Appearance`，页面存在主题相关文案：浅色、深色、跟随系统 / Light、Dark、System。  
本轮未逐项点击三种主题。

结论：warning。  
后续：P11c 或 P11b 后续轮次做主题视觉截图对比。

### P11-G04

入口：核心页面浏览器扫描  
页面：

- `/ops-readiness`
- `/hermes`
- `/agents`
- `/hermes-channels`
- `/workflows`
- `/evolution-proposals`
- `/big-screen`
- `/settings`

实际：全部可加载，未重定向登录，console 无 error。

结论：pass。

## H. 运维手册和移交

P11-H01 到 P11-H05 属于 P11d 的主要产出。本轮确认验收矩阵已定义，但未完成手册内容验收。

结论：warning。  
后续：进入 P11d 时补齐运维交付手册。

## 第一轮结论

通过：

- P11-A01 到 P11-A05。
- P11-B01 到 P11-B05。
- P11-C01 到 P11-C03。
- P11-D01 到 P11-D03。
- P11-E01、P11-E04、P11-E05、P11-E06。
- P11-F04。
- P11-G01、P11-G02、P11-G04。

Warning：

- `active_release_tracking`：当前没有 active release version。
- P11-C04 / P11-F01 / P11-F02：缺少 viewer/operator 测试账号。
- P11-E02 / P11-E03 / P11-E07：本轮未执行新的 evaluation / staging replay / rollback 演练。
- P11-G03：主题仅验证入口和文案，未做视觉截图对比。
- P11-H01 到 P11-H05：等待 P11d 运维手册。

建议下一步：

- P11c：先补验收发现的小缺口和前置数据，例如 viewer/operator 测试账号策略、主题截图验收、active release warning 解释或测试 release 策略。
- P11d：补齐运维交付手册。

