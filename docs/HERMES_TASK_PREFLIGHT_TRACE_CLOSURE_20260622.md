# P15 Hermes Task Preflight Trace Closure

## Goal

Make the P14 execution preflight result visible after a workflow task starts.

P14 enforced the gate before task creation. P15 closes the operator evidence loop by showing the persisted gate snapshot in task detail and by rolling it into correlation trace summaries.

## Scope

- Read `context.workflowExecutionPreflight` from tasks.
- Show an execution preflight snapshot in Task Detail.
- Include decision, role, approval requirement, bundle readiness, gate counts, MCP health, reasons, and suggested actions.
- Add preflight decision/reason/action/role aggregation into `/api/correlations/:id` summary.
- Show preflight decisions and reasons in the Hermes Dashboard correlation trace summary.

## Operator Impact

When an operator opens a task, they can now answer:

- Was the task started directly or after warning confirmation?
- Which role started it?
- Did the workflow require approval or verification?
- Were Hermes capability bundles ready?
- Were MCP or Channel risks known before execution?
- What actions were suggested before the task was allowed?

This avoids treating task execution as a black box. The task detail becomes the audit anchor for execution policy.

## Trace Impact

Correlation trace now summarizes:

- `preflightDecisions`
- `preflightReasons`
- `preflightActions`
- `preflightRoles`

Hermes Dashboard displays decisions and reasons inline with other trace evidence, so a board card can explain both runtime evidence and execution gate context.

## Follow-up

The next useful step is to add deep links from preflight reasons to the responsible surfaces:

- Hermes Channel for capability bundle review.
- MCP Registry for unhealthy MCP Servers.
- Tool Approvals for approval-required executions.
- Workflow editor for gate configuration.
