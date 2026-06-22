# P16 Hermes Preflight Owner Links

## Goal

Turn the P15 preflight evidence snapshot into an actionable operator path.

P15 showed why a task was allowed or warned. P16 adds owner links so each preflight reason and suggested action can jump to the existing surface that owns the fix.

## Scope

- Add action links to the Task Detail preflight card.
- Add owner links for preflight reasons.
- Keep all links inside existing product surfaces.
- Avoid adding new pages or new runtime behavior.

## Routing Map

| Preflight reason/action | Owner surface |
| --- | --- |
| Capability bundle review | Hermes Channel |
| Channel policy risk | Hermes Channel |
| MCP health issue | Hermes Channel |
| Workflow approval gate | Workflow editor |
| Workflow verification gate | Workflow editor |
| High-risk tool approval | Workflow editor / Tool Approvals |
| Tool approval preparation | Tool Approvals |
| Recent workflow failures | Task Center |
| Viewer role execution | User Permissions |
| Unknown fallback | Execution Center |

## Operator Impact

An operator opening a task can now:

1. See the execution preflight decision.
2. Read the exact reasons and suggested actions.
3. Click through to the responsible page without guessing where the configuration lives.

This keeps the platform's information architecture tighter: preflight evidence remains in Task Detail, while remediation of that evidence happens in Channel, Workflow, Approval, Task, or User management.

## Follow-up

The next refinement is contextual highlighting:

- Open Hermes Channel with a specific channel or MCP section selected.
- Open Workflow editor focused on gate configuration.
- Open Tool Approvals filtered by task or correlation.
- Open Tasks filtered by workflow.
