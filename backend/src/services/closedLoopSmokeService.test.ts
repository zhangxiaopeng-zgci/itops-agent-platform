import { beforeAll, describe, expect, it } from 'vitest';
import db, { initializeDatabase } from '../models/database';
import { listClosedLoopSmokeDrills, runClosedLoopSmoke } from './closedLoopSmokeService';

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
});
