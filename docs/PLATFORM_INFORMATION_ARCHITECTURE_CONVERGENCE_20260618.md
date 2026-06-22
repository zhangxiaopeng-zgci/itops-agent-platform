# Platform Information Architecture Convergence - 2026-06-18

## Background

The platform has grown from an Agent and Workflow management system into an AIOps Agent platform with Hermes runtime, channels, skills, MCP servers, approvals, task traces, remediation, and continuous evolution.

The previous navigation cleanup reduced visual noise, but it did not fully resolve the product problem: operators still had to understand many technical modules before completing one operational job.

This document defines the next product information architecture. The rule is:

```text
Primary navigation follows operator jobs.
Technical modules remain available as secondary pages, contextual jumps, or admin controls.
```

## Target Mental Model

```text
Diagnosis Center
  Find the problem, collect evidence, understand impact, and hand off to execution.

Execution Center
  Plan repair, pass approval gates, execute tasks, observe logs, and verify recovery.

Assets And Access
  Manage servers, network devices, credentials, terminal, and remote access.

Hermes Control Plane
  Manage channels, agents, skills, MCP servers, tool policy, and runtime boundaries.

Evolution Governance
  Review proposals, evaluate changes, replay, approve, publish, audit, and rollback.
```

## Capability Mapping

### Diagnosis Center

Primary purpose:

```text
alert -> context -> Hermes diagnosis -> evidence/RCA -> topology impact -> execution handoff
```

Included capabilities:

```text
Hermes Assistant
Alert Center
Root Cause Analysis
AI Root Cause Reports
AI Insights
Service Topology
Knowledge Base
Alert Noise
Alert Automation
```

First implementation:

```text
Route: /diagnosis-center
Primary navigation item: Diagnosis Center
Old pages: kept under Advanced and linked from the center page
```

### Execution Center

Primary purpose:

```text
repair plan -> approval -> workflow/task execution -> logs -> verification -> rollback/evidence
```

Included capabilities:

```text
Remediation Workbench
Tool Approvals
Workflows
Tasks
Remediation Executions
Remediation Dashboard
Remediation Policies
Scripts
Scheduled Tasks
```

First implementation:

```text
Route: /execution-center
Primary navigation item: Execution Center
Old pages: kept under Advanced and linked from the center page
```

### Assets And Access

Primary purpose:

```text
manage targets and access paths
```

Included capabilities:

```text
Servers
Network Devices
Kubernetes Clusters
Kubernetes Console / Kite
Credentials
Web Terminal
Remote Desktop
Ops Wallboard
```

First implementation:

```text
Assets & Access remains the primary asset entry.
Servers, network devices, Kubernetes clusters, credentials, terminal, remote desktop, and Kite are reached from this center or advanced links.
Kubernetes is intentionally treated as one asset family, not as a standalone primary navigation group.
```

### Hermes Control Plane

Primary purpose:

```text
manage the runtime boundary and capability surface for Hermes and Agents
```

Included capabilities:

```text
Hermes Channels
Agent Management
Agent Teams
Skills
MCP Servers
Tool Policy
AI Models
Settings
```

First implementation:

```text
Team Console, Agent Management, and Settings remain primary admin entries.
Detailed skill/MCP/tool-policy controls remain reachable from existing control pages.
```

### Evolution Governance

Primary purpose:

```text
proposal -> evaluation -> staging replay -> approval -> publish -> runtime overlay -> audit -> rollback
```

Included capabilities:

```text
Evolution Proposals
Release Versions
Evaluation Records
Replay Evidence
Ops Readiness
Audit Logs
Reports
```

First implementation:

```text
Evolution Proposals remains a primary governance entry.
Ops Readiness, Audit, and Reports remain secondary until they are folded into a governance console.
```

## Primary Navigation After First Implementation

```text
Home
  Dashboard

Ops Workspace
  Diagnosis Center
  Execution Center
  Assets & Access

Platform Control
  Hermes Channels
  Hermes Board
  Team Console
  Agent Management
  Evolution Proposals
  Settings

Advanced
  Existing detailed pages and admin-only secondary entries
```

## Why This Is Different From A Collapse

The previous cleanup changed where pages appeared. This convergence changes what the user is asked to think about.

Before:

```text
User chooses from implementation modules: Alerts, RCA, Hermes, Workflow, Tasks, Approval, Remediation, Topology.
```

After:

```text
User chooses an operational job: diagnose or execute.
The platform then exposes the relevant implementation modules as steps in that job.
```

## First Implementation Acceptance

The first implementation is acceptable when:

```text
/diagnosis-center exists and links the diagnosis chain.
/execution-center exists and links the execution chain.
Primary nav exposes Diagnosis Center and Execution Center.
Old detailed pages still work.
Frontend production build passes.
API smoke remains green.
Browser smoke confirms both centers render.
```

## Kubernetes Navigation Closure - 2026-06-22

Kubernetes support is closed as a secondary asset capability:

```text
Keep:
  Assets & Access -> Kubernetes Clusters
  Assets & Access -> Kubernetes Console / Kite
  Advanced -> Kubernetes Clusters
  Advanced -> Kubernetes Console
  Diagnosis / Execution contextual handoff

Remove from primary operator navigation:
  Kubernetes Console
```

Rationale:

```text
The primary navigation should describe the operating model, not every supported asset type.
Kubernetes is important context for diagnosis and execution, but AIOps Agent should not become a Kubernetes UI clone.
Deep Kubernetes resource UI is delegated to Kite.
The main development stack returns to Agent / Workflow / Hermes governance.
```

Reference:

```text
docs/KUBERNETES_CAPABILITY_CLOSURE_20260622.md
```

## Next Product Closure Steps

1. Convert Diagnosis Center from launchpad to workspace:

```text
select alert/server -> prefill Hermes context -> show evidence -> show topology impact -> hand off to Execution Center
```

2. Convert Execution Center from launchpad to workspace:

```text
select diagnosis/correlation -> generate repair plan -> show approval/task cards -> verify recovery
```

3. Move Hermes Assistant into contextual mode:

```text
Hermes remains the reasoning runtime, but the primary user entry becomes Diagnosis Center and Execution Center.
```

4. Merge governance details:

```text
Evolution Proposals + Release Versions + Ops Readiness + Audit into one governance console.
```

5. Apply role-aware navigation:

```text
viewer: Diagnosis Center, assets read-only, results
operator: Diagnosis Center, Execution Center, approvals/tasks allowed by policy
admin: Control Plane, Evolution Governance, Settings
```
