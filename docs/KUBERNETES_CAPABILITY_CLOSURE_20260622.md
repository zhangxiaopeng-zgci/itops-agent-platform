# Kubernetes Capability Closure - 2026-06-22

## Closure Decision

Kubernetes support is now treated as a cloud-native asset and context capability, not as a new primary product line.

The platform keeps Kubernetes capabilities where they strengthen the AIOps Agent workflow:

```text
asset registration
credential governance
asset snapshot / API sync
topology context
Hermes diagnosis handoff
Execution Center handoff
Kite console entry
```

The platform should not continue rebuilding a full Kubernetes management product. Resource browsing, visual operations, logs, and deep Kubernetes UI are delegated to Kite.

## Current Capability Boundary

### AIOps Owns

```text
Kubernetes cluster registry
Kubernetes credential registry
safe credential detail and delete protection
asset snapshot persistence
token / kubeconfig API sync baseline
node-to-host binding
topology graph integration
Hermes diagnosis prompt handoff
Execution and approval boundary
audit and smoke validation
```

### Kite Owns

```text
Kubernetes visual dashboard
resource browsing and resource-level operations
cluster resource detail views
interactive Kubernetes operator UI
```

### Hermes Owns

```text
read-only diagnosis
evidence synthesis
risk and next-action recommendation
repair plan drafting
post-incident evolution proposal input
```

Hermes must still go through AIOps approval, workflow, task, trace, and release governance for production-changing actions.

## Product Surface After Closure

Primary navigation should stay focused on the core AIOps operating model:

```text
Dashboard
Diagnosis Center
Execution Center
Assets & Access
Hermes Board / Channels
Agent Management
Evolution Proposals
Settings
```

Kubernetes remains available as a secondary asset capability:

```text
Assets & Access -> Kubernetes Clusters
Assets & Access -> Kubernetes Console / Kite
Advanced -> Kubernetes Clusters
Advanced -> Kubernetes Console
Diagnosis Center / Execution Center context links
Topology asset graph
```

This avoids teaching operators that Kubernetes is the main product. The main product remains the Agent / Workflow / Hermes governed operations platform.

## Acceptance Evidence

Remote validation target:

```text
http://10.1.132.58:3000
backend: 3001
Kite: 3002
```

Validated on 2026-06-22:

```text
Docker production build: backend and frontend passed
Hermes containers: diagnose / remediate / evolve healthy
Kubernetes credential API: create, safe detail, usage reference, delete protection, cleanup passed
Full API smoke: 36/36 passed
Browser smoke: Kubernetes credential card and detail modal rendered, raw token not exposed
Temporary test data: cleaned up
```

Latest Kubernetes closure commits:

```text
be78003 feat: support kubeconfig credential sync
033e934 feat: add kubernetes credential detail controls
```

## Stop Adding For Now

Do not continue with these until the Agent / Workflow main stack is stronger:

```text
custom Kubernetes resource editors
Kubernetes RBAC management UI
namespace / workload / pod detail pages duplicated from Kite
kubectl terminal orchestration without AIOps approval boundary
multi-cluster fleet policy engine
Kubernetes-specific remediation automation that bypasses Workflow/Approval
```

## Main Stack Return Plan

The next development focus should return to:

```text
Agent / Workflow governance
Hermes Board evidence-chain workbench
Team / Channel / Skill / MCP capability composition
Workflow runbook metadata
Execution Center approval-task-verification loop
Evolution proposal evaluation and release overlay usage evidence
role-based navigation and permissions
guided operator scenarios
```

Recommended next steps:

1. Tighten the Assets & Access center so Kubernetes is clearly one asset family.
2. Continue Agent / Workflow main stack from the productized roadmap, not from Kubernetes-specific pages.
3. Use Kubernetes incidents only as one scenario source for Diagnosis, Execution, and Evolution Governance.
4. Keep Kite as the Kubernetes UI integration point and avoid duplicating it inside AIOps.

## Residual Risks

```text
Kite lifecycle is still an external container dependency.
The Kubernetes API sync baseline supports common token and kubeconfig paths, not every enterprise auth mode.
Cluster resource operations are intentionally not first-class AIOps actions yet.
Credential rotation policy is basic and should later be folded into the central credential governance model.
```

These are acceptable for closure because the current goal is to provide Kubernetes context to AIOps, not to replace Kubernetes management platforms.
