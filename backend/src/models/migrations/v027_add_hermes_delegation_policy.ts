import { Migration } from './migrationFramework';
import { logger } from '../../utils/logger';

const CHANNEL_DELEGATION_DEFAULTS = [
  {
    id: 'hermes-channel-diagnose',
    maxConcurrentChildren: 3,
    maxSpawnDepth: 1,
    allowedWorkerLanes: ['evidence', 'logs', 'topology', 'knowledge'],
    circuitBreakerThreshold: 3
  },
  {
    id: 'hermes-channel-remediate',
    maxConcurrentChildren: 2,
    maxSpawnDepth: 1,
    allowedWorkerLanes: ['plan', 'approval', 'verification'],
    circuitBreakerThreshold: 2
  },
  {
    id: 'hermes-channel-review',
    maxConcurrentChildren: 3,
    maxSpawnDepth: 2,
    allowedWorkerLanes: ['review', 'proposal', 'release'],
    circuitBreakerThreshold: 3
  }
];

const v027AddHermesDelegationPolicy: Migration = {
  id: '20260618000027',
  version: 27,
  name: 'add_hermes_delegation_policy',
  description: 'Add channel-scoped Hermes delegation and Kanban policy baseline',

  up: async (db: any) => {
    logger.info('Adding Hermes channel delegation policy fields...');

    addColumnIfMissing(db, 'hermes_channels', 'delegate_allowed', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing(db, 'hermes_channels', 'max_concurrent_children', 'INTEGER NOT NULL DEFAULT 3');
    addColumnIfMissing(db, 'hermes_channels', 'max_spawn_depth', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing(db, 'hermes_channels', 'allowed_worker_lanes', 'TEXT');
    addColumnIfMissing(db, 'hermes_channels', 'allowed_external_cli_workers', 'TEXT');
    addColumnIfMissing(db, 'hermes_channels', 'kanban_required_for_long_running', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing(db, 'hermes_channels', 'circuit_breaker_threshold', 'INTEGER NOT NULL DEFAULT 3');

    const updateChannel = db.prepare(`
      UPDATE hermes_channels
      SET delegate_allowed = 1,
          max_concurrent_children = ?,
          max_spawn_depth = ?,
          allowed_worker_lanes = ?,
          allowed_external_cli_workers = COALESCE(allowed_external_cli_workers, '[]'),
          kanban_required_for_long_running = 1,
          circuit_breaker_threshold = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    CHANNEL_DELEGATION_DEFAULTS.forEach((channel) => {
      updateChannel.run(
        channel.maxConcurrentChildren,
        channel.maxSpawnDepth,
        JSON.stringify(channel.allowedWorkerLanes),
        channel.circuitBreakerThreshold,
        channel.id
      );
    });

    logger.info('Hermes channel delegation policy fields added successfully');
  },

  down: async () => {
    logger.info('Skipping Hermes delegation column rollback; SQLite column drop is intentionally not destructive');
  }
};

function addColumnIfMissing(db: any, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export default v027AddHermesDelegationPolicy;
