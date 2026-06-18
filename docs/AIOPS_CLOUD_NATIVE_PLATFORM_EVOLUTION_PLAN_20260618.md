# AIOps Cloud Native Platform Evolution Plan - 2026-06-18

## Goal

Evolve the platform from a collection of Agent, Workflow, Hermes, Approval, Task, Skill, MCP, and remediation pages into a task-oriented AIOps Agent workspace for infrastructure and cloud-native operations.

The product should answer:

```text
What should I handle today?
What object is affected?
How do I diagnose it?
How do I execute safely?
How do I improve the platform after the incident?
```

## Target Centers

```text
Today Ops Workbench
  Entry page for pending work and recommended next actions.

Assets And Access Center
  Hosts, network devices, Kubernetes clusters, credentials, terminals, and remote access.

Diagnosis Center
  Alerts, assets, topology, Kubernetes context, Hermes diagnosis, evidence, RCA, and knowledge.

Execution Center
  Repair plans, approvals, workflows, tasks, kubectl/ssh tools, verification, rollback, and audit.

Capability Control Plane
  Hermes channels, agents, skills, MCP servers, tool policies, models, and role boundaries.

Evolution Governance Center
  Proposals, evaluations, staging replay, approvals, releases, runtime overlays, audit, and rollback.

Hermes Dashboard And Kanban Bridge
  Reuse the upstream Hermes Dashboard and durable Kanban board for Agent task visualization where it fits.
```

## External Hermes Dashboard Decision

Decision:

```text
Introduce Hermes Dashboard / Hermes Kanban as an optional external operator console instead of rebuilding every Agent task board inside this platform.
```

Rationale:

```text
Hermes already provides a dashboard surface for API key/configuration management, sessions, status, and operational visibility.
Hermes Kanban is designed as a durable task board for Agent work items and can reduce duplicated Kanban, run history, and worker log development.
This AIOps platform should keep ownership of assets, credentials, approvals, production execution, audit, release governance, and role boundaries.
Hermes Dashboard should be integrated as a companion control surface, not as the system of record for production changes.
```

Boundary:

```text
AIOps source of truth:
  assets, topology, users, roles, approvals, tasks, workflows, audit, releases, policies.

Hermes Dashboard source of truth:
  Hermes sessions, Agent work queue, Kanban task state, Hermes run history, worker visibility.

Shared bridge:
  correlationId, hermesSessionId, taskId, approvalId, proposalId, asset references, user/role context.
```

Integration principles:

```text
Prefer deep links, iframe/embed, and API bridge before copying UI.
Keep SSO/session handling explicit.
Keep dangerous tool execution behind AIOps approvals even if Hermes Kanban moves a card forward.
Mirror only minimal state needed for audit and navigation.
Support disabling Hermes Dashboard integration if the deployment cannot run it.
```

External references:

```text
User-provided WeChat reference for product/architecture direction:
  https://mp.weixin.qq.com/s/CYfrtxi18fxmdEpPgTFEkQ
  Extracted topic: Hermes multi-agent delegation, recursive orchestration, durable Kanban queue, worker lanes, and execution boundary.

Hermes Kanban user guide:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md

Hermes Kanban RFC / implementation tracking:
  https://github.com/NousResearch/hermes-agent/issues/16102

Hermes Agent v0.9.0 release note for Local Web Dashboard:
  https://github.com/NousResearch/hermes-agent/releases
```

User-reference interpretation guardrail:

```text
When applying the WeChat reference, first extract concrete principles into:
  operating model
  task board model
  human-agent collaboration boundary
  observability model
  governance model

Do not turn the reference into broad UI duplication.
Only implement ideas that strengthen the AIOps + Hermes division of responsibility.
```

Extracted principles from the WeChat reference:

```text
Single Agent has natural limits:
  context overflow
  serialized work
  mixed responsibilities

Hermes collaboration model:
  Orchestrator delegates bounded tasks to isolated child agents.
  Child agents receive explicit context and restricted tools.
  Recursive orchestration is useful but must be depth-limited.
  Parallel workers are useful only when tasks are independent enough.

Hermes Kanban model:
  Durable queue for long-running or restart-safe work.
  Lanes represent operational state, not production approval.
  Worker lanes can represent different profiles, models, prompts, tools, or external CLI agents.
  Pipeline, fleet, and circuit-breaker patterns are first-class scheduling ideas.

Execution boundary:
  Use delegated agents for work that requires reasoning.
  Use deterministic scripts/workflows for mechanical bulk execution.
  Do not delegate when the task needs user clarification.
  Do not rely on ephemeral child agents for long-running background work; use Kanban or AIOps tasks.
```

AIOps mapping:

```text
Diagnosis Center:
  AIOps builds a complete context pack.
  Hermes Orchestrator may delegate evidence collection, log review, topology impact, and recommendation drafting.

Execution Center:
  Hermes may prepare repair plans and verification plans.
  AIOps owns approval, task execution, audit, rollback, and verification records.

Capability Control Plane:
  Configure max concurrent children, max delegation depth, allowed worker lanes, allowed tools, and fallback behavior per Hermes Channel.

Evolution Governance:
  Kanban cards can become proposal candidates.
  Publishing still requires AIOps evaluation, staging replay, approval, and release guard.

Automation boundary:
  Deterministic batch operations should be scripts/workflows.
  Agent delegation should be reserved for ambiguous, evidence-heavy, or planning-heavy tasks.
```

## Phase 1 - Today Ops Workbench

Status:

```text
Started in this implementation.
```

Goal:

```text
Make the first screen explain how to use the platform.
```

Work items:

```text
Replace the metric-first dashboard with a task-first workbench.
Show primary paths: diagnose, execute, assets, capabilities, evolution.
Show current counts: open/high-risk alerts, pending approvals, running/failed tasks, pending evolution proposals.
Keep infrastructure metrics as a secondary runtime overview.
Link each card to the right center page.
```

Acceptance:

```text
User can enter the platform and choose a job path without understanding every technical module.
```

## Phase 2 - Assets And Access Center

Status:

```text
First version implemented in this iteration.
```

Goal:

```text
Unify operation targets and access methods.
```

Current assets:

```text
Servers
Network Devices
Credentials
Web Terminal
Remote Desktop
```

New cloud-native assets:

```text
Kubernetes Clusters
Kubernetes Nodes
Namespaces
Workloads
Pods
Services
Ingresses
Events
```

Key relationship:

```text
kubernetes_nodes.server_id -> servers.id
```

Work items:

```text
Create an Assets And Access Center.
Keep Servers and Web Terminal as high-frequency entries.
Move network devices, credentials, and remote desktop into asset actions.
Add asset detail pages with recent alerts, tasks, Hermes sessions, topology, and allowed actions.
```

Implemented baseline:

```text
Added /assets-center as the primary Assets And Access entry.
Moved Servers and Web Terminal out of the top-level Ops Workspace and kept them under Advanced.
Aggregated hosts, network devices, credentials, Web Terminal, Remote Desktop, Diagnosis Center, and Execution Center.
Added a visible Kubernetes cluster asset family placeholder for the next phase.
Linked the Today Ops Workbench asset card to /assets-center.
```

Acceptance:

```text
User first chooses the affected object, then diagnoses or executes from that object.
```

## Phase 3 - Kubernetes Cluster Management

Status:

```text
Baseline started in this implementation.
```

Goal:

```text
Support Kubernetes as a first-class operations object.
```

Data model:

```text
kubernetes_clusters
kubernetes_nodes
kubernetes_namespaces
kubernetes_workloads
kubernetes_pods
kubernetes_services
kubernetes_events
```

Work items:

```text
Add cluster list and cluster detail pages.
Support kubeconfig, token, and certificate credentials.
Add connection test and cluster sync.
Sync nodes, namespaces, workloads, pods, services, and events.
Auto-link Kubernetes nodes to host assets by internal IP and hostname.
Support manual node-to-host bind and unbind.
Show cluster health, API server status, Kubernetes version, node health, abnormal pods, recent events, and node-host coverage.
```

Implemented baseline:

```text
Added Kubernetes asset inventory tables for clusters, nodes, namespaces, workloads, pods, services, and events.
Added /api/kubernetes-clusters for cluster registration, list, detail, delete, asset aggregation, and connection metadata validation.
Added Kubernetes Cluster Management page for registering clusters and viewing inventory counters.
Connected Assets And Access Center to real Kubernetes cluster counts and navigation.
Kept live kubeconfig/token probing and sync for the next implementation slice.
```

Acceptance:

```text
Kubernetes clusters are manageable assets and can be correlated with underlying hosts.
```

## Phase 3B - Hermes Dashboard And Kanban Bridge

Status:

```text
Discovery baseline documented after Kubernetes asset baseline.
```

Discovery document:

```text
docs/HERMES_DASHBOARD_KANBAN_BRIDGE_DISCOVERY_20260618.md
```

Goal:

```text
Reuse Hermes Dashboard and its built-in durable Kanban as the Agent work queue and visibility surface, reducing duplicated dashboard development inside AIOps Agent.
```

Why now:

```text
The platform already has Hermes workers, channels, sessions, traces, approvals, tasks, evolution proposals, and a growing operator workspace.
Without a bridge, AIOps may duplicate Hermes task board, run history, worker log, and Agent execution visibility.
With a bridge, the platform can focus on assets, production safety, and operational workflows while Hermes provides the Agent-native board.
```

Target experience:

```text
Operator opens AIOps Workbench.
If the task is an Agent work item, AIOps shows the linked Hermes Kanban card or opens the embedded Hermes Dashboard view.
If the task requires production action, AIOps keeps approval, execution, audit, and verification in its own Execution Center.
Every cross-system action carries correlationId and deep links back to AIOps.
```

Work items:

```text
Add Hermes Dashboard integration settings:
  dashboardUrl
  enabled
  embedMode: link | iframe | sidecar
  authMode: none | reverse_proxy | token
  allowedOrigins

Add a Hermes Dashboard health probe:
  reachable
  version/capability summary if available
  kanbanAvailable
  lastCheckedAt

Add navigation entry under Capability Control Plane:
  Hermes Dashboard
  Hermes Kanban

Add AIOps-to-Hermes deep links:
  Hermes session -> dashboard session/run
  Evolution proposal -> Kanban card
  Diagnosis/Execution correlation -> Kanban lane/card

Add Hermes-to-AIOps callback contract:
  correlationId
  externalCardId
  externalRunId
  externalTaskState
  linked approvalId/taskId/proposalId

Add state mirror table:
  hermes_external_links
  source_type
  source_id
  correlation_id
  external_system
  external_url
  external_card_id
  external_state
  last_synced_at

Add security guard:
  iframe allowlist
  role-based visibility
  read-only fallback
  no direct production execution bypass

Add delegation policy per Hermes Channel:
  maxConcurrentChildren
  maxSpawnDepth
  allowedWorkerLanes
  allowedExternalCliWorkers
  delegateAllowed
  kanbanRequiredForLongRunning
  circuitBreakerThreshold

Add context pack contract:
  source page
  asset references
  alert references
  topology impact
  recent tasks
  approvals
  knowledge hints
  allowed tools
  expected output schema

Add work routing rules:
  transient delegate_task for bounded reasoning subtasks
  Hermes Kanban for durable multi-step queues
  AIOps Workflow/Scripts for deterministic execution
  AIOps Approval for production-changing actions
```

Acceptance:

```text
Operators can jump from AIOps task/proposal/session context to Hermes Dashboard/Kanban and return with correlation intact.
AIOps does not duplicate Hermes Kanban UI.
Production execution still goes through AIOps approval, task, audit, and verification controls.
The integration can be disabled without breaking core AIOps workflows.
```

Risks:

```text
Hermes Dashboard API and deep-link contract may not be stable enough for tight coupling.
Embedding may require reverse proxy, auth, and CSP adjustments.
Kanban card state must not be treated as production approval.
If Hermes Dashboard is unavailable, AIOps must degrade to native session/proposal/task views.
```

Recommended implementation slices:

```text
3B-1: Discovery spike
  Deploy or connect Hermes Dashboard in the test environment.
  Confirm URL structure, auth, Kanban persistence, deep links, and available APIs.
  Baseline findings are documented in docs/HERMES_DASHBOARD_KANBAN_BRIDGE_DISCOVERY_20260618.md.

3B-2: Read-only bridge
  Add settings, health probe, navigation link, and external link table.
  Show Hermes Dashboard link/embed from Hermes Assistant, Evolution Proposals, and Capability Control Plane.

3B-3: Delegation policy baseline
  Add channel-level delegation limits, allowed lanes, and circuit-breaker settings.
  Render delegation capability summary in Capability Control Plane.

3B-4: Correlation bridge
  Write externalCardId/externalRunId onto Hermes sessions, proposals, tasks, and trace views.
  Add jump-back links from Hermes work items to AIOps pages where possible.

3B-5: Operational contract
  Define which Kanban lane transitions can create AIOps proposals or approval drafts.
  Keep publish/execution gated inside AIOps.
```

## Phase 4 - Unified Asset Topology

Goal:

```text
Connect hosts, network devices, Kubernetes objects, services, alerts, tasks, and Hermes sessions.
```

Relationships:

```text
Pod -> Workload -> Namespace -> Cluster
Pod -> Node -> Server
Server -> Network Device
Service -> Workload
Ingress -> Service
Alert -> Asset
Task -> Asset
Hermes Session -> Asset
```

Work items:

```text
Extend topology model for cloud-native assets.
Support host, network, Kubernetes, and service dependency views.
Make topology nodes actionable: diagnose, execute, view details.
Infer blast radius for node/server/service failures.
```

Acceptance:

```text
Diagnosis can reason over upstream and downstream impact rather than isolated resources.
```

## Phase 5 - Diagnosis Center Workspace

Goal:

```text
Upgrade Diagnosis Center from a launchpad to a real troubleshooting workspace.
```

Diagnosis objects:

```text
Alert
Server
Network Device
Kubernetes Cluster
Namespace
Workload
Pod
Service
Topology Node
```

Work items:

```text
Allow object selection.
Automatically build Hermes context with assetId, assetType, alertId, serverId, clusterId, namespace, workload, pod, nodeName, relatedServerIds, topology impact, recent alerts, tasks, events, logs, and knowledge hints.
Render structured Hermes output: conclusion, evidence, impact, risk, recommended action, approval need, execution recommendation.
Provide actions: generate repair plan, hand off to Execution Center, write knowledge, create evolution proposal.
```

Acceptance:

```text
Diagnosis Center becomes the primary incident analysis workflow.
```

## Phase 6 - Kubernetes Diagnosis Skill And MCP

Goal:

```text
Make Hermes understand Kubernetes failures with safe read-only tools.
```

Read-only context:

```text
kubectl get nodes
kubectl get pods
kubectl describe pod
kubectl describe node
kubectl logs
kubectl get events
kubectl rollout status
```

Work items:

```text
Add Kubernetes diagnosis skill.
Add Kubernetes MCP or Tool Registry adapter.
Allow Diagnosis Center to select tools based on object type.
Classify failure modes: application error, scheduling error, image pull error, resource pressure, node issue, network issue, storage issue.
```

Acceptance:

```text
Hermes can diagnose common Kubernetes incidents with evidence.
```

## Phase 7 - Execution Center Workspace

Goal:

```text
Upgrade Execution Center from a launchpad to a repair loop.
```

Work items:

```text
Accept diagnosisId or correlationId from Diagnosis Center.
Show repair plan, risk, target objects, expected outcome, rollback plan.
Embed approval state and task state.
Show node progress, logs, failures, duration.
Add verification actions for host, service, pod readiness, and alert resolution.
Write execution result back to Hermes session, trace, audit, knowledge, and evolution proposal evidence.
```

Acceptance:

```text
User no longer jumps between Hermes, Workflow, Task, Approval, and Remediation pages to complete one repair.
```

## Phase 8 - Kubernetes Execution Tools

Goal:

```text
Support controlled kubectl remediation.
```

Risk levels:

```text
Low: get, describe, logs, top, rollout status
Medium: restart deployment, scale deployment, cordon, uncordon
High: delete pod, drain node, apply manifest, rollback deployment, patch configmap, patch secret
```

Work items:

```text
Add kubectl tools to Tool Registry.
Add Kubernetes risk rules to Tool Policy.
Route medium/high risk tools through approval.
Record kubectl output in task logs.
Verify Pod ready, Deployment available, Service endpoints, and event recovery.
```

Acceptance:

```text
Kubernetes repair enters the same approval, task, audit, verification, and rollback loop.
```

## Phase 9 - Capability Control Plane

Goal:

```text
Organize capability management by channel.
```

Channel view:

```text
Channel
  Agent
  Skill
  MCP Server
  Tool Policy
  Model
  Role Permission
  Health
```

Work items:

```text
Create a Capability Control Plane.
Show bound agents, skills, MCP servers, tools, policies, models, recent calls, and health per channel.
Reframe Agent Management as role definition.
Reframe Skill and MCP pages as capability configuration.
Add Kubernetes diagnosis and remediation skills to the capability model.
```

Acceptance:

```text
Admin can understand what each Hermes channel can and cannot do.
```

## Phase 10 - Evolution Governance Center

Goal:

```text
Productize continuous evolution.
```

Governance flow:

```text
failure/feedback -> proposal -> evaluation -> staging replay -> approval -> publish -> runtime overlay -> usage evidence -> rollback
```

Work items:

```text
Create an Evolution Governance Center.
Group proposals by source: failed task, diagnosis miss, Kubernetes incident, tool failure, manual feedback.
Show evidence source, affected object, target change, risk, evaluation score, replay result, release state, runtime overlay usage, and rollback state.
Generate runbook, skill, workflow, and tool policy proposals from Kubernetes incidents.
```

Acceptance:

```text
Self-evolution becomes observable, reviewable, and operable.
```

## Phase 11 - Role-Based Navigation And Permission Boundaries

Goal:

```text
Different roles see different product surfaces.
```

Role model:

```text
Viewer:
  Workbench, Diagnosis Center, read-only assets, execution results, audit.

Operator:
  Workbench, Diagnosis Center, Execution Center, asset access, low-risk execution, approval submission.

Admin:
  All centers, Capability Control Plane, Evolution Governance, policy, model config, publish, rollback.
```

Work items:

```text
Trim navigation by role.
Trim buttons by permission.
Show current mode: read-only, approval-required, auto-allowed.
Add dangerous prompt and dangerous tool interception.
```

Acceptance:

```text
The platform can be safely opened to real operators instead of only admins.
```

## Phase 12 - Guided Onboarding And Scenario Templates

Goal:

```text
Make the platform usable without prior module knowledge.
```

Scenario templates:

```text
Host CPU high
Disk full
Service unavailable
Pod CrashLoopBackOff
ImagePullBackOff
Node NotReady
Network connectivity issue
```

Work items:

```text
Add first-login guide.
Add empty-state guidance.
Add recommended start paths on the Workbench.
For each template define diagnosis prompt, required data, suggested tools, repair actions, risk level, and verification.
```

Acceptance:

```text
New users can complete a diagnosis-to-execution loop without understanding every page first.
```

## Recommended Execution Order

```text
1. Today Ops Workbench
2. Assets And Access Center
3. Kubernetes Cluster Management
4. Hermes Dashboard And Kanban Bridge
5. Diagnosis Center Workspace
6. Execution Center Workspace
7. Kubernetes Diagnosis And Execution
8. Capability Control Plane
9. Evolution Governance Center
10. Role-Based Navigation
11. Guided Onboarding
```

The reason for this order:

```text
First solve how users start.
Then define what objects they operate.
Then add Kubernetes.
Then reuse Hermes-native Dashboard/Kanban before duplicating Agent work board features.
Then deepen diagnosis and execution.
Then close capability governance and continuous evolution.
```
