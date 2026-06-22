# P14 Hermes Workflow Execution Preflight Gate

## Goal

Turn the P13 capability bundle preflight from a display-only signal into an execution gate.

P14 keeps the workflow executor unchanged and adds policy checks before a task is created. This makes the UI guidance and backend enforcement consistent.

## Scope

- Add `workflow.executionPreflight.v1` as the execution gate contract.
- Add `GET /api/workflows/:id/execution-preflight`.
- Enforce the same preflight in `POST /api/tasks`.
- Persist a compact preflight snapshot into task context.
- Replace the workflow page's browser confirm with a structured preflight modal.

## Decision Model

The gate returns one of three decisions:

- `allow`: no blocking or warning condition was found, execution can start directly.
- `warn`: execution can continue, but the operator must review risks first.
- `block`: execution is rejected by backend policy.

Role handling:

- `viewer`: always blocked from execution.
- `operator`: blocked when the Hermes capability bundle is not ready or contains technical policy risks.
- `admin`: can continue through bundle and policy risks with an explicit warning.

Warning conditions include:

- Workflow approval gates.
- Workflow verification gates.
- High-risk tools.
- Unhealthy MCP Servers.
- Recent workflow failures.

Blocking conditions include:

- Viewer execution attempt.
- Non-ready Hermes capability bundle for non-admin users.
- Channel, tool, MCP, or high-risk policy problems for non-admin users.

## Operator Experience

The workflow list now executes through this flow:

1. User clicks **Execute**.
2. Frontend calls `/api/workflows/:id/execution-preflight`.
3. If `allow`, the task starts directly.
4. If `warn`, the user sees reasons and suggested actions, then can continue.
5. If `block`, the user sees reasons and suggested actions, but cannot execute.

Server-targeted workflows keep their server selection modal. After servers are selected, the same preflight is run with `serverIds` included in execution context.

## Audit Trail

Every accepted task stores:

- preflight schema version
- decision and mode
- role
- approval requirement
- reasons and suggested actions
- Hermes channel bundle snapshot
- workflow gates snapshot
- MCP health snapshot

This allows later task detail, trace, audit, and Hermes postmortem views to explain why a workflow was allowed or warned at execution time.

## Next Step

P15 should use this preflight snapshot in the Task Detail and Trace views:

- Show the original execution gate result.
- Link warnings to Channel, MCP, Approval, and Runbook pages.
- Correlate gate decisions with task success or failure.
