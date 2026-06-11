# Frontend i18n Convergence Plan

## 背景

当前前端已经具备 `LocaleContext`、`t()` 和运行时语言状态，但仍保留 `domTranslations.ts` 这类 DOM 后处理兜底。实际浏览器测试中，中文模式整体可用，英文模式仍出现中英混排，例如 `运行MediumTask`、`View最New系统Alert`、`Add知识`。

这说明切换机制本身已经基本成立，剩余问题主要是文案来源不统一：部分页面已经使用 React 渲染层 i18n，部分页面仍依赖硬编码文本或 DOM 后处理翻译。

## 收口目标

- 语言切换无需刷新即可生效。
- 英文模式核心页面不出现明显中文 UI 文案残留。
- 中文模式不出现硬拼英文动词或状态词。
- 新增页面和新增文案默认使用 React 渲染层 `t()`。
- DOM 后处理翻译逐步退场，只保留极少数后端动态消息兜底。
- 自动化审计可以发现硬编码中文和中英混排。

## 非目标

- 本阶段不翻译用户数据，例如服务器名、Agent 名、Channel 名、Skill 名、模型名。
- 本阶段不强制后端返回多语言错误码。
- 本阶段不一次性覆盖所有历史页面，而是按核心操作链路逐步收敛。

## 术语白名单

以下词在中英文界面中都允许原样出现：

- 产品/平台：AIOps Agent、Hermes
- 技术缩写：API、MCP、SSH、VNC、CPU、GPU、IP、URL、ID、SQL、LLM、AI、RCA
- 技术名词：Kubernetes、K8s、Git、DevOps、Runtime、Channel、Skill、Tool、Trace、JSON、YAML、HTTP、HTTPS
- 产品/组件名：Nginx、Redis、PostgreSQL、Docker

白名单只避免误报，不代表可以继续用拼接式 UI 文案。例如 `Hermes 控制台` 可以接受，但 `View最New系统Alert` 必须收口。

## 分阶段计划

### i18n-1：审计工具和基线

目标：先能稳定发现问题。

工作项：

- 新增 `frontend/scripts/i18n-audit.mjs`。
- 新增 `npm run i18n:audit`。
- 扫描 `frontend/src` 下的 `.ts`、`.tsx` 文件。
- 识别：
  - 中英无空格拼接。
  - 硬编码中文 UI 文案。
  - 疑似未走 `t()` 的 JSX 文本。
- 支持白名单，降低技术词误报。
- 默认不阻塞构建；后续可用 `--fail-on=error` 接入 CI。

验收：

- 审计脚本能跑通并输出按文件聚合的问题。
- 能命中真实问题样例，例如 `运行MediumTask`、`View最New系统Alert`、`Add知识`。

### i18n-2：字典拆分和类型收敛

目标：降低 `LocaleContext.tsx` 的维护成本。

建议结构：

```text
frontend/src/i18n/
  messages/
    zh-CN/
      common.ts
      nav.ts
      dashboard.ts
      servers.ts
      credentials.ts
      hermes.ts
      evolution.ts
      workflows.ts
      tasks.ts
      alerts.ts
      settings.ts
    en-US/
      common.ts
      nav.ts
      ...
```

工作项：

- 保持现有 `useLocale()` 和 `t()` API 不变。
- 将 `LocaleContext.tsx` 中的大字典拆分为模块化 messages。
- 增加 `MessageKey` 类型，减少 key 拼写错误。
- 增加枚举格式化工具：
  - `formatStatus`
  - `formatRole`
  - `formatRuntime`
  - `formatRiskLevel`
  - `formatApprovalStatus`
  - `formatTaskStatus`

验收：

- 前端构建通过。
- 已迁移页面切换语言无需刷新。
- `LocaleContext.tsx` 不再承载大段业务字典。

### i18n-3：核心框架和首页收口

目标：先把全局入口体验收干净。

页面范围：

- Login
- Layout/Nav
- Dashboard
- Settings/Appearance/Language
- Big Screen

工作项：

- 全局导航、角色、状态、主题、语言按钮统一走 `t()`。
- Dashboard 卡片、快捷操作、列表标题、空状态全部走 `t()`。
- Settings 中的主题/语言/安全/模型设置文案收口。
- 删除对应 `domTranslations.ts` 词条。

验收：

- 英文模式 Dashboard 不再出现 `运行MediumTask` 这类混排。
- 中文模式 Dashboard 不再出现硬拼英文状态词。

### i18n-4：运维主链路收口

目标：覆盖日常操作最常用路径。

页面范围：

- Servers
- SSH Keys / Credentials
- Web Terminal
- Remote Desktop
- Tasks
- Scheduled Tasks
- Workflows

工作项：

- 表单 label、placeholder、按钮、toast、confirm、空状态统一走 `t()`。
- 后端枚举显示统一走 formatter。
- Web Terminal 中认证方式、连接状态、错误提示统一走 i18n。
- 定时任务 run/toggle 权限提示文案收口。

验收：

- 英文模式下运维主链路无明显中文按钮/状态残留。
- Web Terminal 连接成功、失败、认证方式文案均可切换。

### i18n-5：Hermes 主链路收口

目标：确保 Hermes 产品化入口双语一致。

页面范围：

- Hermes Assistant
- Hermes Console / Channels
- Evolution Proposals
- Tool Approvals
- MCP Registry
- Skill Registry

工作项：

- Hermes 三入口、运行上下文、快捷 Prompt、闭环状态、Trace 时间线全部走 `t()`。
- Channel、Skill、MCP、Worker、Release、Risk Surface 页面文案收口。
- Evolution 提案状态、评估、发布、回滚文案收口。
- 运行结果中的模型输出不强制翻译，但 UI 标签必须翻译。

验收：

- 英文模式 Hermes 页面不再出现中文 UI 标签。
- 中文模式 Hermes 页面不再出现硬拼英文动词。
- Hermes 真实运行后，结果区固定 UI 文案随语言切换。

### i18n-6：二级页面和 CI

目标：把收口变成长期质量门。

页面范围：

- Alerts
- Alert Automation
- Alert Noise
- Root Cause
- AI RCA Reports
- Service Topology
- Remediation
- Knowledge
- Reports
- Audit
- Notifications

工作项：

- 逐页迁移硬编码文案。
- 审计脚本增加 `--baseline` 支持，允许逐步降低问题数量。
- CI 增加 `npm run i18n:audit -- --fail-on=error`。
- 可选增加浏览器 smoke：
  - 登录
  - 切中文
  - 切英文
  - 访问核心页面
  - 扫描明显残留文案

验收：

- 新增中英混排问题会在 CI 中失败。
- 历史遗留问题数量持续下降。

## 验收口径

核心页面英文模式允许出现白名单技术词和用户数据，但不允许出现中文 UI 动词、状态、按钮、tab、form label。

核心页面中文模式允许出现技术词，但不允许出现机械拼接，如：

- `运行MediumTask`
- `View最New系统Alert`
- `Add知识`
- `WorkflowTemplate`
- `Report Templates` 出现在中文 tab 中

## 推荐执行顺序

1. i18n-1：审计工具和基线。
2. i18n-2：字典拆分和类型收敛。
3. i18n-3：核心框架和 Dashboard/Settings。
4. i18n-4：运维主链路。
5. i18n-5：Hermes 主链路。
6. i18n-6：二级页面和 CI。

每个阶段完成后，都在远端 `10.1.132.58` 进行生产包验证和真实浏览器 smoke。
