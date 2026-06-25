# Closed Loop v1 Design

Date: 2026-06-23

## Goal

Turn AIOps Agent from a collection of Agent, Workflow, Hermes, approval, task, and evolution pages into a single usable operations loop.

The v1 loop is:

```text
Asset / Alert / Manual Input
  -> Operation Case
  -> Hermes Diagnosis
  -> Evidence + Risk + Recommendation
  -> Approval
  -> Workflow Task
  -> Verification
  -> Retrospective
  -> Evolution Proposal
  -> Evaluation
  -> Staging Replay
  -> Approval
  -> Publish
  -> Runtime Capability Version
```

## Core Model

`operation_cases` is the business-level container.

It answers the operator question:

> What are we handling, where did it start, what is the current stage, and where is the evidence?

`correlation_id` remains the evidence-chain key.

It answers the audit question:

> Which Hermes sessions, Agent executions, approvals, tasks, audit logs, worker runs, and evolution proposals belong to this handling chain?

The two concepts are intentionally separate:

- Case is product-facing and workflow-facing.
- Correlation trace is evidence-facing and audit-facing.

## v1 Data Contract

An operation case stores:

- `title`
- `case_type`
- `status`
- `severity`
- `source`
- `asset_id`
- `asset_type`
- `asset_name`
- `alert_id`
- `correlation_id`
- `server_ids`
- `context`
- `summary`
- `created_by`
- timestamps

An operation case event stores:

- `case_id`
- `event_type`
- `source_type`
- `source_id`
- `correlation_id`
- `payload`
- `created_by`
- timestamp

## Statuses

- `diagnosing`: case created and diagnosis in progress.
- `diagnosis_ready`: diagnosis has produced usable evidence.
- `approval_pending`: remediation approval is required.
- `executing`: workflow or tool execution is in progress.
- `verifying`: remediation verification is in progress.
- `reviewing`: retrospective review is in progress.
- `evolving`: evolution proposal or release workflow is in progress.
- `closed`: handling is complete.
- `cancelled`: handling was intentionally stopped.

## First Implementation Slice

This slice implements:

- `operation_cases` and `operation_case_events` tables.
- `/api/operation-cases` APIs.
- `operationCases` in `/api/correlations/:id`.
- Diagnosis Center creates an operation case before opening Hermes.
- Hermes receives `caseId` and `correlationId` through URL parameters.
- Downstream approval, task, verification, Hermes session, and evolution proposal events automatically append to the Case timeline and advance Case status.

## Downstream Closure Matrix

| Source | Event | Case status |
| --- | --- | --- |
| Tool Approval | `tool_approval_created` | `approval_pending` |
| Tool Approval | `tool_approval_approved` | `executing` |
| Tool Approval | `tool_approval_rejected` | `reviewing` |
| Tool Approval | `tool_approval_executed` | `executing` or `verifying` |
| Tool Approval | `tool_approval_execution_failed` | `reviewing` |
| Workflow Task | `workflow_task_created` | `executing` |
| Workflow Task | `workflow_task_started` | `executing` |
| Workflow Task | `workflow_task_completed` | `verifying` |
| Workflow Task | `workflow_task_failed` | `reviewing` |
| Verification | `remediation_verification_passed` | `reviewing` |
| Verification | `remediation_verification_failed` | `evolving` |
| Hermes Session | `hermes_diagnosis_completed` | `diagnosis_ready` |
| Hermes Session | `hermes_remediation_reviewed` | `reviewing` |
| Hermes Session | `hermes_retrospective_completed` | `evolving` |
| Hermes Session | `hermes_session_failed` | `reviewing` |
| Evolution Proposal | `evolution_proposal_created` | `evolving` |
| Evolution Proposal | `evolution_proposal_status_changed` | `evolving`, `reviewing`, or `closed` |

All downstream writers use `operationCaseId` when present, otherwise `correlationId`.

## Next Steps

1. Add a Case detail page as the primary operator view for the whole loop.
2. Show active Case status and timeline directly inside Hermes Assistant.
3. Write the effective release version and publish evidence back to the Case summary.
4. Add timeline filters for approval, task, verification, retrospective, and evolution events.
5. Add operator-facing SLA and owner fields once the Case page becomes the main workbench.
