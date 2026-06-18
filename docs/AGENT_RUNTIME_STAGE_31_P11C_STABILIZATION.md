# Stage 31 / P11c Stabilization Evidence

本文档记录 P11c 在测试机 `10.1.132.58` 上对 P11b warning 项的稳定化收口。

## 执行摘要

- 执行时间：2026-06-18 16:05 CST
- 测试地址：`http://10.1.132.58:3000`
- API 地址：`http://10.1.132.58:3001`
- 范围：只补 P11b 验收缺口，不新增大功能，不改变 Hermes runtime 架构。
- 结论：viewer/operator 验收账号已准备；角色权限边界通过；主题切换完成浅色、深色、跟随系统三模式采样；`active_release_tracking` 明确为非阻断 warning。

## A. 测试账号准备

P11b 中 viewer / operator 验收缺少前置账号。P11c 使用 admin 账号在测试机创建或校正以下账号：

| 用户名 | 角色 | 状态 | 用途 |
| --- | --- | --- | --- |
| `p11_viewer` | viewer | enabled | 只读路径和高风险动作阻断验证 |
| `p11_operator` | operator | enabled | 操作者创建提案、提交动作、被阻断发布/回滚验证 |

证据摘要：

```json
{
  "viewer": { "id": 10, "username": "p11_viewer", "role": "viewer" },
  "operator": { "id": 11, "username": "p11_operator", "role": "operator" }
}
```

结论：pass。

## B. 角色权限边界

### Viewer

| 验证项 | 预期 | 实际 |
| --- | --- | --- |
| 读取 `/api/ops-readiness/summary` | 200 | 200 |
| 读取 `/api/evolution-proposals?limit=1` | 200 | 200 |
| 创建 evolution proposal | 403 | 403 |
| Hermes 修复编排模式执行 | 403 | 403 |

Hermes 修复编排阻断返回：

```json
{
  "status": 403,
  "error": "Viewer role can only run read-only Hermes diagnosis and review"
}
```

结论：pass。

### Operator

| 验证项 | 预期 | 实际 |
| --- | --- | --- |
| 创建 P3 smoke evolution proposal | 201 | 201 |
| 对 proposal 执行 approve | 403 | 403 |
| 对 proposal 执行 publish | 403 | 403 |
| 对 release version 执行 rollback | 403 | 403 |

Operator 创建的 smoke proposal：

```json
{
  "proposalId": "2933d65f-1418-4699-8d8d-714b54fb6707",
  "status": "draft",
  "priority": "P3",
  "type": "skill_update"
}
```

该 smoke proposal 已由 admin 归档：

```json
{
  "archiveStatus": 200
}
```

结论：pass。

## C. 主题视觉补测

P11b 中仅验证了主题入口和文案。P11c 通过浏览器登录 `admin`，在 `/settings` 的 `外观设置` 中分别切换：

- 浅色
- 深色
- 跟随系统

每种主题下扫描以下页面：

- `/big-screen`
- `/agents`
- `/hermes`
- `/ops-readiness`

采样内容：

- `data-theme`
- `data-background`
- body 背景色和文字色
- 页面关键文本
- 主要卡片背景和边框色
- console error 数量
- 截图字节数
- 可见文本裁切采样

### 浅色主题

| 页面 | data-theme | body 背景 | console error | 文本裁切 |
| --- | --- | --- | --- | --- |
| `/big-screen` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/agents` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/hermes` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/ops-readiness` | light | `rgb(248, 250, 252)` | 0 | 0 |

浅色下监控大屏使用浅色卡片采样：

```json
{
  "page": "/big-screen",
  "cardBackground": "rgba(255, 255, 255, 0.78)",
  "cardText": "rgb(15, 23, 42)",
  "cardBorder": "rgba(148, 163, 184, 0.42)"
}
```

结论：pass。浅色模式下监控大屏不再保持整页深色卡片风格。

### 深色主题

| 页面 | data-theme | body 背景 | console error | 文本裁切 |
| --- | --- | --- | --- | --- |
| `/big-screen` | dark | `rgb(17, 19, 18)` | 0 | 0 |
| `/agents` | dark | `rgb(17, 19, 18)` | 0 | 0 |
| `/hermes` | dark | `rgb(17, 19, 18)` | 0 | 0 |
| `/ops-readiness` | dark | `rgb(17, 19, 18)` | 0 | 0 |

结论：pass。

### 跟随系统

当前浏览器系统偏好解析为浅色：

```json
{
  "mode": "system",
  "dataTheme": "light",
  "dataBackground": "carbon"
}
```

| 页面 | data-theme | body 背景 | console error | 文本裁切 |
| --- | --- | --- | --- | --- |
| `/big-screen` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/agents` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/hermes` | light | `rgb(248, 250, 252)` | 0 | 0 |
| `/ops-readiness` | light | `rgb(248, 250, 252)` | 0 | 0 |

结论：pass。

## D. active_release_tracking 处理策略

P11b 的唯一 readiness warning 为：

```json
{
  "warnings": ["active_release_tracking"]
}
```

P11c 不强行发布测试 release 来消除该 warning，原因：

- P11c 的边界是稳定化和验收缺口收口，不改变发布 ledger 的运行态。
- 当前已有 release audit、release guard、高风险同人审批阻断和 rollback 证据。
- `active_release_tracking` 是非 required check，不影响 readiness blockers。
- 该 warning 的真实含义是：当前没有 active release overlay 生效。它应由一次完整的 evaluation -> staging replay -> approval -> publish 流程自然消除。

处理结论：

- 保留为 non-blocking warning。
- 在 P11e 验收报告中写入已知边界。
- 若需要演示 ready=100，应另开专门测试 proposal 完成发布，再记录 rollback 演练，不在 P11c 临时修改数据库状态。

## E. P11c 结论

通过：

- viewer/operator 测试账号前置数据已补齐。
- viewer 只读和高风险阻断通过。
- operator 创建提案通过，审批/发布/回滚阻断通过。
- 浅色、深色、跟随系统三种主题在核心页面无 console error。
- 浅色模式下 `/big-screen`、`/agents`、`/hermes`、`/ops-readiness` 视觉采样为浅色体系，无明显深色孤岛。
- 采样页面未发现明显文本裁切。

仍保留到后续：

- P11d：运维交付手册。
- P11e：验收报告和版本标识。
- 完整 evaluation / staging replay / publish / rollback 演练可作为 P11e 前的专项验收项。

