#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = loadBetterSqlite3();

const execute = process.argv.includes('--execute');
const cwd = process.cwd();

function resolveDatabasePath() {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

  const candidates = [
    '/app/data/app.db',
    path.basename(cwd) === 'backend' ? path.join(cwd, 'data/app.db') : null,
    path.join(cwd, 'data/app.db'),
    path.join(cwd, '../data/app.db'),
    path.join(cwd, 'backend/data/app.db')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

const dbPath = path.resolve(resolveDatabasePath());

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  console.error('Set DATABASE_PATH or run from a directory containing data/app.db or backend/data/app.db.');
  process.exit(1);
}

guardProductionHostWrites(dbPath);

const db = new Database(dbPath, execute ? {} : { readonly: true });
if (execute) {
  db.pragma('foreign_keys = ON');
}

const cleanupTargets = [
  {
    table: 'operation_case_events',
    condition: `
      case_id IN (
        SELECT id FROM operation_cases
        WHERE correlation_id LIKE 'e2e-%'
           OR asset_id LIKE 'e2e-%'
           OR asset_name LIKE 'e2e-%'
           OR alert_id LIKE 'e2e-%'
           OR source LIKE 'e2e-%'
           OR context LIKE '%e2e-%'
           OR summary LIKE '%e2e-%'
      )
      OR correlation_id LIKE 'e2e-%'
      OR source_id LIKE 'e2e-%'
      OR payload LIKE '%e2e-%'
    `
  },
  {
    table: 'operation_cases',
    condition: `
      correlation_id LIKE 'e2e-%'
      OR asset_id LIKE 'e2e-%'
      OR asset_name LIKE 'e2e-%'
      OR alert_id LIKE 'e2e-%'
      OR source LIKE 'e2e-%'
      OR context LIKE '%e2e-%'
      OR summary LIKE '%e2e-%'
    `
  },
  {
    table: 'tool_approvals',
    condition: `
      correlation_id LIKE 'e2e-%'
      OR input LIKE '%e2e-%'
      OR execution_result LIKE '%e2e-%'
    `
  },
  {
    table: 'tasks',
    condition: `
      id LIKE 'e2e-%'
      OR id LIKE 'task-e2e-%'
      OR name LIKE 'E2E%'
      OR name LIKE 'e2e-%'
      OR context LIKE '%e2e-%'
      OR node_results LIKE '%e2e-%'
      OR logs LIKE '%e2e-%'
    `
  },
  {
    table: 'hermes_sessions',
    condition: `
      correlation_id LIKE 'e2e-%'
      OR input LIKE '%e2e-%'
      OR output LIKE '%e2e-%'
      OR selected_context LIKE '%e2e-%'
      OR extracted_refs LIKE '%e2e-%'
    `
  },
  {
    table: 'agent_executions',
    condition: `
      input_text LIKE '%e2e-%'
      OR output_text LIKE '%e2e-%'
      OR metadata LIKE '%e2e-%'
    `
  },
  {
    table: 'evolution_proposal_events',
    condition: `
      proposal_id IN (
        SELECT id FROM evolution_proposals
        WHERE correlation_id LIKE 'e2e-%'
           OR title LIKE 'E2E%'
           OR proposal_body LIKE '%e2e-%'
      )
      OR metadata LIKE '%e2e-%'
    `
  },
  {
    table: 'evolution_proposals',
    condition: `
      correlation_id LIKE 'e2e-%'
      OR title LIKE 'E2E%'
      OR proposal_body LIKE '%e2e-%'
    `
  },
  {
    table: 'remediation_audits',
    condition: `
      approved_by IN (
        SELECT username FROM users
        WHERE username LIKE 'e2e_%'
           OR email LIKE 'e2e_%@example.test'
      )
    `
  },
  {
    table: 'audit_logs',
    condition: `
      resource_id LIKE 'e2e-%'
      OR details LIKE '%e2e-%'
    `
  },
  {
    table: 'users',
    condition: `
      username LIKE 'e2e_%'
      OR email LIKE 'e2e_%@example.test'
    `
  }
];

function loadBetterSqlite3() {
  const candidates = [
    '../backend/node_modules/better-sqlite3',
    '../node_modules/better-sqlite3',
    'better-sqlite3'
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next runtime layout.
    }
  }

  throw new Error('Unable to load better-sqlite3 from known runtime locations.');
}

function guardProductionHostWrites(databasePath) {
  const inContainer =
    fs.existsSync('/.dockerenv') ||
    databasePath.startsWith('/app/data/') ||
    process.env.RUNNING_IN_CONTAINER === 'true';
  const isProductionInstall =
    cwd.startsWith('/opt/itops-agent-platform/app') ||
    databasePath.startsWith('/opt/itops-agent-platform/data/');

  if (!isProductionInstall || inContainer) {
    return;
  }

  const message = [
    'Production SQLite cleanup must run inside the backend container.',
    `Refusing to ${execute ? 'write' : 'open'} production database from the host: ${databasePath}`,
    'Use: docker exec backend node /app/scripts/cleanup-pilot-test-data.mjs --execute'
  ];

  if (execute && process.env.ALLOW_HOST_SQLITE_WRITE !== 'true') {
    console.error(message.join('\n'));
    console.error('Set ALLOW_HOST_SQLITE_WRITE=true only for an intentional emergency recovery.');
    process.exit(1);
  }

  console.warn(message.join('\n'));
}

function tableExists(table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return Boolean(row);
}

function countRows(target) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${target.table} WHERE ${target.condition}`).get().count;
}

const summary = cleanupTargets
  .filter((target) => tableExists(target.table))
  .map((target) => ({ ...target, count: countRows(target) }))
  .filter((target) => target.count > 0);

if (summary.length === 0) {
  console.log(`No pilot E2E test data found in ${dbPath}.`);
  db.close();
  process.exit(0);
}

console.log(`${execute ? 'Deleting' : 'Dry run for'} pilot E2E test data in ${dbPath}:`);
for (const item of summary) {
  console.log(`- ${item.table}: ${item.count}`);
}

if (!execute) {
  console.log('\nNo rows were deleted. Re-run with --execute to clean these rows.');
  db.close();
  process.exit(0);
}

const deleteRows = db.transaction(() => {
  for (const item of summary) {
    db.prepare(`DELETE FROM ${item.table} WHERE ${item.condition}`).run();
  }
});

deleteRows();
console.log('Pilot E2E test data cleanup complete.');
db.close();
