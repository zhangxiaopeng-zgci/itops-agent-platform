#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('../backend/node_modules/better-sqlite3');

const execute = process.argv.includes('--execute');
const cwd = process.cwd();
const defaultDbPath = path.basename(cwd) === 'backend'
  ? path.join(cwd, 'data/app.db')
  : path.join(cwd, 'backend/data/app.db');
const dbPath = path.resolve(process.env.DATABASE_PATH || defaultDbPath);

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

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
