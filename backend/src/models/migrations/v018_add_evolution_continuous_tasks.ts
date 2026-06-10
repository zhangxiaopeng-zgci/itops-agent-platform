import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const DEFAULT_TASKS = [
  {
    id: 'evolution-task-daily-review',
    name: 'Hermes Daily Evolution Review',
    kind: 'daily_review',
    schedule: '0 2 * * *',
    description: 'Review the last 24 hours and generate a controlled improvement proposal when evidence supports it.'
  },
  {
    id: 'evolution-task-weekly-report',
    name: 'Hermes Weekly Optimization Report',
    kind: 'weekly_report',
    schedule: '0 4 * * 0',
    description: 'Review the last 7 days and generate broader workflow, knowledge, or skill optimization proposals.'
  },
  {
    id: 'evolution-task-failure-review',
    name: 'Hermes Failure Queue Review',
    kind: 'failure_review',
    schedule: '30 * * * *',
    description: 'Queue failed worker runs, agent executions, and tasks for later evolution review.'
  },
  {
    id: 'evolution-task-rejected-approval-review',
    name: 'Hermes Rejected Approval Review',
    kind: 'rejected_approval_review',
    schedule: '45 * * * *',
    description: 'Queue rejected tool approvals for later evolution review.'
  },
  {
    id: 'evolution-task-proposal-promotion',
    name: 'Hermes High Value Proposal Promotion',
    kind: 'proposal_promotion',
    schedule: '*/30 * * * *',
    description: 'Move high-scoring evaluated proposals into approval_pending without publishing them.'
  }
];

const v018AddEvolutionContinuousTasks: Migration = {
  id: '20260610000018',
  version: 18,
  name: 'add_evolution_continuous_tasks',
  description: 'Add scheduled continuous evolution task records and review queue',

  up: async (db: any) => {
    logger.info('Creating evolution continuous task tables...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_continuous_tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL UNIQUE,
        schedule TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at DATETIME,
        last_status TEXT,
        last_result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS evolution_task_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        triggered_by TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        generated_proposal_id TEXT,
        result_summary TEXT,
        error TEXT,
        FOREIGN KEY (task_id) REFERENCES evolution_continuous_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (generated_proposal_id) REFERENCES evolution_proposals(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS evolution_review_queue (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        reason TEXT,
        priority TEXT NOT NULL DEFAULT 'P2',
        status TEXT NOT NULL DEFAULT 'queued',
        correlation_id TEXT,
        generated_proposal_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME,
        UNIQUE(source_type, source_id),
        FOREIGN KEY (generated_proposal_id) REFERENCES evolution_proposals(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_continuous_tasks_enabled ON evolution_continuous_tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_evolution_task_runs_task_time ON evolution_task_runs(task_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_evolution_review_queue_status ON evolution_review_queue(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_evolution_review_queue_correlation ON evolution_review_queue(correlation_id);
    `);

    const insertTask = db.prepare(`
      INSERT OR IGNORE INTO evolution_continuous_tasks (
        id, name, kind, schedule, description, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    DEFAULT_TASKS.forEach((task) => {
      insertTask.run(task.id, task.name, task.kind, task.schedule, task.description);
    });

    logger.info('Evolution continuous task tables created successfully');
  },

  down: async (db: any) => {
    logger.info('Removing evolution continuous task tables...');
    db.exec(`
      DROP TABLE IF EXISTS evolution_review_queue;
      DROP TABLE IF EXISTS evolution_task_runs;
      DROP TABLE IF EXISTS evolution_continuous_tasks;
    `);
    logger.info('Evolution continuous task tables removed');
  }
};

export default v018AddEvolutionContinuousTasks;
