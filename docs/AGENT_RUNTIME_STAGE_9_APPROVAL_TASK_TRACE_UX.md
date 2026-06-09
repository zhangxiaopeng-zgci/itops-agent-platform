# Agent Runtime Evolution - Stage 9 Approval, Task, Trace UX

阶段 9 不改变执行边界，专注把阶段 7/8 已经打通的链路展示清楚：

```text
Hermes tool call -> tool approval -> workflow task -> task verification -> agent trace
```

## 新增体验

### 工具审批关联任务

工具审批页会从审批输入或执行结果中提取 `taskId`。

当 `run_workflow` 审批执行成功后，审批详情会显示关联任务，并提供跳转：

```text
/tasks?taskId=<task-id>
```

这让操作员可以从审批记录直接进入任务执行详情。

### 任务详情深链

任务页支持 `taskId` 查询参数：

```text
/tasks?taskId=<task-id>
```

打开页面后会自动选中对应任务。用户手动选择任务时，也会同步更新 URL，方便复制和回溯。

### Agent Trace 时间线

Agent 执行历史中的 trace 从短预览升级为完整时间线：

- assistant message
- tool call requested
- tool call result
- tool success / failed
- approval id
- task id
- policy decision status

这样可以从 Agent 的一次回复追溯到工具审批、工作流任务和验证结果。

## 设计边界

- 不新增自动执行权限。
- 不改变 `run_workflow` 的审批要求。
- 不在前端暴露 Hermes API key。
- Trace 只展示后端已经持久化的执行元数据。

## 下一步

阶段 10 建议进入“可观测闭环”：

- 为 Hermes tool call 增加独立 trace id。
- 让 approval、task、agent execution 三类记录共享 correlation id。
- 增加按 correlation id 查询的后端 API。
- 在前端提供单页链路视图。
