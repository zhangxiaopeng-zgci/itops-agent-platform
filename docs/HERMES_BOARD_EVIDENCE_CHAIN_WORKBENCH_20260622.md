# Hermes Board Evidence-Chain Workbench - 2026-06-22

## Context

After Kubernetes capability closure, development returns to the Agent / Workflow / Hermes main stack.

The next product step is to make Hermes Board behave less like a raw worker-status page and more like an evidence-chain workbench:

```text
Hermes Worker Run
  -> Hermes Session
  -> Correlation Trace
  -> Approval / Task
  -> Execution Evidence
  -> Board Feedback
  -> Evolution Proposal
  -> Release / Runtime Overlay
```

## Implemented Scope

This step extends correlation trace aggregation and Hermes Board details.

Backend:

```text
GET /api/correlations/:id
  now returns:
    proposals
    externalLinks
    boardFeedback

executionEvidenceSummary now includes:
  proposalIds
  externalCardIds
  counts.proposals
  counts.externalLinks
  counts.boardFeedback
```

Frontend:

```text
Hermes Board detail drawer now shows:
  proposal count
  external card count
  board feedback count
  linked proposal ids
  external card ids
  linked proposal cards
  external board cards
  feedback-generated proposal links
```

## Product Meaning

Operators can now answer:

```text
Which failure or session produced this improvement proposal?
Which proposal came from this board feedback?
Is this card already linked to a task, approval, proposal, or external board card?
Which evidence chain should be reviewed before publishing or rolling back?
```

This keeps Hermes Board read-only for production execution. It can create or reveal improvement evidence, but production-changing actions remain gated by:

```text
approval
task/workflow execution
evaluation
staging replay
publish
runtime overlay
rollback
```

## Boundary

This step does not:

```text
replace Evolution Proposals page
publish proposals from the board
execute remediation from the board
create a separate Kanban persistence model
depend on an external Hermes Dashboard
```

## Next Main-Stack Step

Recommended next step:

```text
Team / Channel / Skill / MCP capability composition summary
```

Specifically:

```text
Show each Hermes Channel's effective capability bundle:
  bound agents
  allowed tools
  skills
  MCP servers
  policy mode
  active release overlay
  recent evidence quality

Then use that same capability bundle when starting Team Runs or Workflow Runbook-enhanced tasks.
```
