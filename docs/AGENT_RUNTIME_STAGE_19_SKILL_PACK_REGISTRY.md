# 阶段 19：Hermes Skill Pack Registry

## 目标

阶段 19 将 Hermes Channel 的能力边界从“连接 + 工具白名单”扩展为“连接 + 工具白名单 + Skill Pack”。Skill Pack 不负责直接执行动作，而是作为 Channel 级操作准则注入 Hermes Runtime，让诊断、修复编排和复盘通道具备清晰、可管理、可审计的行为方法论。

## 本阶段范围

- 新增 Skill Pack 注册表。
- 新增 Channel 与 Skill Pack 的绑定关系。
- 初始化 3 个默认 Skill Pack：
  - 故障诊断 Skill Pack
  - 审批修复 Skill Pack
  - 复盘进化 Skill Pack
- Hermes Runtime 调用时注入当前 Channel 绑定的 Skill Pack。
- Runtime metadata 记录本次使用的 Skill Pack ID、名称、版本和分类。
- Hermes 控制台展示并维护 Channel 的 Skill Pack 绑定。

## 数据模型

新增表：

- `skills`
  - 保存 Skill Pack 的名称、分类、版本、内容、关联工具、风险说明和启停状态。
- `hermes_channel_skills`
  - 保存 Hermes Channel 与 Skill Pack 的多对多绑定。

默认绑定：

| Channel | Skill Pack |
| --- | --- |
| Hermes 诊断通道 | 故障诊断 Skill Pack |
| Hermes 修复编排通道 | 审批修复 Skill Pack |
| Hermes 复盘通道 | 复盘进化 Skill Pack |

## API

新增：

```text
GET  /api/skills
GET  /api/skills/:id
POST /api/skills
PUT  /api/skills/:id
PUT  /api/hermes-channels/:id/skills
```

扩展：

```text
GET /api/hermes-channels
PUT /api/hermes-channels/:id
```

Channel 响应新增 `skills` 字段，Channel 更新请求可携带 `skills: string[]` 保存绑定。

## Runtime 行为

Hermes Runtime 在执行 Agent 时会按以下顺序解析能力：

1. 读取 Agent 绑定的 Hermes Channel。
2. 读取 Channel 的工具白名单。
3. 读取 Channel 启用的 Skill Pack。
4. 将 Skill Pack 内容作为系统级操作准则追加到 system prompt。
5. 在执行 metadata 中写入本次启用的 Skill Pack 摘要。

Skill Pack 不覆盖以下安全边界：

- 当前用户角色权限
- Tool Policy
- 工具审批
- 工具风险级别
- Channel 工具白名单

## 产品入口

Hermes 控制台新增 Skill Pack 区域：

- 管理员可为 Channel 勾选 Skill Pack。
- 只读和运维角色可查看 Channel 当前能力包。
- Channel 列表显示工具数量和 Skill Pack 数量。

## 阶段 19 结论

本阶段完成后，Hermes 的 Channel 不再只是“调用哪个模型、开放哪些工具”的技术配置，而是开始具备可配置的运维方法论入口。后续阶段 18/19 的深化可以继续在这个基础上扩展 MCP、Skill 版本治理、导入导出和灰度发布。
