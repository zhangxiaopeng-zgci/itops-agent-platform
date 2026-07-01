# AIOps Agent 长期生产级团队版收口路线

日期：2026-07-01

目标：把当前“单机闭环可用版”演进为真实团队可长期运行、可审计、可治理、可持续优化的生产级版本。

## 当前基线

- 单机部署可用：frontend、backend、3 个 Hermes Worker、Kite 均可运行。
- 闭环链路已通：主动巡检、自动发现、Case、Hermes、审批、任务、验证、复盘、进化提案已能串联。
- 验收门禁可跑：API smoke、Playwright E2E、生产验收、备份恢复演练、单机 readiness 已通过。
- 2026-07-01 最新验收：
  - `npm run acceptance:production` 通过，包含 API closed-loop、Playwright 11 条 E2E、数据库/Kite 备份恢复、Hermes Worker 健康、Ops readiness。
  - `npm run ops:single-node-check` 通过，状态 `ready`，blockers=0，warnings=0。
  - acceptance 已加入数据库完整性 preflight/postflight，发布门禁能直接暴露 SQLite 损坏。
  - 单机生产 compose 已关闭重复的底层数据库维护调度，SQLite mmap 默认关闭，保留应用层维护任务。
- 主要缺口：主动运维策略产品化、团队协作、可观测运营、PostgreSQL 团队生产形态和高可用。

## P0：生产数据治理

优先解决“系统自动做了什么、哪些数据可信、哪些需要人工确认”的问题。

- 自动发现资产进入“待确认”状态，不直接混入正式可执行资产。
- Kubernetes 背后主机关联支持确认、合并、忽略。
- 拓扑只把确认或明确绑定的关系作为高可信关系，自动推断关系标注来源和置信度。
- 主机列表区分正式主机、待接入主机、禁用主机。

验收标准：

- 自动发现不会让操作者误以为所有主机都可登录执行。
- 待确认资产有清晰入口、数量提示和处理动作。
- 主机、Kubernetes、拓扑三处展示口径一致。

## P1：Case Pipeline 输出标准化

把“能看到状态”升级为“每一步都有标准产物”。

- 后端形成统一 `pipeline` schema：
  - detect
  - diagnose
  - approval
  - execute
  - verify
  - review
- 每步包含 status、startedAt、finishedAt、inputs、outputs、evidence、recommendedNextAction。
- Hermes 输出解析为结构化字段：结论、证据、风险、建议动作、是否需审批。
- Case 页面只渲染 schema，不依赖前端临时聚合。

验收标准：

- Case 详情可以回答：现在在哪一步、上一步返回了什么、下一步该谁做。
- E2E 覆盖 pending、failed、completed 三类 pipeline 状态。

## P2：主动运维策略产品化

把主动巡检从“可触发”变成“可运营”。

- 巡检规则、阈值、频率可配置。
- 支持按资产类型启停：主机、Kubernetes、网络设备、中间件。
- 告警降噪和 Case 去重策略可解释。
- 自动建 Case 前支持风险等级和策略门禁。

验收标准：

- 操作者知道系统为什么建了 Case。
- 管理员可以调整策略而不改代码。

## P3：权限与团队协作

从单管理员试用升级到多角色团队协作。

- 固化 viewer/operator/admin 的默认权限。
- 增加团队交接字段：负责人、协作者、SLA、处置备注。
- 审批、执行、验证、关闭都保留审计。
- 危险动作必须审批，禁止动作不可被 Hermes 绕过。

验收标准：

- viewer 只能看，operator 能诊断和提交审批，admin 能审批和配置。
- 每次生产变更都能追溯到人、Case、审批、任务、证据。

## P4：生产数据库与备份策略

从单机 SQLite 试用走向团队生产运行。

- 当前单机底线：
  - SQLite 只作为单机试点和小团队 Pilot 数据库。
  - 每次生产验收必须包含 `integrity_check` preflight/postflight。
  - 备份必须 verified=true，恢复演练必须 recorded。
  - 如果再次出现 SQLite 损坏，优先执行备份恢复或 `REINDEX; VACUUM;` 应急修复，并把 PostgreSQL 迁移前置。
- PostgreSQL 适配和迁移脚本。
- SQLite 到 PostgreSQL 的迁移演练。
- 定时备份、恢复演练、备份告警。
- 数据保留策略：trace、audit、task、Hermes session、report。

建议拆分：

1. P4a：抽象数据访问边界，梳理直接 SQL 高频写入表。
2. P4b：引入 PostgreSQL schema/migration 基线。
3. P4c：实现 SQLite -> PostgreSQL 导出导入演练。
4. P4d：生产 compose 增加 PostgreSQL container、volume、backup job。
5. P4e：双门禁验收：SQLite 单机门禁 + PostgreSQL 团队版门禁。

验收标准：

- 备份恢复演练自动生成证据。
- 数据库故障时有明确恢复路径。

## P5：运营可观测和发布治理

让平台自身也可被运维。

- 平台健康、Hermes Worker 健康、MCP 健康、Kite 健康统一展示。
- 发布版本真正作用到 Skill、MCP、Workflow、Policy、Prompt 的运行态。
- 进化提案形成 evaluation -> staging replay -> approval -> publish -> rollback 的证据链。
- 关键指标进入生产就绪页面。

验收标准：

- 管理员能判断平台是否健康。
- 每次能力变化都有版本、审批、回滚记录。

## P6：性能、前端工程和长期质量门

- 前端路由级拆包，降低首屏 JS。
- i18n warning 收敛为质量门。
- Playwright 覆盖核心团队流程。
- `npm run acceptance:production` 成为发布前必过门禁。

验收标准：

- 每次发布前能一键验收。
- 核心页面无明显加载和语言体验问题。

## 当前推荐实施顺序

1. P0：自动发现资产待确认治理。
2. P1：Case Pipeline schema 标准化。
3. P2：主动巡检策略产品化。
4. P3：团队权限和协作字段。
5. P4：PostgreSQL 与备份。
6. P5/P6：运营治理、性能和质量门。
