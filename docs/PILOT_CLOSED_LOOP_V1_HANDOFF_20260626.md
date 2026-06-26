# AIOps Agent Pilot Closed Loop v1 Handoff

Date: 2026-06-26

This document closes the Pilot Closed Loop v1 hardening pass. The goal is not to add new product surface, but to make the existing operator path testable, recoverable, and understandable for a real pilot team.

## Version

```text
Version label: pilot-closed-loop-v1
Branch: feat/agent-runtime-architecture
Test host: 10.1.132.58
App URL: http://10.1.132.58:3000
API URL: http://10.1.132.58:3001
Default pilot admin: admin / Admin@123
```

## Operator Path

The pilot operating path is:

```text
Dashboard / Diagnosis Center
  -> Operation Case
  -> Hermes diagnose / remediate / review
  -> Tool approval
  -> Task tracking
  -> Verification
  -> Retrospective / evolution proposal
  -> Case timeline
```

Operators should start from Dashboard or Diagnosis Center. They should not need to know the full module map before handling an incident.

## First-Day Usage

1. Open Dashboard and review Global Ops Posture.
2. For an alert or asset issue, enter Diagnosis Center.
3. Create or open an Operation Case.
4. Launch Hermes diagnosis from the Case or Hermes Console.
5. Review Hermes evidence, risk, and suggested action.
6. If a change is required, submit or review the tool approval.
7. Track the resulting task from the Case timeline.
8. Verify recovery and run Hermes retrospective.
9. Review any evolution proposal before publishing.

## Administrator Usage

Administrators own these boundaries:

- Hermes Channels: diagnose, remediate, review.
- Hermes Workers: `hermes-diagnose`, `hermes-remediate`, `hermes-evolve`.
- Skill / MCP / Tool bindings per Channel.
- Tool approval decisions.
- Backup and restore drills.
- Pilot users and roles.

Recommended role split:

| Role | Use |
| --- | --- |
| viewer | Read dashboards, Cases, Hermes output, approvals, tasks, traces |
| operator | Diagnose, submit approvals, run allowed low-risk actions |
| admin | Configure runtime, approve/reject changes, manage users, backups, channels |

## Closed-Loop Behavior

The following closure behavior is implemented:

- Hermes Session launch can auto-create an Operation Case when context is provided.
- Hermes Session launch writes `hermes_session_launched` into Case timeline.
- Hermes output and trace refs are extracted as `approvalId`, `taskId`, and `correlationId`.
- Hermes downstream refs write `hermes_downstream_refs_detected` into Case timeline.
- Case timeline exposes direct jumps to approval, task, and evolution proposal pages.
- Hermes Assistant Case context timeline exposes the same downstream jumps.

## Test Baseline

Run before pilot handoff:

```bash
cd /opt/itops-agent-platform/app
npm run test:e2e:closed-loop -- --project=chromium
npx playwright test e2e/information-architecture.spec.ts --project=chromium
npx playwright test e2e/pilot-smoke.spec.ts --project=chromium
cd backend && npm test
```

Latest verified evidence on 2026-06-26:

```text
closed-loop-case.spec.ts: 1 passed
information-architecture.spec.ts: 3 passed
pilot-smoke.spec.ts: 7 passed
backend npm test: 8 files / 104 tests passed
```

## Backup And Restore Evidence

Before final E2E cleanup, a verified backup and dry-run restore validation were created:

```text
backup id: backup-1782451180859
backup file: itops-backup-2026-06-26T05-19-40-859Z.db.gz
backup verified: true
restore drill id: ab12756d-628f-4756-8e8a-f01926293cb6
restore drill status: passed
```

Runbook commands:

```bash
curl -X POST http://127.0.0.1:3001/api/backups/create \
  -H "authorization: Bearer <admin-token>"

curl -X POST http://127.0.0.1:3001/api/backups/restore-drills \
  -H "authorization: Bearer <admin-token>" \
  -H "content-type: application/json" \
  -d '{"backupId":"<backup-id>","drillType":"restore_validation"}'
```

## Test Data Cleanup

Use the cleanup script for E2E artifacts only:

```bash
cd /opt/itops-agent-platform/app
sudo DATABASE_PATH=/opt/itops-agent-platform/data/app.db \
  node scripts/cleanup-pilot-test-data.mjs

sudo DATABASE_PATH=/opt/itops-agent-platform/data/app.db \
  node scripts/cleanup-pilot-test-data.mjs --execute
```

The script only targets E2E prefixes such as `e2e-*` and `e2e_*`. It does not remove normal demo data, workflow templates, Hermes channels, Skills, MCP servers, users without the E2E prefix, or production Cases.

Cleanup evidence on 2026-06-26:

```text
deleted operation_case_events: 8
deleted operation_cases: 2
deleted tool_approvals: 32
deleted hermes_sessions: 1
deleted agent_executions: 1
deleted audit_logs: 49
post-cleanup dry run: no pilot E2E test data found
```

## Current Runtime Snapshot

```text
backend: healthy
frontend: healthy
hermes-diagnose: healthy
hermes-remediate: healthy
hermes-evolve: healthy
kite: running
```

## Known Boundaries

- SQLite is acceptable for this controlled pilot, but broader team rollout should plan PostgreSQL.
- E2E cleanup against the deployed DB may need `sudo` because the DB and WAL files are owned by the container user.
- Destructive tools remain blocked; high-risk actions require approval.
- Hermes is suitable for assisted operations, not unattended production remediation.

## Handoff Decision

Pilot Closed Loop v1 is ready for controlled internal team use.

Do not expand scope until:

- Latest backup is verified.
- Latest restore drill is passed.
- Closed-loop E2E passes.
- Three Hermes workers are healthy.
- Operator/admin role boundaries remain enforced.
