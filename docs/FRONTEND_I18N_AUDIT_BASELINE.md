# Frontend i18n Audit Baseline

## 生成时间

2026-06-11

## 命令

```bash
cd frontend
node scripts/i18n-audit.mjs --max=30 --fail-on=error
```

## 当前结果

```text
total: 1437
errors: 0
warnings: 1437
```

`errors` 用来捕获高置信度的中英无空格拼接或 DOM 后处理残留。当前为 0，说明规则可以先接入 `--fail-on=error`，不会被历史硬编码中文阻塞。

`warnings` 用来记录历史硬编码中文文案。当前数量较多，后续按页面逐步下降。

## Top Files

```text
226  src/pages/Servers.tsx
 99  src/pages/Settings.tsx
 69  src/pages/BigScreenDashboard.tsx
 54  src/pages/SSHKeys.tsx
 46  src/pages/RemediationExecutions.tsx
 45  src/pages/WorkflowEditor.tsx
 44  src/pages/Agents.tsx
 44  src/pages/NetworkDevices.tsx
 44  src/pages/Workflows.tsx
 41  src/pages/AlertMappings.tsx
 39  src/pages/RemediationPolicyEditor.tsx
 38  src/pages/AIModels.tsx
```

## 解读

当前混排问题不是少量词条缺失，而是大量历史页面仍有硬编码中文。收口应按用户路径推进，而不是直接尝试一次性清零。

优先顺序：

1. `Dashboard` / `Layout` / `Settings`
2. `Servers` / `SSHKeys` / `TerminalPage`
3. `HermesAssistant` / `HermesChannels` / `EvolutionProposals` / `ToolApprovals`
4. `Tasks` / `ScheduledTasks` / `Workflows`
5. 其他告警、知识库、报告、修复页面

## 质量门建议

短期：

```bash
npm run i18n:audit -- --fail-on=error
```

中期：

- 每完成一个页面收口，记录 warning 数下降。
- 当核心页面完成后，将 CI 规则提升为核心路径浏览器 smoke。

长期：

- 历史 warning 清零或进入明确白名单。
- 新增硬编码中文 UI 文案需要在 code review 中拦截。
