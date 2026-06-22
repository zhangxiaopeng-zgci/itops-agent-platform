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

Internal Hermes Board
  Use the three Hermes instances deployed with this project as the native Agent task board and visibility surface.
```

## Hermes Board Decision

Updated decision:

```text
Do not make Hermes Board primarily depend on an external Dashboard.
Build the platform Hermes Board from the three in-project Hermes instances:
  hermes-diagnose
  hermes-remediate
  hermes-evolve
The previous external bridge remains optional compatibility only.
```

Rationale:

```text
The current deployment already runs three real Hermes containers.
AIOps already persists Hermes worker runs, Hermes sessions, trace refs, approvals, tasks, and evolution proposals.
This AIOps platform should keep ownership of assets, credentials, approvals, production execution, audit, release governance, and role boundaries.
The operator should not have to configure an external Dashboard before seeing Hermes work.
```

Boundary:

```text
AIOps source of truth:
  assets, topology, users, roles, approvals, tasks, workflows, audit, releases, policies.

Hermes Worker source of truth:
  Worker health, worker model/upstream status, run history, fallback status, latency, worker role.

Shared bridge:
  correlationId, hermesSessionId, workerRunId, taskId, approvalId, proposalId, asset references, user/role context.
```

Integration principles:

```text
Read from the current project's three Hermes Worker instances first.
Use AIOps persisted worker runs and Hermes sessions as the board data source.
Keep dangerous tool execution behind AIOps approvals even if a Hermes card or lane advances.
Treat external Hermes Dashboard as optional secondary integration, not as the primary product surface.
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

User-provided WeChat reference for enterprise AIOps Agent platform:
  https://mp.weixin.qq.com/s/BR2OoLYlqJzCEgdyqImpTA
  Title: 如何搭建一套“会思考”的企业AIOps智能体平台？内部实战全拆解
  Extracted topic: intent parsing, tool routing, data aggregation, reasoning attribution, Skills, Knowledge/RAG, governance, and Bad Case feedback.
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

## Enterprise AIOps Agent Principles

Reference-derived principle:

```text
The product is not "LLM plus chat".
It must behave as an auditable SRE work system:
  intent parsing
  tool routing
  data aggregation
  reasoning attribution
  verification
  feedback and evolution
```

Architecture mapping:

```text
Agent layer:
  Planner extracts entities, actions, time windows, environment, constraints, and expected output.
  Executor calls Skills, MCP servers, workflow APIs, and read-only evidence tools.
  Reflector checks confidence, missing evidence, fallback paths, and Bad Case candidates.

Skill layer:
  Every Skill needs schema, parameter validation, permission boundary, timeout, result cap, output normalizer, and risk label.
  Skill execution evidence must be visible on Hermes Board and correlation trace.

Knowledge layer:
  Knowledge retrieval must be filtered by environment, service, version, owner, and asset scope.
  Incident review and Bad Case feedback should create Knowledge/Skill/Workflow improvement candidates.

Governance layer:
  Sensitive data is masked before persistence and retrieval.
  Production-changing actions default to dry-run or approval-required.
  Cost controls prefer cache/lightweight models for repeated low-risk work and stronger models for complex evidence-heavy cases.
```

Priority scenario mapping:

```text
1. Trace + Metrics cross-analysis for P99 latency anomalies.
2. TraceId error propagation and first-fault attribution.
3. Natural-language log query with SQL/schema safety.
4. Slow SQL and N+1 query pattern detection.
5. Release-to-incident correlation with confidence scoring.
6. Bad Case feedback loop into Evolution Governance.
```

Product adjustment:

```text
Internal Hermes Board should evolve from status display to evidence-chain workbench.
Each board card should expose:
  workerRunId
  hermesSessionId
  correlationId
  tool/skill/MCP evidence
  approvalId
  taskId
  proposalId
  confidence / missing evidence / next action
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

## Phase 3B - Internal Hermes Board

Status:

```text
Read-only bridge baseline implemented after Kubernetes asset baseline.
Delegation policy baseline implemented at Hermes Channel level.
Direction corrected: the main Hermes Board is internal and connects to the current project's three Hermes instances.
```

Discovery document:

```text
docs/HERMES_DASHBOARD_KANBAN_BRIDGE_DISCOVERY_20260618.md
```

Goal:

```text
Expose the three in-project Hermes instances as an internal Agent work board:
  diagnose lane
  remediate lane
  evolve lane

The board reads AIOps worker health, worker run history, persisted Hermes sessions, extracted refs, and correlation evidence.
```

Why now:

```text
The platform already has Hermes workers, channels, sessions, traces, approvals, tasks, evolution proposals, and a growing operator workspace.
The platform already has Hermes worker containers and observability tables.
Operators need a direct view into those three workers, not a separate external dashboard dependency.
The platform should still avoid duplicating deterministic workflow/task execution screens.
```

Target experience:

```text
Operator opens AIOps Workbench.
If the task is an Agent work item, AIOps shows the internal Hermes Board lane and linked Hermes session/run.
If the task requires production action, AIOps keeps approval, execution, audit, and verification in its own Execution Center.
Every action carries correlationId and links back to AIOps evidence.
```

Work items:

```text
Keep optional external Dashboard compatibility settings:
  dashboardUrl
  enabled
  embedMode: link | iframe | sidecar
  authMode: none | reverse_proxy | token
  allowedOrigins

Keep optional external Dashboard health probe:
  reachable
  version/capability summary if available
  kanbanAvailable
  lastCheckedAt

Add navigation entry under Capability Control Plane:
  Hermes Board
  Three internal Hermes lanes

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
  Add internal board page over existing worker status, worker run history, and Hermes session APIs.
  Show three lanes for diagnose/remediate/evolve.
  Implemented baseline:
    /api/hermes-workers
    /api/hermes-workers/runs
    /api/hermes-sessions
    /hermes-dashboard internal board page
    Capability Control Plane navigation entry
  Compatibility retained:
    /api/hermes-dashboard/settings
    /api/hermes-dashboard/health
    /api/hermes-dashboard/external-links
    hermes_external_links table

3B-3: Delegation policy baseline
  Add channel-level delegation limits, allowed lanes, and circuit-breaker settings.
  Render delegation capability summary in Capability Control Plane.
  Implemented baseline:
    hermes_channels.delegate_allowed
    hermes_channels.max_concurrent_children
    hermes_channels.max_spawn_depth
    hermes_channels.allowed_worker_lanes
    hermes_channels.allowed_external_cli_workers
    hermes_channels.kanban_required_for_long_running
    hermes_channels.circuit_breaker_threshold
    Hermes runtime channel config exposes delegationPolicy
    Hermes Channel console supports editing delegation policy
  Boundary:
    This phase defines governance and runtime metadata.
    It does not yet perform automatic durable card scheduling.
    Production-changing actions remain gated by AIOps approval/task controls.

3B-4: Correlation bridge
  Link workerRunId, hermesSessionId, approvalId, taskId, proposalId, and correlationId in the internal board.
  Add jump links from board cards to AIOps task, approval, proposal, and correlation trace pages.
  Optimize from the enterprise AIOps reference:
    Board cards are evidence-chain cards, not just run-status cards.
    Run/session cards must show intent, evidence refs, missing evidence, and next action.
    Existing jump targets are used first: tasks, tool approvals, evolution proposals.
    A dedicated correlation trace page/drawer is a follow-up when the data contract is ready.
  Implemented first slice:
    Worker run and Hermes session cards open a read-only detail drawer.
    The drawer shows identity, status, timing, input/output, errors, correlationId, and extracted refs.
    Hermes session cards expose approvalId and taskId as clickable evidence links.
    correlationId is shown as a stable evidence marker until a dedicated correlation page/drawer is introduced.
    Unsupported deep links are intentionally not shown.
  Implemented second slice:
    The detail drawer now loads /api/correlations/:id when a correlationId is present.
    It renders an inline correlation trace summary with Worker runs, Hermes sessions, Agent executions, approvals, tasks, team runs, audit logs, and execution evidence counts.
    It surfaces risk levels, tool calls, latest evidence timestamp, and linked approval/task jump links.
    This keeps the first operator experience inside the board while preserving the dedicated correlation trace page as a later IA decision.

3B-5: Operational contract
  Define which internal board lane transitions can create AIOps proposals or approval drafts.
  Keep publish/execution gated inside AIOps.
  Implemented:
    The Hermes board detail drawer renders an Operational Contract section.
    Board actions are explicitly read-only for evidence viewing.
    Execution remains gated by Tool Approval and Task views.
    Evolution remains proposal-only and must pass evaluation, staging replay, approval, and publish before runtime effect.
    Viewer can inspect the contract but cannot submit feedback that creates proposals.

3B-6: Intent and evidence contract
  Persist structured intent summaries from Hermes sessions:
    entities
    action
    timeWindow
    environment
    assetRefs
    expectedOutput
  Persist evidence summary:
    toolsUsed
    skillsUsed
    mcpServersUsed
    confidence
    missingEvidence
    suggestedNextAction
  Implemented:
    hermes_sessions now includes intent_summary and evidence_summary JSON columns.
    New Hermes sessions persist deterministic summaries at creation time.
    Existing sessions are rendered with a client/server fallback summary when stored summaries are absent.
    Runtime metadata is used to capture tools, skills, and MCP servers where available.

3B-7: Bad Case feedback loop
  Add board-level feedback:
    useful
    wrong root cause
    missing evidence
    unsafe action
    needs workflow
  Feed Bad Cases into Evolution Governance as proposal candidates.
  Implemented:
    hermes_board_feedback records every board feedback action with source, category, correlationId, evidence refs, actor, and generated proposal id.
    Useful feedback is audit-only.
    Bad Case feedback uses createOrGetFeedbackDrivenProposal so repeated feedback reuses the same active proposal candidate.
    Hermes board detail drawer exposes feedback buttons and links to generated evolution proposals.
    Proposal publish remains gated by the existing Evolution Governance flow.
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

Implemented first slice:

```text
Topology API now merges servers, network devices, Kubernetes clusters, nodes, namespaces, workloads, pods, and services into one graph.
Kubernetes nodes connect to backing servers through server_id first, then read-only name/IP inference.
Kubernetes hierarchy is rendered as Cluster -> Namespace -> Workload -> Pod, Cluster -> Node -> Pod, Node -> Server, and Service -> Workload where selectors can be inferred.
The topology page shows asset scope metrics and renders node type labels so operators can distinguish host, network, and cloud-native assets.
No runtime data mutation is introduced in this slice; missing namespace records are represented as synthetic read-only topology nodes.
```

Remaining:

```text
Add alert, task, and Hermes session asset links.
Add actionable node drill-downs into Diagnosis Center and Execution Center.
Add blast-radius query APIs that traverse cloud-native and server dependency paths.
Add explicit Server <-> Network Device relationships once a durable network topology model is introduced.
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

Implemented first slice:

```text
Diagnosis Center now includes a Diagnosis Workspace.
Operators can select a topology asset and optionally bind an alert.
The workspace derives related server ids, immediate upstream/downstream impact, nearby assets, asset type, status, and alert context from the unified topology graph.
The workspace can open Hermes Assistant with URL context parameters: mode, serverIds, alertId, and a generated diagnosis prompt.
Hermes Assistant consumes those URL parameters once and pre-fills mode, selected servers, alert, workflow/category when present, and prompt input.
The workspace also provides quick handoff links to Topology and Execution Center.
All new workspace text is native React i18n, not DOM post-processing.
```

Remaining:

```text
Embed structured Hermes output directly in Diagnosis Center.
Add recent tasks, events, logs, and knowledge hints into the context builder.
Add explicit asset-scoped blast-radius API instead of frontend-only nearby calculation.
Add actions for repair-plan generation, knowledge write-back, and evolution proposal creation.
Make Execution Center consume asset context parameters.
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
