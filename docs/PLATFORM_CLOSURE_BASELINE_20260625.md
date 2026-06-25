# AIOps Agent Platform Closure Baseline - 2026-06-25

## Purpose

This document pauses feature expansion and defines the current closure baseline for AIOps Agent.

The platform has already moved beyond a simple Agent and Workflow management system. The current product direction is:

```text
Case-centric AIOps operations platform
  -> Hermes as the reasoning brain
  -> Workflow and Tool API as the controlled execution layer
  -> Approval, task, trace, and evolution as the governance loop
```

The immediate goal is not to add more pages. The goal is to make the existing capabilities usable by a real pilot team through a smaller set of operator jobs.

## Current Status

The current version is usable for a controlled internal pilot.

It is not yet ready for unattended production auto-remediation.

The stable closed loop is:

```text
Diagnosis Center
  -> Operation Case
  -> Hermes diagnosis / remediation / retrospective review
  -> Tool approval
  -> Workflow task
  -> Verification evidence
  -> Evolution proposal
  -> Case timeline and correlation trace
```

The platform now has:

- Three Hermes worker containers: `diagnose`, `remediate`, and `evolve`.
- Hermes Channels, Skills, MCP registry, and capability bundle summaries.
- Operation Case workbench with timeline, linked approvals, linked tasks, linked proposals, and next-action guidance.
- Tool approval and task pages that can jump back to the owning Case.
- Workflow preflight with channel, MCP, skill, approval, and verification evidence.
- Pilot RBAC boundaries for `viewer`, `operator`, and `admin`.
- Browser E2E baseline covering login, navigation, Hermes Channel, Hermes Dashboard, workflow preflight, approval, task detail, and RBAC.
- Production-style frontend deployment through an nginx static container.

## Product Mental Model

Operators should not be asked to understand every implementation module first.

They should start from one of these jobs:

```text
Diagnose a problem
Handle a Case
Execute or approve a remediation
Manage assets and access
Manage Hermes capabilities
Review evolution governance
Operate the platform
```

Implementation modules remain available, but they should appear as secondary entries, contextual jumps, or admin controls.

## Target Primary Entry Points

The platform should converge toward these primary entries:

| Entry | User question | Current route | Keep as primary? |
| --- | --- | --- | --- |
| Dashboard | What is the current platform and operations status? | `/dashboard` | Yes |
| Diagnosis Center | What is wrong, what evidence do we have, and should a Case be opened? | `/diagnosis-center` | Yes |
| Case Workbench | What are we handling, what is the current stage, and what should I do next? | `/operation-cases` | Yes |
| Execution Center | Which approvals, workflows, tasks, and verification results need attention? | `/execution-center` | Yes |
| Assets & Access | Which servers, network devices, Kubernetes clusters, credentials, and terminals are managed? | `/assets-center` | Yes |
| Hermes Console | How are Hermes Channels, Agents, Skills, MCP, tools, and runtime boundaries configured? | `/hermes-channels`, `/agents`, `/skills`, `/mcp-servers` | Yes, but grouped |
| Evolution Governance | Which proposals are evaluated, staged, approved, published, or rolled back? | `/evolution-proposals` | Yes |
| Platform Operations | Are backups, restore drills, health checks, audit logs, and settings healthy? | `/ops-readiness`, `/settings`, audit/report pages | Yes, admin-oriented |

The target top-level navigation should stay around 8 to 10 entries. Detailed pages should be reached from these entries instead of being equally promoted.

## Secondary Capabilities

These capabilities should remain available, but should not all be top-level navigation items:

| Capability | Recommended placement |
| --- | --- |
| Tool Approvals | Execution Center and Case context jump |
| Tasks | Execution Center and Case context jump |
| Workflows | Execution Center, Hermes template selection, admin advanced entry |
| Hermes Assistant | Case Workbench, Diagnosis Center, and Hermes Console |
| Hermes Dashboard / Kanban | Hermes Console and Case trace context |
| Agent Management | Hermes Console |
| Agent Teams | Hermes Console |
| Skills | Hermes Console capability management |
| MCP Servers | Hermes Console capability management |
| Tool Policy | Hermes Console or Platform Operations |
| Servers | Assets & Access |
| Network Devices | Assets & Access |
| Kubernetes / Kite | Assets & Access |
| Credentials | Assets & Access |
| Web Terminal | Asset detail and Assets & Access |
| Reports | Case, Execution Center, and Platform Operations |
| Audit Logs | Case trace and Platform Operations |
| Release Versions | Evolution Governance |
| Evaluation / Replay evidence | Evolution Governance |

## Current Usable Closed Loops

### Loop 1: Manual Or Alert-Driven Diagnosis

Status: usable for pilot.

Expected operator path:

```text
Diagnosis Center
  -> select asset / alert / context
  -> create Operation Case
  -> open Hermes diagnosis
  -> inspect evidence and recommendation
  -> continue from Case Workbench
```

Acceptance:

- Case is created.
- `correlationId` is generated and reused.
- Hermes receives Case context.
- Hermes session and diagnosis output can be traced.
- Case Workbench shows next action.

### Loop 2: Approval-Gated Remediation

Status: usable for pilot with admin approval.

Expected operator path:

```text
Case Workbench or Hermes Assistant
  -> submit remediation / run workflow request
  -> Tool Approval
  -> admin approve or reject
  -> task execution
  -> task evidence
  -> Case timeline
```

Acceptance:

- Operators can submit approval-gated actions.
- Only admins can approve or reject high-risk tool approvals.
- Approvals link to Case.
- Tasks link to Case.
- Case status and timeline update from downstream events.

### Loop 3: Task Tracking And Verification

Status: partially usable.

What works:

- Task detail shows workflow, logs, nodes, preflight, and related Case.
- Workflow/task events can update the Case timeline.
- Verification evidence is supported by trace and Case events.

Remaining closure:

- Verification should become a first-class operator action from Case Workbench.
- Verification result should be easier to read without opening raw task output.
- Failed verification should propose next Case action more explicitly.

### Loop 4: Retrospective Review And Evolution Proposal

Status: usable for controlled pilot, not fully productized.

What works:

- Hermes review/evolve role exists.
- Evolution proposals exist.
- Proposal status and release governance are traceable.
- Proposals can be linked back to Case through correlation evidence.

Remaining closure:

- Case Workbench should summarize proposal quality, source failure, evaluation result, staging replay, approval, and publish state.
- Evolution Governance should present proposal lifecycle as one pipeline instead of scattered technical records.
- Publishing must remain guarded and should not be automatic.

### Loop 5: Kubernetes-Aware Operations

Status: platform direction is valid; pilot depth is limited.

Current direction:

- Kubernetes is an asset family under Assets & Access.
- Kite can be used as a Kubernetes management and visualization container.
- Kubernetes clusters should link to their backing hosts.

Remaining closure:

- Kubernetes assets should appear in Case context selection.
- Pod, node, workload, event, and cluster health evidence should be normalized into Case context.
- Hermes should use Kubernetes evidence through read-only tools first.
- Mutating Kubernetes actions must require approval and policy checks.

## Pilot Permissions

The pilot role model remains:

| Role | Allowed | Blocked |
| --- | --- | --- |
| viewer | Read dashboards, Cases, traces, tasks, approvals, Hermes diagnosis/review results | Submit repair approval, run workflow, approve tools |
| operator | Diagnose, create Cases, submit approval-gated repair/workflow requests, run low-risk/read-only tools | Approve high-risk tools, bypass policy, destructive actions |
| admin | Configure runtime, Channels, users, backups, approve/reject tools, run governed execution | Destructive Tool API actions and policy bypass |

Key rule:

```text
Hermes can reason and propose.
Workflow and Tool API execute.
Policy and approval decide whether execution is allowed.
```

## Tool Execution Boundary

Allowed directly in pilot:

- Read-only inventory and status tools.
- Read-only command allowlist.
- Search and trace tools.
- Task and approval query tools.

Requires approval:

- `run_workflow`
- Remediation submission.
- Service restart.
- Cluster mutation.
- Network mutation.
- Remote script execution intent.

Denied:

- Destructive filesystem, disk, database, Kubernetes, or network operations.
- Approval bypass prompts.
- Sensitive secret reads.
- Shell control patterns outside the read-only allowlist.

## Information Architecture Decisions

### Decision 1: Case Workbench Is The Operator Spine

Case Workbench should become the place where an operator answers:

```text
What is this incident or operation?
What happened?
What is the current state?
What should I do next?
Where is the evidence?
```

Hermes, approvals, tasks, traces, and proposals are still first-class systems, but the Case is the product-level container.

### Decision 2: Hermes Console Is Capability Management

Hermes Console should organize:

- Channels.
- Agents.
- Skills.
- MCP Servers.
- Tool policies.
- Worker health.
- Runtime configuration.

Hermes Assistant remains the operator-facing interaction surface, but capability management should be in the console.

### Decision 3: Assets & Access Owns Infrastructure Objects

Servers, network devices, Kubernetes clusters, credentials, web terminal, and Kite should be grouped under Assets & Access.

Kubernetes should not become a separate product silo. It should be linked to hosts and Cases.

### Decision 4: Evolution Governance Owns Release Decisions

Evolution proposals, evaluation, staging replay, approval, publish, release overlay, and rollback should be treated as a governance pipeline.

Hermes can generate proposals, but publishing must remain explicit and auditable.

### Decision 5: Advanced Pages Are Still Useful

The goal is not to delete implementation pages immediately.

The goal is:

```text
Primary navigation: operator jobs.
Secondary navigation: detailed tools.
Context jumps: evidence and execution records.
Admin controls: runtime and governance configuration.
```

## Candidate Navigation Closure

Recommended primary navigation:

```text
1. Dashboard
2. Diagnosis Center
3. Case Workbench
4. Execution Center
5. Assets & Access
6. Hermes Console
7. Evolution Governance
8. Platform Operations
9. Settings
```

Optional secondary groups:

```text
Execution Center
  - Tool Approvals
  - Tasks
  - Workflows
  - Verification

Assets & Access
  - Servers
  - Network Devices
  - Kubernetes / Kite
  - Credentials
  - Terminal

Hermes Console
  - Hermes Channels
  - Hermes Dashboard
  - Agents
  - Teams
  - Skills
  - MCP Servers
  - Tool Policy

Evolution Governance
  - Proposals
  - Evaluation
  - Staging Replay
  - Releases
  - Audit Evidence

Platform Operations
  - Ops Readiness
  - Health
  - Backup / Restore
  - Audit Logs
  - Reports
```

## Real-Team Validation Scenarios

Before expanding usage, validate these scenarios end to end.

### Scenario A: Host CPU / Disk / Service Issue

Path:

```text
Diagnosis Center
  -> select server
  -> create Case
  -> Hermes diagnosis
  -> submit repair approval
  -> approve
  -> run task
  -> verify
  -> review
```

Pass criteria:

- Operator never needs to guess the next page.
- All records link back to Case.
- Approval is explicit.
- Verification is visible.
- Retrospective can generate a proposal without auto-publish.

### Scenario B: Kubernetes Pod / Node Issue

Path:

```text
Assets & Access
  -> Kubernetes cluster or Kite
  -> related host / workload
  -> create Case
  -> Hermes diagnosis with Kubernetes context
  -> approval-gated remediation
```

Pass criteria:

- Cluster, node, workload, and backing host context are visible.
- Read-only Kubernetes evidence is available.
- Mutating Kubernetes actions require approval.
- Case timeline remains the main record.

### Scenario C: Network Device Connectivity Issue

Path:

```text
Assets & Access
  -> network device
  -> diagnostic evidence
  -> create Case
  -> Hermes diagnosis
  -> approval-gated workflow
```

Pass criteria:

- Device evidence can be attached to Case context.
- Network mutation is blocked unless approved.
- Evidence chain includes command output, approval, and task result.

## Immediate Closure Backlog

### IA Phase 1: Completed

Implemented in the first information-architecture closure pass:

- Top-level navigation now exposes operator jobs instead of the old large Advanced menu.
- Added `Hermes Console` as the capability-management entry for Channels, Assistant, Board, Agents, Skills, MCP, policy, and settings.
- Added `Evolution Governance` as the proposal, evaluation, replay, approval, publish, and audit entry.
- Added `Platform Operations` as the readiness, health, backup/restore, audit, report, user, and settings entry.
- Dashboard capability and evolution cards now point to the new grouped entries.
- Legacy technical pages remain routable and are reached from centers or context links.
- Added browser E2E coverage for the consolidated navigation.

### P0: Product Usability

- Make Case Workbench the default post-diagnosis landing page.
- Add direct Case creation from asset detail pages.
- Add first-class verification action and result summary in Case Workbench.
- Reduce top-level navigation to the target primary entries.
- Rename grouped entries consistently: Hermes Console, Evolution Governance, Platform Operations.

### P1: Pilot Reliability

- Keep browser E2E as the pilot gate.
- Add E2E for the three real-team validation scenarios.
- Add screenshot checks for light and dark themes on Case Workbench, Dashboard, and Monitoring views.
- Keep test data cleanup automated.
- Add API smoke around Case creation, approval creation, task linkage, and trace lookup.

### P2: Infrastructure Readiness

- Keep SQLite for single-host pilot only.
- Plan PostgreSQL migration before broader rollout.
- Add off-host backup replication.
- Automate restore drill into isolated database.
- Add disk, backup freshness, Hermes worker, and failed task/approval alerting.

### P3: Governance Hardening

- Make tool policy review easier to understand from Hermes Console.
- Show why an action is allowed, approval-required, or blocked.
- Keep release publish guarded by evaluation and staging replay evidence.
- Link release overlay version back to Case summary when applicable.

### P4: Kubernetes Closure

- Normalize Kubernetes cluster/node/pod/workload context.
- Link Kubernetes objects to backing hosts.
- Add read-only Kubernetes evidence tools before mutating tools.
- Keep Kite as the visualization/management surface instead of rebuilding a full Kubernetes console.

## Stop-Doing List

Do not continue with:

- Adding more top-level navigation entries.
- Creating another separate Hermes page for every Hermes role.
- Duplicating Kubernetes UI that Kite already covers.
- Letting Agent Management duplicate Channel, Skill, and MCP configuration.
- Treating evolution proposals as automatic releases.
- Making destructive or high-risk tools executable without approval.

## Current Definition Of Done For Pilot

The platform is ready for a controlled pilot when all of the following remain true:

- Backend, frontend, and three Hermes workers are healthy.
- Pilot E2E passes.
- Backup exists and restore drill is documented.
- Test data cleanup leaves no smoke residue.
- Viewer/operator/admin boundaries are enforced.
- Operators can complete diagnosis, approval, task tracking, verification, and retrospective review from the Case-centered flow.
- The team understands that production auto-remediation is approval-gated and not unattended.

## Next Recommended Implementation Step

The next implementation step should be:

```text
Case Workbench usability closure
  -> direct Case creation from Assets & Access
  -> first-class verification action
  -> clearer linked evidence summaries
  -> navigation reduction to the primary entries
```

This keeps development aligned with the product spine instead of expanding sideways.
