# Agent Runtime Evolution - Stage 6 Tool Approvals

阶段 6 把 `approval_required` 从临时状态升级为真实审批队列。

## 新增能力

- 新增 `tool_approvals` 表。
- Tool API 遇到 `approval_required` 时创建审批单，不直接执行工具。
- 新增审批 API：
  - `GET /api/tool-approvals`
  - `GET /api/tool-approvals/:id`
  - `POST /api/tool-approvals/:id/approve`
  - `POST /api/tool-approvals/:id/reject`
- 前端新增「工具审批」页面。
- 新增中风险工具 `submit_remediation_for_approval`，用于提交修复建议进入审批流。

## 执行路径

```text
Hermes / API
  -> invokeTool(...)
  -> PolicyGuard returns approval_required
  -> create tool_approvals row
  -> human reviewer approves
  -> invokeTool(..., skipApproval: true)
  -> execution result stored on tool_approvals
  -> audit log written
```

## 安全边界

- 普通工具调用不能绕过审批。
- 审批接口仅允许 `admin` 和 `operator`。
- 批准后执行仍然走 Tool Registry 和工具实现，只跳过已满足的人审门槛。
- `destructive` 仍默认拒绝，不进入自动审批执行。

## 当前限制

- 阶段 6 的 `submit_remediation_for_approval` 只闭环审批与记录，不直接修改生产系统。
- 后续阶段需要把审批通过后的执行接入 remediation/workflow 真实执行器。
- 工具审批还没有 WebSocket 实时提醒。

## 下一步

阶段 7 建议接入真实安全变更工具：

- `run_workflow` 进入审批后执行指定 workflow。
- `verify_remediation` 读取执行结果并做验证。
- `rollback_remediation` 仅在审批后开放。
- 前端审批详情支持完整执行 trace 展开。
