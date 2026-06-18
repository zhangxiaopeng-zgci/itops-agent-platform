# Platform Closure Review - 2026-06-18

## Conclusion

The platform is usable as an integrated AIOps Agent / Hermes operations platform. The current runtime is healthy, the core governance loop is working, and the frontend can render the main operator pages after the topology fix in this review.

The next closure step should focus on product simplification and test baseline hardening, not new features.

## Runtime Snapshot

Test host:

```text
URL: http://10.1.132.58:3000
API: http://10.1.132.58:3001
Compose: /opt/itops-agent-platform/app/docker-compose.hermes.yml
```

Containers:

```text
frontend: healthy
backend: healthy
hermes-diagnose: healthy
hermes-remediate: healthy
hermes-evolve: healthy
```

Runtime data:

```text
agents: 14
workflows: 9
tasks: 33
servers: 5
hermes_channels: 3
hermes_workers: 3
skills: 3
mcp_servers: 1
agent_teams: 3
active_releases: 1
audit_logs: 417
```

Hermes state:

```text
diagnose worker: healthy / smart-router
remediate worker: healthy / smart-router
evolve worker: healthy / smart-router
diagnose channel: healthy
remediate channel: healthy
review channel: healthy
```

Active release:

```text
Release: 4c03471e-8cbb-4c35-8bac-62d87246890c
Proposal: 9897ac35-6c09-4c9c-8a99-e3cbede7e65d
Target: skill-hermes-diagnosis
Status: active
```

Ops readiness:

```text
status: ready
score: 100
warnings: none
active releases: 1
```

## Verification Performed

### Container And Health

Passed:

```text
GET /                         -> 200
GET /health/ready             -> 200
GET hermes-diagnose /health   -> 200
GET hermes-remediate /health  -> 200
GET hermes-evolve /health     -> 200
docker compose config         -> ok
```

### Type And Build

Passed:

```text
backend: npm exec tsc --noEmit
backend: npm test
frontend: npm exec tsc --noEmit
frontend: npm run build
```

Backend Vitest baseline after closure hardening:

```text
test files: 7 passed
tests: 100 passed
```

Frontend production build warning:

```text
main JS chunk is larger than 500 kB after minification
```

This does not block operation, but it should be handled by route-level code splitting during product closure.

### API Smoke

Added reusable smoke entry:

```text
npm run smoke:api
```

Latest test-host result:

```text
API_BASE=http://127.0.0.1:3001 SMOKE_PASSWORD=<admin-password> REQUIRE_ACTIVE_RELEASE=true npm run smoke:api
passed: 33
failed: 0
semantic failures: none
active releases: 1
```

Passed representative endpoints:

```text
/api/health/summary
/api/dashboard/stats
/api/servers
/api/server-groups
/api/agents
/api/workflows
/api/tasks
/api/alerts
/api/knowledge
/api/scripts
/api/scheduled-tasks
/api/audit
/api/users
/api/settings
/api/ops-readiness/summary
/api/hermes-channels
/api/hermes-workers
/api/hermes-control-plane/overview
/api/agent-teams
/api/skills
/api/mcp-servers
/api/evolution-proposals
/api/evolution-proposals/releases/versions
/api/evolution-tasks
/api/tool-approvals
/api/ai-models
/api/remediation-policies
/api/remediation-executions
/api/network-devices
/api/ssh-keys
/api/topology/global
/api/topology/dependency
```

### Browser Smoke

Passed after topology and navigation closure:

```text
login -> /dashboard
navigation groups: Ops Workspace / Intelligence / Platform Control / Advanced
advanced group collapsed by default
/hermes
/topology
/ops-readiness
```

The browser test used a real login with Playwright and checked page rendering, navigation text, and obvious console/page errors.

## Fix Applied During Review

### Topology Page Runtime Error

Before fix:

```text
/topology rendered error boundary
Cannot read properties of undefined (reading 'length')
```

Cause:

The backend topology API returns server fields as `server_name` and `server_ip`, while `TopologyGraph` expects `name` and `ip`. The component then read `node.name.length`.

Fix:

```text
frontend/src/pages/Topology.tsx
```

Added normalization for:

```text
server_name -> name
server_ip   -> ip
dependency_type -> type/protocol fallback
missing status -> online/active fallback
```

Verification:

```text
/topology renders 服务拓扑 / 拓扑视图 / 依赖列表
frontend tsc --noEmit passed
frontend production build passed
frontend container remains healthy
```

Commit:

```text
fa469d0 fix: normalize topology API data
```

## Test Baseline Closure

Completed:

```text
backend/src/test/setup.ts
backend/vitest.config.ts
backend/src/services/alertService.test.ts
backend/src/services/agentRuntime/hermesRuntime.test.ts
backend/src/services/evolutionProposalService.ts
scripts/smoke-api.mjs
```

Changes:

```text
Vitest now sets NODE_ENV, JWT_SECRET, LOG_LEVEL and isolated DATABASE_PATH automatically.
Backend test files run single-threaded to avoid SQLite contention in the current test design.
Mac resource-fork files are excluded from Vitest discovery.
Alert tests await database initialization.
Hermes runtime test mocks tool registry and imports runtime after mock setup.
Evolution proposal service lazy-loads agentExecutor to break a real static import cycle.
API smoke is reusable and checks active release when REQUIRE_ACTIVE_RELEASE=true.
```

Remaining non-blocking signal:

```text
healthService tests intentionally exercise the not-initialized DB path and log expected errors.
Vitest reports MaxListenersExceededWarning from repeated process signal listeners in imported runtime code.
Frontend production build still warns that the main JS chunk is larger than 500 kB.
```

## Current Product Shape

Current frontend after navigation closure:

```text
routes: 42
primary expanded groups: 4
advanced group: collapsed by default
```

Major capability groups:

```text
1. Home
2. Ops Workspace
3. Intelligence
4. Platform Control
5. Advanced
```

This is functionally rich but heavy for day-to-day operators.

## Redundancy And Simplification Candidates

### 1. AI Analysis Pages

Currently overlapping:

```text
Root Cause Analysis
AI Root Cause
AI Insights
Hermes Assistant diagnosis
Topology affected path
```

Recommended product shape:

```text
Primary operator entry: Diagnose
Advanced/detail pages: RCA history, AI report detail, topology
```

Do not delete the underlying pages yet. Move secondary pages behind tabs or contextual links from a single Diagnose workspace.

### 2. Remediation Pages

Currently overlapping:

```text
Remediation Policies
Remediation Dashboard
Remediation Executions
Remediation Workbench
Tool Approvals
Hermes remediate assistant
```

Recommended product shape:

```text
Primary operator entry: Remediate
Tabs: Plan, Approval, Execution, Verification, Policy
Admin-only detail: policy editor
```

This would reduce operator navigation while keeping governance visible.

### 3. Hermes / Agent / Workflow / Evolution

Currently separate:

```text
Agents
Hermes Assistant
Hermes Channels
Evolution Proposals
Workflows
Tasks
Tool Approvals
```

Recommended product shape:

```text
Operator: Hermes Assistant
Operator: Workflows and Tasks
Admin: Hermes Control Plane
Admin: Agent / Skill / MCP configuration
Admin: Evolution and Release governance
```

The better logic is not to hide Hermes inside Agent Management. Hermes should remain a first-class console, but Agent Management should reference Channel/Skill/MCP rather than duplicate Hermes capability configuration.

### 4. Settings vs Admin Configuration

Currently:

```text
Settings
AI Models
Users
Ops Readiness
SSH credentials
Hermes Channels
MCP
Skills
```

Recommended shape:

```text
System Settings: theme, locale, general config
Model Settings: AI model pool
Access Settings: users, credentials
Runtime Settings: Hermes channel, skills, MCP, tool policy
Production Settings: readiness, backup, release audit
```

This can be implemented as navigation grouping first, without deleting screens.

## Concrete Closure Plan

### C1 - Navigation Simplification

Status: first closure pass completed.

Current primary nav:

```text
Home: Dashboard
Ops Workspace: Servers, Terminal, Hermes Assistant, Self-healing Workbench, Workflows, Tasks, Tool Approvals
Intelligence: Alerts, Root Cause, Service Topology, Knowledge Base
Platform Control: Team Console, Agent Management, Evolution Proposals, Production Readiness, Settings
Advanced: collapsed secondary/admin pages
```

Moved into Advanced:

```text
Big Screen
Network Devices
Credentials
Remote Desktop
Alert Mappings
Alert Noise
Root Cause Analysis
AI Root Cause
AI Insights
Remediation Dashboard
Remediation Executions
Scheduled Tasks
Reports
Users
```

### C2 - Concept Consolidation

Adopt one product mental model:

```text
Agent = executable role
Channel = runtime lane and policy boundary
Skill = reusable operational capability
MCP = external tool/server capability
Workflow = deterministic orchestration
Hermes = reasoning runtime and team brain
Evolution Release = versioned runtime overlay
```

Make all UI labels and docs follow this model.

### C3 - Runtime Governance Cleanup

Keep the current controlled evolution path:

```text
proposal -> evaluation -> staging replay -> approval -> publish -> runtime overlay -> audit -> rollback
```

Add one release operations page section:

```text
active overlays
affected channel / skill / agent
latest evaluation
staging replay score
rollback button
runtime consumption evidence
```

### C4 - Test Baseline Hardening

Status: backend test baseline and API smoke completed.

Reliable now:

```text
npm test                  # from backend
npm exec tsc --noEmit     # from backend
npm run build             # from frontend
npm run smoke:api         # from repo root
```

Still recommended:

```text
npm run smoke:browser
route-level frontend code splitting
```

### C5 - Production Build And Deployment Cleanup

Current test host is production-like, but the operator workflow still depends on manual deployment actions in places.

Recommended:

```text
make deploy-test
make smoke-test
make release-smoke
make rollback-release
```

Each command should write an evidence artifact under `docs/` or `artifacts/`.

## Recommended Next Step

Continue closure rather than adding new features:

```text
1. Add a committed browser smoke script for key routes.
2. Split the largest frontend route chunks.
3. Convert deployment/smoke commands into a repeatable Makefile or scripts/deploy-test.sh.
4. Tighten role-aware navigation visibility after operator/admin workflow review.
```

The platform now has a stable API/test acceptance loop and a cleaner operator navigation shape.
