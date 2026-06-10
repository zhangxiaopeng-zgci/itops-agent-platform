# Agent Runtime Evolution - Stage 16 Permission Boundary

阶段 16 将 Hermes 运维助手从“开发者可用”收口为“按角色安全开放”的产品能力。

## 目标

- `viewer` 可以查看 Hermes 会话、链路、审批和任务状态，并执行只读诊断/复盘。
- `operator` 可以提交修复审批、执行低风险工具，并查看闭环状态。
- `admin` 可以审批、配置 Hermes runtime、调整自治级别和工具边界。
- 页面明确展示当前模式、当前角色和本次运行是否可能影响生产环境。
- 后端权限作为最终边界，前端提示只用于体验和防误操作。

## 角色矩阵

| 能力 | viewer | operator | admin |
| --- | --- | --- | --- |
| Hermes 诊断 | yes | yes | yes |
| Hermes 复盘 | yes | yes | yes |
| Hermes 修复编排入口 | no | yes | yes |
| 提交中高风险工具审批 | no | yes | yes |
| 处理审批 | no | yes | yes |
| 查看审批/任务/correlation | yes | yes | yes |
| 配置 Hermes runtime | no | no | yes |
| 调整自治级别/工具策略 | no | no | yes |

## 后端边界

- `PolicyGuard` 对中高风险工具增加角色判断：
  - `admin` / `operator` 返回 `approval_required`。
  - `viewer` 返回 `denied`，并且不创建审批单。
- Hermes runtime 连接测试接口只允许 `admin`。
- Agent 创建/更新时，Hermes runtime、runtime config、自治级别、工具策略只允许 `admin` 修改。
- Hermes 运维助手的修复编排调用对 `viewer` 返回 `403`。
- Hermes sessions、tool approvals 和 correlation chain 的只读查询开放给 `viewer`，用于审计和复盘。

## 前端体验

- Hermes 运维助手展示：
  - 当前模式：只读 / 需审批 / 自动
  - 当前角色
  - “本次不会直接修改生产环境”等安全说明
- `viewer` 不能选择“修复编排”入口，也看不到提交修复审批按钮。
- 审批卡片对 `viewer` 只读展示；`operator` / `admin` 才展示通过/拒绝操作。
- Agent 管理页中，非 `admin` 隐藏 Hermes runtime 配置区，并展示“Runtime 配置仅管理员可改”的说明。

## 验收项

- `viewer` 调用中高风险工具不会创建 `tool_approvals` 记录。
- `operator` 调用中高风险工具仍会进入审批队列。
- `viewer` 可查看 Hermes session、审批和 correlation 只读数据。
- `viewer` 不能从 Hermes 页面触发修复编排。
- 非 `admin` 不能通过 Agent 创建/更新接口修改 Hermes runtime 配置。
- `admin` 仍可测试 Hermes 连接并维护 runtime 设置。

## 后续建议

- 将角色矩阵继续抽象为统一权限声明，减少分散在路由和页面里的硬编码。
- 为 Hermes 页增加危险 prompt 拦截规则，例如直接要求删除文件、重启生产服务、绕过审批等。
- 将“只读 / 需审批 / 自动”模式纳入 Agent 策略详情页，便于审计。
