# AIOps Agent Pilot Readiness Closure

Date: 2026-06-22

This document closes the first real-team pilot readiness pass after P17. The goal is to keep the platform usable for a controlled pilot while preventing the current Hermes runtime from being mistaken for unattended production auto-remediation.

## Current Go/No-Go

Pilot status: go for controlled internal pilot.

Production auto-remediation status: no-go for unattended high-risk remediation.

Allowed pilot scope:

- Read-only diagnosis through Hermes Assistant and Hermes Dashboard.
- Hermes Channel inspection for skills, tools, MCP bindings, worker health, and quality summary.
- Workflow preflight review before execution.
- Tool approval creation through operator/admin roles; approval, rejection, and approval-triggered execution through admin.
- Task detail, correlation trace, approval evidence, and retrospective review.
- Low-risk or read-only command execution through the Tool API allowlist.

Blocked pilot scope:

- Unattended production remediation.
- Destructive commands.
- Policy bypass prompts.
- High-risk production changes without approval, rollback plan, and verification evidence.
- Automatic publication of Skill, MCP, Workflow, or Policy releases without release guard evidence.

## Closure Actions Completed

Remote host: `10.1.132.58`

- Created a manual verified backup before cleanup:
  - `itops-backup-2026-06-22T08-35-17-229Z.db.gz`
  - checksum: `2e2d17b64531ef3def5bad73384e740d282181740f5d61debca3d7e9daca676b`
- Recorded a restore drill:
  - drill type: `pilot_cleanup_restore_validation`
  - status: `passed`
  - verification: `integrity_ok`
- Removed test artifacts:
  - workflow: `P15 Preflight Smoke`
  - task: `P15 Preflight Smoke Task`
- Cleaned unused Docker build cache and images:
  - root filesystem changed from roughly `83%` used to roughly `36%` used after the first cleanup, and is `46%` used after later production rebuilds and final builder-cache cleanup.
- Clarified MCP preflight semantics:
  - stdio MCP health status `configured` is treated as acceptable.
  - `configured` means the registry configuration is valid; the baseline registry does not start the process itself.

## Pilot Role Model

| Role | Intended user | Allowed | Requires approval | Blocked |
| --- | --- | --- | --- | --- |
| viewer | observer, auditor, on-call trainee | Read dashboards, channels, tasks, approvals, trace, read-only diagnosis | None | Submit repair approvals, run workflows, low/medium/high-risk tools |
| operator | on-call engineer | Read-only tools, low-risk tools, submit repair/workflow approvals | Medium-risk and high-risk tools | Destructive tools, policy bypass, direct high-risk execution |
| admin | platform owner | Runtime configuration, users, channels, backup, restore drill, approvals | Medium-risk and high-risk tools still go through approval unless explicitly approved by workflow | Destructive tools through Tool API |

Pilot operating rule:

- Viewer can inspect and diagnose.
- Operator can propose and submit.
- Admin can configure, approve, and reject.
- No role can execute destructive tools through the Tool API.

Code-level gates:

- `/api/tasks` mutation routes are limited to `admin` and `operator`.
- `/api/tool-approvals/:id/approve` and `/api/tool-approvals/:id/reject` are limited to `admin`.
- Hermes Channel, Control Plane, Dashboard, Skill, MCP, Task, Approval, and Trace read paths remain available to `viewer`, `operator`, and `admin` where the route is operationally read-only.

Frontend gates:

- Tool Approvals and Hermes Assistant show approval/rejection controls only to `admin`.
- Non-admin users can still inspect pending approval evidence, but see a read-only approval notice instead of action buttons.

## Tool Boundary

Allowed directly:

- `list_servers`
- `query_alerts`
- `search_knowledge_base`
- `list_workflows`
- `get_task_status`
- `verify_remediation`
- `list_agent_executions`
- `list_tool_approvals`
- `get_correlation_trace`
- `run_readonly_command` when the command is in the strict read-only allowlist.

Requires approval:

- `submit_remediation_for_approval`
- `run_workflow`
- Any prompt or input classified as high-risk, including service restart, cluster mutation, network mutation, or remote script execution intent.

Denied:

- Destructive prompts such as `rm -rf /`, `mkfs`, `fdisk`, mass Kubernetes delete, database drop/truncate.
- Policy bypass attempts such as skipping approval, disabling guardrails, or ignoring audit.
- Sensitive file reads such as `/etc/shadow`, root SSH keys, private keys, `.pem`, `.key`.
- Read-only command strings with shell control characters.

## MCP Health Semantics

The platform uses the following preflight interpretation:

- `healthy`: remote/http MCP endpoint is reachable.
- `configured`: stdio MCP configuration is valid, but the registry baseline does not spawn the process.
- `unknown`: not yet checked; does not block pilot execution by itself.
- `failed` or other explicit failure states: treated as unhealthy.

For pilot workflows, `configured` and `unknown` do not create `mcp_server_unhealthy`. Operators should still review the Channel bundle before using MCP-dependent runbooks.

## Test Baseline

Required before handing the pilot to a team:

- Backend unit test:
  - `cd backend && npm test`
- API smoke:
  - `SMOKE_PASSWORD=Admin@123 npm run smoke:api`
- Browser E2E smoke:
  - `E2E_BASE_URL=http://10.1.132.58:3000 E2E_API_BASE=http://10.1.132.58:3001 E2E_PASSWORD=Admin@123 npm run test:e2e`

The browser E2E covers:

- Login.
- Primary navigation routes.
- Hermes Channels.
- Hermes Dashboard lanes.
- Workflow preflight.
- Tool approval deep link.
- Task detail deep link.
- Pilot RBAC boundaries for temporary viewer/operator users.

## Scale-Up Plan

Before expanding beyond a small internal pilot:

- Move from SQLite to PostgreSQL.
- Add automated off-host backup replication.
- Add restore drill automation that restores into an isolated database and runs integrity checks.
- Add container/image retention policy to prevent Docker cache growth.
- Add monitoring and alerting for disk, memory, backend health, Hermes worker health, backup freshness, and failed approvals/tasks.
- Add HA design for backend/frontend/Hermes workers.
- Split secrets into a proper secret manager.
- Define per-environment policy packs for dev, staging, and production.

## Pilot Exit Criteria

The pilot can be considered ready for broader team use when:

- E2E smoke passes consistently.
- API smoke passes consistently.
- Latest backup is verified.
- Latest restore drill is passed.
- Disk utilization stays below 70%.
- All three Hermes workers are healthy.
- All active Hermes workflows have explainable preflight states.
- Operators can complete diagnosis, approval, execution tracking, and retrospective review without leaving the platform.
