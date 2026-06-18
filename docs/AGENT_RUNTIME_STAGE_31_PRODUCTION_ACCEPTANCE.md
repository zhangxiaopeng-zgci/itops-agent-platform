# Stage 31 / P11 Production Acceptance

本文档固化 P11 的生产验收、稳定化和运维移交测试矩阵。

P11 不是继续扩展功能，而是把 P1-P10 已完成的 Hermes、Agent / Workflow、持续进化、发布治理和生产部署能力验证成可交付版本。

## 目标

- 确认操作者可以完成诊断、修复审批、任务追踪、复盘改进。
- 确认管理员可以完成发布门禁、发布审计导出、回滚和运维治理。
- 确认测试机上的生产化部署、持久化、备份恢复、容器重建都可复现。
- 确认 viewer / operator / admin 三类角色边界清晰。
- 确认中英文、主题、核心页面和关键 API 没有明显断链。

## 测试环境

- 测试机：`10.1.132.58`
- 访问地址：`http://10.1.132.58:3000`
- 后端 API：`http://10.1.132.58:3001`
- 部署目录：`/opt/itops-agent-platform/app`
- Compose 文件：`docker-compose.hermes.yml`
- 管理员账号：`admin / Admin@123`

核心容器：

- `backend`
- `frontend`
- `hermes-diagnose`
- `hermes-remediate`
- `hermes-evolve`

## 验收证据规范

每条验收项至少保留一种证据：

- 页面证据：页面可见文本、截图、无 console error。
- API 证据：HTTP 状态、关键字段、响应摘要。
- 运行证据：Docker container health、compose ps、日志摘要。
- 数据证据：backup drill、container drill、trace、proposal、release、audit id。
- 文档证据：对应手册章节或测试报告条目。

记录格式：

```text
Case ID:
角色:
入口:
步骤:
预期:
实际:
证据:
结论: pass / fail / warning
备注:
```

## 验收矩阵

### A. 部署和运行态

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-A01 | admin | SSH | `docker compose -f docker-compose.hermes.yml ps` | backend、frontend、3 Hermes Worker 全部 running / healthy | compose ps 输出 |
| P11-A02 | admin | API | `GET /health` | status 为 healthy | API 响应 |
| P11-A03 | admin | 浏览器 | 打开 `/ops-readiness` | 生产就绪页面可加载，无 console error | 页面文本、console |
| P11-A04 | admin | SSH | 确认 frontend 使用 nginx 静态包 | frontend 容器服务 80，宿主 3000 可访问 | compose ps / curl |
| P11-A05 | admin | SSH | 确认 backend 生产 build | backend 容器健康，API 可用 | compose ps / health |

### B. 数据持久化和恢复

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-B01 | admin | 生产就绪 | 查看备份数量和最近恢复演练 | 有 backup，最近 restore drill 通过或 warning 有解释 | 页面文本 |
| P11-B02 | admin | API | `GET /api/backups/restore-drills` | 返回最近恢复演练记录 | API 响应 |
| P11-B03 | admin | API | `GET /api/ops-readiness/container-drills` | 返回最近容器重建演练记录 | API 响应 |
| P11-B04 | admin | SSH/API | 保留 volume 重建 backend/frontend/3 worker 后记录 container drill | 重建后数据仍在，container drill passed | compose 输出、drill id |
| P11-B05 | admin | SSH | 检查数据库和备份目录路径 | 数据库位于 `/app/data`，备份位于 `/app/backups` | API / readiness |

### C. Hermes 运维助手

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-C01 | operator/admin | `/hermes` | 选择诊断入口并发送只读诊断 prompt | 调用 Hermes 诊断修复 Agent，显示输出和 trace 摘要 | session / trace |
| P11-C02 | operator/admin | `/hermes` | 选择修复编排入口，要求给修复方案但不执行 | 输出方案、风险、审批建议，不直接改生产 | 输出文本 |
| P11-C03 | operator/admin | `/hermes` | 选择复盘优化入口，带入 correlationId | 输出复盘结论和改进建议 | session / proposal |
| P11-C04 | viewer | `/hermes` | 尝试执行需审批/高风险动作 | viewer 不可提交修复审批或执行高风险操作 | UI / API 403 |

### D. Agent / Workflow / Team 控制台

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-D01 | admin | `/agents` | 查看 Hermes 相关 Agent | 诊断、修复编排、复盘进化 Agent 存在且绑定 Channel | 页面文本 |
| P11-D02 | admin | `/hermes-channels` | 查看 Channel / Skill / MCP / Release | 能看到三类 Hermes channel 能力和风险摘要 | 页面文本 |
| P11-D03 | admin/operator | `/workflows` | 查看 Hermes 增强版工作流模板 | 默认模板和 Hermes 模板都存在 | 页面文本 |
| P11-D04 | operator | `/tasks` | 查看任务详情和运行证据 | runbook、approval、task、trace 关联可见 | 页面文本 |

### E. 进化提案和发布治理

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-E01 | admin/operator | `/evolution-proposals` | 打开提案列表 | 页面可加载，持续进化队列可见，无 console error | 页面 / console |
| P11-E02 | admin/operator | API/UI | 对提案运行 evaluation | 生成 deterministic evaluation 和 dataset regression 摘要 | evaluation id |
| P11-E03 | admin/operator | API/UI | 对提案运行 staging replay | 生成 staging replay，标记 no production mutation | evaluation summary |
| P11-E04 | admin | UI/API | 查看 Release Guard | 显示 score、blockers、dataset、staging、rollback、governance | 页面 / API |
| P11-E05 | admin | UI/API | 导出 release audit JSON / Markdown | 下载文件包含 version、proposal、evaluation、staging、guard、rollback | 文件名 / 内容摘要 |
| P11-E06 | admin | API | 创建临时高风险提案，同一 admin 审批后检查 guard | `high_risk_dual_approval` failed，publish 被阻断 | API 响应 |
| P11-E07 | admin | UI/API | 对 active release 执行 rollback | release ledger 状态变化，有 rollback event | release id / event |

### F. 角色权限

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-F01 | viewer | 核心页面 | 访问 dashboard、Hermes、生产就绪、进化提案 | 可读，不可执行管理动作 | UI / API |
| P11-F02 | operator | Hermes / workflows | 提交诊断、低风险动作、审批申请 | 可提交，不可 admin 审批/发布 | UI / API |
| P11-F03 | admin | 全部治理入口 | 审批、发布、回滚、配置 Channel/Skill/MCP | 有权限且留审计 | audit / release |
| P11-F04 | viewer/operator | 发布 API | 直接调用 publish/rollback | viewer/operator 被拒绝 | 403 |

### G. UI、主题和 i18n

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-G01 | admin | 全局 | 中文切英文，访问核心页面 | 文案切换无需刷新或刷新后稳定；无明显中文残留在核心路径 | 页面文本 |
| P11-G02 | admin | 全局 | 英文切中文，访问核心页面 | 文案恢复中文，布局不溢出 | 页面文本 |
| P11-G03 | admin | 设置/主题 | 深色、浅色、跟随系统切换 | dashboard、监控大屏、Agent 管理、Hermes、生产就绪显示正常 | 页面截图/文本 |
| P11-G04 | admin | 浏览器 console | 打开核心页面 | 无 console error | console |

### H. 运维手册和移交

| ID | 角色 | 入口 | 步骤 | 预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| P11-H01 | admin | docs | 启停升级手册 | 有明确命令和注意事项 | 文档 |
| P11-H02 | admin | docs | 备份恢复手册 | 有备份、恢复、dry-run 演练步骤 | 文档 |
| P11-H03 | admin | docs | 容器重建手册 | 有 force-recreate、健康检查、drill 记录步骤 | 文档 |
| P11-H04 | admin | docs | Hermes 配置手册 | API key、model、worker、Channel、Skill、MCP 配置清楚 | 文档 |
| P11-H05 | admin | docs | 发布治理手册 | change window、release guard blocked、audit export、rollback 清楚 | 文档 |

## P11b 执行顺序

建议真实验收按以下顺序执行：

1. 部署和运行态：P11-A01 到 P11-A05。
2. 数据持久化和恢复：P11-B01 到 P11-B05。
3. UI 基线：P11-G01 到 P11-G04。
4. Hermes 使用入口：P11-C01 到 P11-C04。
5. Agent / Workflow / Team：P11-D01 到 P11-D04。
6. 进化提案和发布治理：P11-E01 到 P11-E07。
7. 角色权限：P11-F01 到 P11-F04。
8. 运维手册：P11-H01 到 P11-H05。

## P11c 修复规则

P11c 只修稳定化小缺口：

- 文案缺失或 i18n key 缺失。
- 页面布局错位、浅色/深色主题显示异常。
- API 字段形状不一致。
- 权限判断和前端按钮状态不一致。
- readiness warning 缺少解释。
- 文档步骤缺失。

P11c 不做以下事情：

- 新增大型业务模块。
- 重写 Hermes runtime。
- 新增新的持久化子系统。
- 引入新的 Agent 编排模式。
- 将 P12 候选问题强行塞进 P11。

## P11e 验收报告模板

```text
验收版本:
部署 commit:
验收时间:
测试机:
验收人:

总体结论:

通过项:
警告项:
失败项:
已修复项:
遗留风险:
P12 候选:

关键证据:
- backend/frontend/Hermes worker health:
- backup restore drill:
- container rebuild drill:
- release audit:
- release guard:
- high-risk governance:
- console error scan:

交付结论:
```

