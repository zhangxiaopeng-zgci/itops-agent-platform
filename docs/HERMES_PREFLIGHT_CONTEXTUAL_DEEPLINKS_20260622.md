# P17 Hermes Preflight Contextual Deeplinks

## Goal

Make P16 owner links context-aware.

P16 linked preflight evidence to the responsible owner surfaces. P17 carries task, workflow, channel, MCP, and correlation context through those links so the target page can focus on the relevant object.

## Scope

- Task Detail preflight links now include contextual query parameters.
- Hermes Channel Console reads `channelId`, `focus`, and `mcpId`.
- Hermes Channel Console highlights the selected Channel/MCP context and shows a focused review banner.
- Tool Approvals reads `taskId` and `correlationId` and auto-selects a matching approval from the full list.
- Task Center reads `workflowId` and filters/selects tasks for that workflow.

## Deeplink Contract

| Source evidence | Target |
| --- | --- |
| Capability bundle review | `/hermes-channels?channelId=...&focus=bundle` |
| MCP health review | `/hermes-channels?channelId=...&focus=mcp&mcpId=...` |
| Approval preparation | `/tool-approvals?taskId=...&correlationId=...` |
| Workflow gate review | `/workflows/:workflowId?focus=gates` |
| Recent workflow failures | `/tasks?workflowId=...` |

## Operator Impact

The operator flow becomes:

1. Open a task.
2. Read the preflight decision and reasons.
3. Click the owner link.
4. Land on the responsible page with the relevant context selected or filtered.

This reduces ambiguity without adding new surfaces.

## Follow-up

The next stage can make the target pages even more specific:

- Workflow editor visually focuses the gate configuration panel when `focus=gates`.
- Tool Approvals can add visible filter chips for `taskId` and `correlationId`.
- Hermes Channel can scroll directly to the highlighted MCP row.
