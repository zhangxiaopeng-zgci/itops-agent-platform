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

Acceptance:

```text
User first chooses the affected object, then diagnoses or executes from that object.
```

## Phase 3 - Kubernetes Cluster Management

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

Acceptance:

```text
Kubernetes clusters are manageable assets and can be correlated with underlying hosts.
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
4. Diagnosis Center Workspace
5. Execution Center Workspace
6. Kubernetes Diagnosis And Execution
7. Capability Control Plane
8. Evolution Governance Center
9. Role-Based Navigation
10. Guided Onboarding
```

The reason for this order:

```text
First solve how users start.
Then define what objects they operate.
Then add Kubernetes.
Then deepen diagnosis and execution.
Then close capability governance and continuous evolution.
```
