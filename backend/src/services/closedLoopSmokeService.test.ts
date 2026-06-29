import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../models/database';
import { listClosedLoopSmokeDrills, pruneClosedLoopSmokeDrills, runClosedLoopSmoke } from './closedLoopSmokeService';

describe('closedLoopSmokeService', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initializeDatabase();
  });

  it('runs a closed-loop smoke without leaving test residue', async () => {
    db.prepare('DELETE FROM closed_loop_smoke_drills').run();

    const result = await runClosedLoopSmoke({ createdBy: 'test-admin' });

    expect(result.success).toBe(true);
    expect(result.finalCaseStatus).toBe('reviewing');
    expect(result.verificationPassed).toBe(true);
    expect(result.cleanedUp).toBe(true);
    expect(result.eventTypes).toEqual(expect.arrayContaining([
      'case_created',
      'remediation_verification_passed'
    ]));
    expect(result.traceCounts.operationCases).toBe(1);
    expect(result.traceCounts.tasks).toBe(1);

    const caseCount = (db.prepare('SELECT COUNT(*) as count FROM operation_cases WHERE correlation_id = ?')
      .get(result.correlationId) as { count: number }).count;
    const eventCount = (db.prepare('SELECT COUNT(*) as count FROM operation_case_events WHERE correlation_id = ?')
      .get(result.correlationId) as { count: number }).count;
    const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE id = ?')
      .get(result.taskId) as { count: number }).count;

    expect(caseCount).toBe(0);
    expect(eventCount).toBe(0);
    expect(taskCount).toBe(0);

    const drills = listClosedLoopSmokeDrills(5);
    expect(drills).toHaveLength(1);
    expect(drills[0].status).toBe('passed');
    expect(drills[0].correlation_id).toBe(result.correlationId);
    expect(drills[0].verification_passed).toBe(true);
    expect(drills[0].cleaned_up).toBe(true);

    db.prepare('DELETE FROM closed_loop_smoke_drills WHERE id = ?').run(drills[0].id);
  });

  it('prunes old closed-loop smoke drill evidence', () => {
    db.prepare('DELETE FROM closed_loop_smoke_drills').run();

    insertSmokeDrill('old-drill', 'closed-loop-smoke-old', '2026-01-01 00:00:01');
    insertSmokeDrill('middle-drill', 'closed-loop-smoke-middle', '2026-01-01 00:00:02');
    insertSmokeDrill('new-drill', 'closed-loop-smoke-new', '2026-01-01 00:00:03');

    const pruned = pruneClosedLoopSmokeDrills(2);
    const drills = listClosedLoopSmokeDrills(10);

    expect(pruned).toBe(1);
    expect(drills.map((drill) => drill.id)).toEqual(['new-drill', 'middle-drill']);

    db.prepare('DELETE FROM closed_loop_smoke_drills').run();
  });
});

function insertSmokeDrill(id: string, correlationId: string, createdAt: string) {
  const evidence = {
    success: true,
    correlationId,
    caseId: `case-${id}`,
    taskId: `task-${id}`,
    finalCaseStatus: 'reviewing',
    verificationPassed: true,
    eventTypes: ['case_created', 'remediation_verification_passed'],
    traceCounts: { operationCases: 1, tasks: 1, approvals: 0 },
    cleanedUp: true
  };

  db.prepare(`
    INSERT INTO closed_loop_smoke_drills (
      id, status, verification_status, correlation_id, case_id, task_id, final_case_status,
      verification_passed, cleaned_up, trace_counts, event_types, evidence, error, created_by,
      created_at, completed_at
    )
    VALUES (?, 'passed', 'closed_loop_ready', ?, ?, ?, 'reviewing', 1, 1, ?, ?, ?, NULL, 'test-admin', ?, ?)
  `).run(
    id,
    correlationId,
    evidence.caseId,
    evidence.taskId,
    JSON.stringify(evidence.traceCounts),
    JSON.stringify(evidence.eventTypes),
    JSON.stringify(evidence),
    createdAt,
    createdAt
  );
}
