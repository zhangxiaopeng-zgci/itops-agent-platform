# Stage 31 Release Smoke Evidence

```text
Smoke Flow: evaluation -> staging replay -> approval -> publish
Test Host: 10.1.132.58
Executed At: 2026-06-18 16:27 Asia/Shanghai
Actor: admin
Result: PASS
```

## Purpose

Run one controlled release smoke to clear the P11e `active_release_tracking` warning through the normal governance path, rather than by manually mutating database state.

The smoke proposal targeted only the Hermes diagnosis runtime overlay:

```text
Proposal: 9897ac35-6c09-4c9c-8a99-e3cbede7e65d
Title: P11e active release smoke overlay for Hermes diagnosis
Type: skill_update
Target: skill-hermes-diagnosis
Channel: hermes-channel-diagnose
Apply Mode: proposal_only
Runtime Mode: readonly_overlay
```

## Evidence Snapshot

The proposal used real staging-host evidence, embedded in `evidence_refs`:

```text
executionEvidence: 8
workerRuns: 8
hermesSessions: 8
agentExecutions: 8
approvals: 4
```

The first two failed smoke attempts were archived before the successful run:

```text
7b07b463-7c50-4cf7-ae8f-76b1f354b9bb
651e562a-7f54-4824-b6dc-98af57974a21
```

Failure causes were useful guardrail findings:

- The first attempt was rejected by the safety evaluator because enrichment introduced approval-bypass wording.
- The second attempt was rejected because evidence refs were free-form references instead of structured replay samples.

## Evaluation

```text
Evaluation: f4999d9c-a003-4e1a-ab9d-da105ef25e23
Status: passed
Score: 100
Replay Samples: 30
Dataset Regression: 17 / 17 passed
Safety Score: 100
Evidence Score: 100
Completeness Score: 100
Replay Score: 100
```

Known non-blocking dataset coverage warning remains:

```text
Missing categories: alert_incident, verification_failure
```

This warning is advisory. It did not block Release Guard because all required regression, semantic, replay and rollback checks passed.

## Staging Replay

```text
Mode: staging_replay
Environment: staging
Apply Mode: shadow_overlay
Score: 100
Total Samples: 17
Passed Samples: 17
Failed Samples: 0
noProductionMutation: true
Shadow Action: shadow_overlay:1:propose:/skill/content
```

## Approval And Release Guard

Before approval:

```text
Release Guard Passed: false
Score: 87
Blockers: proposal_approved
```

After approval:

```text
Release Guard Passed: true
Score: 93
Blockers: none
Latest Evaluation: f4999d9c-a003-4e1a-ab9d-da105ef25e23
```

Approval record:

```text
Proposal Status: approved
Reviewed By: 1.0
Reviewed At: 2026-06-18 08:27:45 UTC
```

## Publish

```text
Release Version: 4c03471e-8cbb-4c35-8bac-62d87246890c
Version Label: v1
Status: active
Object Type: skill
Target: skill-hermes-diagnosis
Published By: 1.0
Published At: 2026-06-18 08:27:45 UTC
Proposal Status: published
```

Release event:

```text
event_type: published
comment: Controlled P11e release smoke publish for active release tracking.
```

## Audit And Readiness

Release audit export:

```text
Schema: evolution-release-audit/v1
Release Events: 1
Has Release Guard: true
Has Proposal: true
```

Ops readiness after publish:

```text
Status: ready
Score: 100
Warnings: none
Active Releases: 1
```

Hermes control plane:

```text
Active Releases: 1
Contains Release Version: 4c03471e-8cbb-4c35-8bac-62d87246890c
```

## Runtime Overlay Verification

Hermes diagnosis Agent runtime check:

```text
Agent: Hermes 诊断修复 Agent
Agent ID: 5707c88b-465b-48db-ae60-0ed828a4148c
Execution ID: 7e294b26-8fe7-4eb9-b451-df6a8e08105d
Hermes Session ID: 119b0d20-8b54-4853-8532-56f8e7cd5c0a
Runtime: hermes
Status: success
Trace Events: 21
Release Overlay Count: 1
Release Overlay Version IDs: 4c03471e-8cbb-4c35-8bac-62d87246890c
```

Conclusion: the release is not only present in the release ledger; Hermes runtime consumed the active overlay during a real diagnosis run.

## Conclusion

The controlled smoke completed the full governance loop:

```text
evaluation passed
staging replay passed
approval enforced
Release Guard passed after approval
publish created active version
audit export available
readiness warning cleared
Hermes runtime consumed release overlay
```

P11e's original acceptance decision can now be considered operationally closed for `active_release_tracking`.
