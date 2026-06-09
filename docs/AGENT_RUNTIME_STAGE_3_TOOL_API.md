# Agent Runtime Evolution - Stage 3 Tool API

阶段 3 的目标是为外部 Agent Runtime 提供受控工具边界。Hermes、OpenClaw 或其他运行时不应直接访问数据库、SSH 凭据或运维执行器，而是通过 ITOps 控制面的 Tool API 申请能力。

## 当前范围

新增后端接口：

- `GET /api/tools`：返回可用工具列表、风险级别和输入 schema。
- `POST /api/tools/:name/invoke`：调用指定工具。
- `POST /api/tools/invoke`：通过请求体中的 `tool` 字段调用工具。

新增服务层：

- `services/toolApi/types.ts`：工具、上下文、决策和调用结果类型。
- `services/toolApi/policyGuard.ts`：角色、风险级别和只读命令策略。
- `services/toolApi/tools.ts`：首批工具实现。
- `services/toolApi/toolRegistry.ts`：工具注册、统一调用和审计。

## 首批工具

| Tool | 风险 | 说明 |
| --- | --- | --- |
| `list_servers` | `read_only` | 查询服务器清单，不返回密码、私钥、VNC 密码等敏感字段。 |
| `query_alerts` | `read_only` | 按状态、严重级别查询近期告警。 |
| `search_knowledge_base` | `read_only` | 查询知识库条目。 |
| `run_readonly_command` | `read_only` | 在严格 allowlist 内执行只读命令。 |

`run_readonly_command` 额外经过两层保护：

1. 拒绝 shell 控制字符，例如 `;`、`&`、`|`、反引号、重定向等。
2. 复用现有 `commandFilter`，并只允许 `cat`、`df`、`free`、`grep`、`head`、`hostname`、`ip`、`last`、`ps`、`ss`、`tail`、`uname`、`uptime`、`w`、`who` 等只读命令。

## 策略模型

阶段 3 采用最小可用策略：

- `read_only`：`admin`、`operator`、`viewer` 可执行。
- `low_risk`：仅 `admin`、`operator` 可执行。
- `medium_risk`、`high_risk`：返回 `approval_required`，暂不直接执行。
- `destructive`：直接拒绝。

每次调用都会写入 `audit_logs`，审计内容包含调用来源、输入、策略决策、执行结果和错误信息。

## Hermes 接入方式

Hermes Runtime Adapter 后续不直接执行动作，而是：

1. 从 `GET /api/tools` 获取工具目录。
2. 将工具描述传给 Hermes，作为可调用工具能力。
3. Hermes 产出的 tool call 回到 ITOps，由 `POST /api/tools/:name/invoke` 执行。
4. Tool API 根据当前用户、Agent 来源、风险等级和命令策略做最终裁决。

这样架构上保持：

- Hermes 负责推理、规划和诊断。
- ITOps 负责权限、凭据、执行、审计和审批。

## 下一步

阶段 4 建议加入：

- 工具级别的可配置 policy 表。
- 待审批任务表和人工审批 API。
- Agent Runtime 到 Tool API 的内部调用适配。
- Hermes tool call 协议映射。
