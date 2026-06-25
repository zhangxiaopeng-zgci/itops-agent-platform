# AIOps Agent Hermes-Centric Layered Architecture - 2026-06-25

## Purpose

This document defines the future target architecture for AIOps Agent.

The reference model is:

```text
Hermes is not only a chat assistant.
Hermes is the reasoning, decision, learning, and skill-evolution brain.

The platform should wrap Hermes with enterprise-grade MCP, Skill, permission,
API, workflow, asset, observability, and governance capabilities.
```

This architecture becomes the long-term north star after the current closure baseline.

## Core Direction

The platform should evolve from:

```text
Agent / Workflow management platform
```

to:

```text
Hermes-centric AIOps operating system
```

The important shift is:

```text
Do not just plug an LLM into an ops platform.
Put Hermes at the center as the operational brain,
then build the enterprise platform layers around it.
```

## Target Layer Model

The target architecture has seven layers:

```text
L7  Experience & Collaboration Layer
L6  Open API & Integration Layer
L5  Governance, Permission & Audit Layer
L4  Operations Control Plane Layer
L3  Capability Layer: MCP + Skill + Tool + Workflow
L2  Hermes Intelligence Layer
L1  Data, Asset & Execution Substrate Layer
```

The layers are intentionally separated so the platform can grow without mixing user experience, reasoning, execution, governance, and infrastructure concerns.

## Embedded Observability Six-Layer Model

The Hermes-centric architecture needs a concrete operations data model underneath it. The target observability model should follow six layers:

```text
6. Operations Management & Intelligent Analysis
5. Business & User Experience Monitoring
4. Application & Service Monitoring
3. Platform & Middleware Monitoring
2. Resource & Virtualization Monitoring
1. Infrastructure Monitoring
```

This six-layer model is not a competing architecture. It is the observability and operations-data backbone inside the seven-layer target architecture:

```text
Six-layer monitoring
  -> provides full-stack evidence
  -> feeds Case context and correlation trace
  -> gives Hermes reliable context
  -> enables diagnosis, approval-gated remediation, verification, and evolution
```

The lower three layers answer:

```text
Where is the resource or platform failure?
```

The upper three layers answer:

```text
How much business impact does it have?
Should we act?
How should we act?
```

Without the upper three layers, monitoring becomes an expensive alarm speaker. Without the lower three layers, business impact cannot be traced to reliable causes.

### Layer 1: Infrastructure Monitoring

Positioning:

```text
Data center, network, and physical equipment.
```

Scope:

- Data center power and environment: power distribution, UPS, air conditioning, temperature, humidity, water leakage, smoke detection.
- Network devices: core switches, routers, firewalls, load balancers.
- Physical servers: CPU, memory, disk, hardware health.

Core indicators:

- Device online rate.
- Resource utilization.
- Network latency and packet loss.
- Hardware alert events.

Platform mapping:

- Assets & Access: servers and network devices.
- Case context: physical asset, network device, hardware event.
- MCP Center: monitoring, SNMP, IPMI, DCIM, or network telemetry providers.

### Layer 2: Resource & Virtualization Monitoring

Positioning:

```text
Containers, Kubernetes, virtual machines, and cloud resource pools.
```

Scope:

- Virtual machine instances.
- Kubernetes clusters, nodes, pods, and containers.
- Cloud resource pools: compute, storage, and network resource watermarks.

Core indicators:

- Node resource watermark.
- Pod and container runtime status.
- Scheduling success rate.
- Resource overcommitment risk.

Platform mapping:

- Assets & Access: Kubernetes / Kite, cloud resources, VM inventory.
- Case context: cluster, node, pod, namespace, workload, backing host.
- MCP Center: Kubernetes, cloud, and virtualization providers.

### Layer 3: Platform & Middleware Monitoring

Positioning:

```text
Database, cache, message queue, registry, configuration center, and gateway.
```

Scope:

- Relational and distributed databases.
- Redis, Memcached, and cache systems.
- Kafka, RabbitMQ, RocketMQ, and message queues.
- Registry, configuration center, and API gateway.

Core indicators:

- QPS / TPS.
- Response time and latency.
- Connection count and queue backlog.
- Replication and cluster health.

Platform mapping:

- MCP Center: database, cache, queue, gateway, and middleware providers.
- Skill Center: database diagnosis, cache pressure, queue backlog, and gateway failure SOPs.
- Case context: middleware dependency and platform health evidence.

### Layer 4: Application & Service Monitoring

Positioning:

```text
Microservices, interfaces, dependencies, and runtime.
```

Scope:

- Application instances: health checks and runtime state.
- Microservice APIs: traffic, success rate, latency.
- Service dependency relationships.
- Runtime environment: JVM memory, GC, thread pools, process health.

Core indicators:

- Service availability.
- Interface success rate.
- Request response time.
- Error rate and exceptions.

Platform mapping:

- Diagnosis Center: service context and dependency evidence.
- Case Workbench: affected service and suspected dependency chain.
- Hermes: service-level diagnosis and stage judgment.
- Skill Center: service troubleshooting SOPs.

### Layer 5: Business & User Experience Monitoring

Positioning:

```text
Business flow, user experience, SLA, and SLO.
```

Scope:

- Core business flows: login, order, payment, refund, settlement.
- Business metrics: conversion rate, order volume, GMV, payment success rate.
- User experience: page load time, first-byte time, blank-screen time.
- End-to-end trace and business journey profiles.

Core indicators:

- SLA / SLO.
- Business success rate.
- Page load performance.
- Core business availability.

Platform mapping:

- Dashboard: business impact overview.
- Case Workbench: impact summary and business severity.
- Hermes: impact-aware prioritization and escalation advice.
- API Layer: business event intake from application platforms and BI systems.

### Layer 6: Operations Management & Intelligent Analysis

Positioning:

```text
Alert, RCA, capacity prediction, automation, self-healing, and AIOps.
```

Scope:

- Centralized alert management and assignment.
- Alert correlation and noise reduction.
- Root cause analysis.
- Capacity trend analysis and prediction.
- Automated remediation and self-healing.

Core target:

```text
Merge 100 alerts into 1 root cause.
If a repair is safe and approved, do not wait for manual toil.
```

Platform mapping:

- Hermes Intelligence: reasoning, diagnosis, remediation planning, retrospective analysis, and skill evolution.
- Case Workbench: operator spine and next action.
- Execution Center: approval, workflow, task, and verification.
- Evolution Governance: reusable lessons, skill drafts, evaluation, staging replay, and release guard.

## Six-Layer Design Principles

The observability model follows five principles:

### 1. Full-Stack Coverage

The platform must cover everything from data-center hardware to user experience. Any missing layer can become a blind spot.

### 2. Layered Decoupling

Each layer should do its own job. Infrastructure alerts, application alerts, and business alerts must be correlated, but not mixed into the same unstructured bucket.

### 3. Business-Oriented Monitoring

All monitoring should eventually answer:

```text
Is the business affected?
```

CPU at 100% matters less than whether users can still log in, order, pay, and receive service.

### 4. Unified Standards

Metric names, alert rules, log formats, labels, resource identifiers, severity levels, and correlation keys must be normalized.

Without standards, more data only creates more noise.

### 5. Extensibility And Intelligence

Monitoring data should be governed as future AIOps fuel.

Interfaces, metadata, label standards, and event schemas should be designed so Hermes can use them for diagnosis, automation, retrospective review, and self-evolution.

## L1: Data, Asset & Execution Substrate Layer

Purpose:

```text
Let Hermes and operators see the real operations environment,
but never let raw infrastructure access bypass governance.
```

This layer contains:

- Servers.
- Network devices.
- Kubernetes clusters.
- Cloud resources.
- Databases and middleware.
- Monitoring systems.
- Logs.
- Traces.
- CMDB.
- Release/change records.
- Tickets.
- On-call schedules.
- Knowledge bases.
- Runbooks.
- Remote terminal and execution backends.

Current project mapping:

| Capability | Current state |
| --- | --- |
| Servers | Exists |
| Network devices | Exists |
| Kubernetes / Kite | Started, should stay under Assets & Access |
| Credentials | Exists |
| Web terminal | Exists |
| Logs / monitoring / alerts | Partially exists |
| Knowledge base / runbook | Exists, needs stronger Case context integration |

Future direction:

- Normalize host, network, Kubernetes, and service assets into one asset graph.
- Link Kubernetes objects to backing hosts.
- Let Case context select assets from this layer.
- Keep execution adapters behind Tool API and approval.

## L2: Hermes Intelligence Layer

Purpose:

```text
Hermes performs thinking, decision support, learning, and skill evolution.
```

Responsibilities:

- Understand alerts and operator intent.
- Assemble context.
- Select skills.
- Decide which tools are needed.
- Chain diagnosis steps.
- Produce structured diagnosis.
- Propose remediation.
- Generate retrospective analysis.
- Extract reusable experience.
- Produce skill candidates.
- Improve future handling through memory and feedback.

Current project mapping:

| Hermes role | Current worker |
| --- | --- |
| Diagnose | `hermes-diagnose` |
| Remediate | `hermes-remediate` |
| Evolve / Review | `hermes-evolve` |

Key design rule:

```text
Hermes may reason and propose.
Hermes must not directly bypass Tool API, Policy, Approval, or Audit.
```

Future direction:

- Treat the three Hermes workers as logical brains, not just containers.
- Preserve profile/channel isolation for each role.
- Persist sessions, memory references, skill usage, and trace metadata.
- Let Hermes evolution produce proposals, not automatic production changes.

## L3: Capability Layer - MCP + Skill + Tool + Workflow

Purpose:

```text
Turn operations systems and organizational experience into reusable capabilities.
```

This layer has four parts.

### MCP Center

MCP Center is the nervous system.

Responsibilities:

- Register tool and context providers.
- Connect monitoring, logs, traces, CMDB, release, ticket, Kubernetes, cloud, database, and knowledge systems.
- Manage server health.
- Manage versions.
- Control permissions.
- Audit calls.
- Mark risk levels.
- Expose capabilities to Hermes Channels.

Current project mapping:

- MCP Server Registry exists.
- MCP health semantics exist.
- Channel bundle preflight exists.

Future direction:

- Separate read-only MCP providers from mutating providers.
- Add environment labels: dev, staging, production.
- Add capability certification: experimental, pilot, production-ready.
- Add import/export and backup verification for MCP registry.

### Skill Center

Skill Center is the organizational experience layer.

Responsibilities:

- Store alert triage strategies.
- Store service troubleshooting SOPs.
- Store database and middleware diagnosis flows.
- Store rollback procedures.
- Store RCA templates.
- Store retrospective patterns.
- Store business-specific incident experience.
- Accept Hermes-generated skill drafts.
- Route skill drafts through expert review.
- Version and publish approved skills.

Current project mapping:

- Skill Pack registry exists.
- Channel-to-skill binding exists.
- Evolution proposal pipeline exists.

Future direction:

```text
incident handling
  -> retrospective
  -> reusable steps
  -> skill draft
  -> expert review
  -> evaluation
  -> staging replay
  -> publish
  -> future Hermes reuse
```

### Tool Policy Center

Tool Policy Center controls what can be executed.

Responsibilities:

- Classify risk.
- Deny destructive actions.
- Require approval for high-risk actions.
- Enforce read-only command allowlist.
- Explain why an action is allowed, approval-required, or denied.

Current project mapping:

- Tool approval exists.
- Policy guard exists.
- Pilot RBAC exists.

Future direction:

- Make tool policy visible in Hermes Console.
- Add environment-aware policy packs.
- Add per-team and per-asset policy overlays.

### Workflow Center

Workflow Center is the deterministic execution and orchestration layer.

Responsibilities:

- Define runbooks.
- Execute approved remediation.
- Track task status.
- Persist node results.
- Expose preflight.
- Feed evidence back to Case.

Current project mapping:

- Workflows exist.
- Hermes-enhanced workflow templates exist.
- Workflow preflight exists.
- Task detail and Case linkage exist.

Future direction:

- Treat workflows as governed execution plans selected by Hermes.
- Add verification nodes as first-class workflow output.
- Link workflow templates to required skills, tools, and MCP providers.

## L4: Operations Control Plane Layer

Purpose:

```text
Give operators one operational spine instead of many disconnected pages.
```

This layer organizes the platform around operator jobs:

- Diagnosis Center.
- Case Workbench.
- Execution Center.
- Assets & Access.
- Hermes Console.
- Evolution Governance.
- Platform Operations.

Current project mapping:

- Diagnosis Center exists.
- Case Workbench exists.
- Execution Center exists.
- Assets & Access exists.
- Hermes Channels / Dashboard / Assistant exist.
- Evolution proposals exist.
- Ops readiness exists.

Future direction:

- Case Workbench becomes the primary operator spine.
- Execution Center owns approval, task, workflow, and verification views.
- Assets & Access owns servers, network devices, Kubernetes, credentials, terminal, and Kite.
- Hermes Console owns Channel, Agent, Skill, MCP, tool policy, and worker health.
- Evolution Governance owns proposal, evaluation, staging replay, approval, publish, release overlay, and rollback.

## L5: Governance, Permission & Audit Layer

Purpose:

```text
Make Hermes safe enough for real operations.
```

Responsibilities:

- Identity.
- Role model.
- Team and organization boundary.
- Environment isolation.
- Asset-level permission.
- Tool-level permission.
- Data-level permission.
- Approval.
- Audit.
- Evidence chain.
- Backup and restore governance.
- Release guard.

Current project mapping:

- `viewer`, `operator`, and `admin` roles exist.
- Tool approval exists.
- Audit log exists.
- Correlation trace exists.
- Case timeline exists.
- Release guard and overlay exist.

Future direction:

- Add team and environment scope.
- Add per-asset authorization.
- Add policy explanation UI.
- Add security review for mutating MCP providers.
- Add stronger release rollback evidence.

## L6: Open API & Integration Layer

Purpose:

```text
Make AIOps Agent a company-wide intelligent operations service,
not only a web UI.
```

API families:

- Alert intake API.
- Intelligent diagnosis API.
- Case API.
- RCA API.
- Runbook execution API.
- Approval API.
- Task API.
- Retrospective API.
- Skill query / draft / publish API.
- MCP management API.
- Asset API.
- Audit and trace API.

Integration targets:

- Monitoring platforms.
- Ticket systems.
- ChatOps.
- Release platforms.
- CMDB.
- Kubernetes platforms.
- Leadership dashboards.
- Internal developer portals.

Current project mapping:

- REST APIs exist for many modules.
- Tool API exists.
- Case API exists.
- Correlation trace API exists.

Future direction:

- Formalize external API contracts.
- Add webhook intake for alerts and tickets.
- Add API tokens / service accounts.
- Add idempotency keys for external event ingestion.
- Add OpenAPI documentation for pilot-ready APIs.

## L7: Experience & Collaboration Layer

Purpose:

```text
Let different users interact with the AIOps brain in the right surface.
```

Surfaces:

- Web console.
- Case Workbench.
- Hermes Assistant.
- Hermes Dashboard / Kanban.
- ChatOps.
- Ticket comments.
- Email or IM notification.
- Read-only executive summary.
- Developer portal integration.

Current project mapping:

- Web console exists.
- Hermes Assistant exists.
- Hermes Dashboard exists.
- Case Workbench exists.

Future direction:

- Make Case Workbench the default landing surface after diagnosis.
- Add ChatOps or webhook surface after core Case flow is stable.
- Keep high-risk actions inside approval-controlled UI.
- Add operator guidance instead of exposing raw module complexity.

## End-To-End Reference Flow

```text
Alert / Asset / Operator Input
  -> L7 Experience: Diagnosis Center or ChatOps
  -> L6 API: alert / diagnosis / case intake
  -> L4 Control Plane: create Operation Case
  -> L2 Hermes: understand, plan, and select skill
  -> L3 Capability: MCP context + Skill + Tool/Workflow candidates
  -> L5 Governance: policy, permission, approval, audit
  -> L1 Substrate: read evidence or execute approved action
  -> L4 Control Plane: task, verification, Case timeline
  -> L2 Hermes: retrospective and skill candidate
  -> L3 Skill Center: draft, review, evaluate, publish
  -> L4 Evolution Governance: release overlay
```

## Mapping To Current Closure Baseline

| Current baseline item | Target layer |
| --- | --- |
| Case Workbench | L4 Operations Control Plane |
| Hermes workers | L2 Hermes Intelligence |
| Hermes Channels | L3 Capability + L4 Control Plane |
| Skill Pack Registry | L3 Skill Center |
| MCP Server Registry | L3 MCP Center |
| Tool API | L3 Tool / Workflow + L5 Governance |
| Tool Approvals | L5 Governance |
| Workflow preflight | L3 Workflow + L5 Governance |
| Tasks | L4 Execution Center |
| Correlation trace | L5 Audit / Evidence |
| Evolution proposals | L3 Skill evolution + L4 Governance |
| Release overlays | L4 Evolution Governance + L5 Audit |
| Servers / Network / Kubernetes | L1 Substrate + L4 Assets & Access |

## Mapping Six-Layer Monitoring To The Seven-Layer Architecture

| Monitoring layer | Primary seven-layer home | Product surface | Hermes usage |
| --- | --- | --- | --- |
| 1. Infrastructure | L1 Data, Asset & Execution Substrate | Assets & Access | Hardware, network, and data-center evidence |
| 2. Resource & Virtualization | L1 Data + L4 Control Plane | Assets & Access, Kubernetes / Kite | Cluster, node, pod, VM, and resource scheduling evidence |
| 3. Platform & Middleware | L1 Data + L3 MCP/Skill | MCP Center, Skill Center | Database, cache, queue, gateway, and middleware diagnosis context |
| 4. Application & Service | L4 Control Plane + L3 Skill | Diagnosis Center, Case Workbench | Service dependency, interface, runtime, and error analysis |
| 5. Business & UX | L4 Control Plane + L6 API | Dashboard, Case Workbench, external APIs | Business impact, SLA/SLO, and escalation judgment |
| 6. Operations Intelligence | L2 Hermes + L5 Governance | Case Workbench, Execution Center, Evolution Governance | Alert convergence, RCA, remediation planning, verification, retrospective, and skill evolution |

The implementation rule is:

```text
Monitoring layers 1-5 provide evidence.
Layer 6 turns evidence into decision, action, and improvement.
Hermes powers layer 6, but all execution still passes governance.
```

## Architecture Principles

### 1. Hermes Is The Brain, Not The Executor

Hermes can decide what should be done.

Execution must go through Tool API, workflow, policy, approval, and audit.

### 2. Case Is The Product Spine

Every meaningful operational loop should have a Case.

Trace, task, approval, Hermes session, and proposal records should all link back to Case.

### 3. MCP Is Governance, Not Just Connectivity

MCP Center should not become a random connector marketplace.

It must own registration, health, version, permission, risk, and audit metadata.

### 4. Skill Is Organizational Memory

Skill Center should not be a static document library.

It should support:

```text
real incident -> retrospective -> skill draft -> review -> evaluation -> publish -> reuse
```

### 5. APIs Make The Platform Useful Beyond The UI

The web console is one surface.

The long-term value comes when monitoring, ticketing, ChatOps, release, and CMDB systems can call the AIOps brain through governed APIs.

### 6. Automation Must Be Gradual

The maturity path is:

```text
read-only diagnosis
  -> approval-gated recommendation
  -> approval-gated execution
  -> low-risk automatic execution
  -> high-risk human approval remains mandatory
```

## Evolution Roadmap From Current State

### Phase A: Layer Naming And Navigation Alignment

Goal:

```text
Make the UI match the target architecture.
```

Work:

- Rename or group Hermes pages under Hermes Console.
- Keep Case Workbench as the operator spine.
- Group Tool Approvals, Tasks, and Workflows under Execution Center.
- Group Servers, Network Devices, Kubernetes, Credentials, and Terminal under Assets & Access.
- Group Proposals, Evaluation, Replay, Releases, and Audit under Evolution Governance.

### Phase B: Case-Centric Operations Completion

Goal:

```text
Make a Case fully usable without page hunting.
```

Work:

- Create Case directly from asset detail pages.
- Add first-class verification action in Case Workbench.
- Add Case evidence summary by layer: Hermes, MCP, Skill, Approval, Task, Proposal.
- Add Case owner, severity, SLA, and team fields.

### Phase C: Six-Layer Observability Normalization

Goal:

```text
Make monitoring evidence usable by Case and Hermes across all six layers.
```

Work:

- Define common resource identity for data center, network, host, Kubernetes, middleware, service, and business flow.
- Add layer labels to alerts, metrics, logs, trace evidence, and Case context.
- Normalize severity, status, ownership, environment, and correlation fields.
- Add Case evidence summary grouped by monitoring layer.
- Add read-only MCP providers for the first three layers before mutating tools.
- Add business impact fields from layer 5 into Case severity and next-action judgment.

### Phase D: MCP And Skill Productization

Goal:

```text
Make MCP and Skill centers enterprise-grade.
```

Work:

- Add MCP readiness states: experimental, pilot, production-ready.
- Add Skill lifecycle: draft, reviewed, evaluated, staged, published, deprecated.
- Add import/export and backup/restore checks.
- Add policy and permission summary per Channel.

### Phase E: API Platformization

Goal:

```text
Expose AIOps Agent as an intelligent operations service.
```

Work:

- Define stable external APIs.
- Add webhook intake.
- Add service accounts and scoped API tokens.
- Add OpenAPI docs.
- Add idempotent event ingestion.

### Phase F: Controlled Self-Evolution

Goal:

```text
Let Hermes continuously improve skills, runbooks, and policy suggestions safely.
```

Work:

- Link failures and successful handling paths to proposal evidence.
- Generate Skill drafts from retrospectives.
- Evaluate proposals against historical Cases.
- Replay in staging.
- Require approval before publish.
- Write release overlay back to Case and Channel.

## What This Architecture Explicitly Avoids

- A giant flat navigation with every module at the same level.
- Hermes directly changing production systems.
- MCP connectors without permission and audit.
- Skills that are only static documents.
- Evolution proposals that auto-publish without review.
- Rebuilding a full Kubernetes UI when Kite can be integrated.
- Letting Agent Management duplicate Channel, Skill, MCP, and tool policy controls.

## Next Implementation Recommendation

The next implementation should align the product surface with this target architecture:

```text
Phase A + Phase B minimal slice:
  1. Add "Hermes Console" as the grouped capability-management entry.
  2. Keep Case Workbench as the default operational spine.
  3. Group Execution Center secondary links: approvals, tasks, workflows, verification.
  4. Group Assets & Access secondary links: servers, network, Kubernetes/Kite, credentials, terminal.
  5. Add Case evidence summary by architecture layer and monitoring layer.
```

This makes the platform feel less like a collection of pages and more like a layered AIOps operating system.
