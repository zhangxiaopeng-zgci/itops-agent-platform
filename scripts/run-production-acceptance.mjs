#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const apiBase = (process.env.API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const appBase = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const kiteBase = (process.env.E2E_KITE_BASE || 'http://127.0.0.1:3002').replace(/\/$/, '');
const username = process.env.ACCEPTANCE_USERNAME || process.env.SMOKE_USERNAME || 'admin';
const password = process.env.ACCEPTANCE_PASSWORD || process.env.SMOKE_PASSWORD || process.env.E2E_PASSWORD;
const runE2e = process.env.ACCEPTANCE_RUN_E2E !== 'false';
const reportsDir = path.resolve(process.env.ACCEPTANCE_REPORT_DIR || 'reports');

if (!password) {
  throw new Error('ACCEPTANCE_PASSWORD, SMOKE_PASSWORD, or E2E_PASSWORD is required');
}

const report = {
  startedAt: new Date().toISOString(),
  apiBase,
  appBase,
  kiteBase,
  runE2e,
  steps: [],
  evidence: {}
};

function tail(text, length = 8000) {
  if (!text) return '';
  return text.length > length ? text.slice(text.length - length) : text;
}

function runCommand(name, command, args, env = {}) {
  console.log(`\n[acceptance] ${name}`);
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const step = {
    name,
    type: 'command',
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: typeof result.status === 'number' ? result.status : 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr)
  };
  report.steps.push(step);
  return step;
}

async function runCheck(name, fn) {
  console.log(`\n[acceptance] ${name}`);
  const startedAt = new Date().toISOString();
  try {
    const evidence = await fn();
    const step = {
      name,
      type: 'api',
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      evidence
    };
    report.steps.push(step);
    return step;
  } catch (error) {
    const step = {
      name,
      type: 'api',
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
    report.steps.push(step);
    console.error(step.error);
    return step;
  }
}

async function request(pathname, token, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok || body?.success === false) {
    throw new Error(`HTTP ${response.status} ${pathname}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function postJson(pathname, token, payload = {}) {
  return request(pathname, token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function login() {
  const body = await request('/api/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  const token = body?.data?.token || body?.token;
  if (!token) {
    throw new Error(`login did not return a token: ${JSON.stringify(body)}`);
  }
  return token;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  report.failed = report.steps.filter((step) => !step.ok).length;
  report.passed = report.steps.length - report.failed;
  report.status = report.failed === 0 ? 'passed' : 'failed';

  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamp = report.finishedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `production-acceptance-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n[acceptance] report: ${reportPath}`);
  console.log(`[acceptance] status: ${report.status}, passed=${report.passed}, failed=${report.failed}`);
}

const smokeStep = runCommand('api-smoke-and-closed-loop', process.execPath, ['scripts/smoke-api.mjs'], {
  API_BASE: apiBase,
  SMOKE_USERNAME: username,
  SMOKE_PASSWORD: password,
  CLOSED_LOOP_SMOKE: 'true',
  REQUIRE_ACTIVE_RELEASE: process.env.REQUIRE_ACTIVE_RELEASE || 'true'
});

if (smokeStep.ok && smokeStep.stdoutTail) {
  const jsonStart = smokeStep.stdoutTail.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsedSmoke = JSON.parse(smokeStep.stdoutTail.slice(jsonStart));
      report.evidence.smoke = {
        passed: parsedSmoke.passed,
        failed: parsedSmoke.failed,
        semanticFailures: parsedSmoke.semanticFailures
      };
    } catch {
      report.evidence.smoke = { parsed: false };
    }
  }
}

if (runE2e) {
  runCommand('playwright-e2e-with-cleanup', process.execPath, ['scripts/run-e2e-with-cleanup.mjs'], {
    E2E_BASE_URL: appBase,
    E2E_API_BASE: apiBase,
    E2E_KITE_BASE: kiteBase,
    E2E_PASSWORD: password,
    E2E_CLEANUP_SUDO: process.env.E2E_CLEANUP_SUDO || 'false',
    DATABASE_PATH: process.env.DATABASE_PATH || ''
  });
}

const tokenStep = await runCheck('login', async () => {
  const token = await login();
  report.evidence.tokenPresent = Boolean(token);
  return { tokenPresent: true };
});

let token = null;
if (tokenStep.ok) {
  token = await login();
}

if (token) {
  await runCheck('database-backup-and-restore-drill', async () => {
    const backup = await postJson('/api/backups/create', token, {
      type: 'manual',
      description: 'Production acceptance gate'
    });
    const backupId = backup?.data?.id;
    assert(backupId, 'backup id is missing');
    assert(backup?.data?.verified === true, 'backup is not verified');

    const drill = await postJson('/api/backups/restore-drills', token, {
      backupId,
      drillType: 'production_acceptance_gate',
      notes: 'Automated production acceptance gate'
    });
    assert(drill?.data?.status === 'passed', 'restore drill did not pass');
    assert(drill?.data?.verification_status === 'integrity_ok', 'restore drill integrity is not ok');

    report.evidence.databaseBackup = {
      backupId,
      filename: backup.data.filename,
      drillId: drill.data.id
    };
    return report.evidence.databaseBackup;
  });

  await runCheck('kite-backup-and-restore-drill', async () => {
    const backup = await postJson('/api/ops-readiness/kite-backups', token);
    const backupId = backup?.data?.id;
    assert(backupId, 'Kite backup id is missing');
    assert(backup?.data?.verified === true, 'Kite backup is not verified');

    const drill = await postJson('/api/ops-readiness/kite-restore-drills', token, {
      backupId,
      notes: 'Automated production acceptance gate'
    });
    assert(drill?.data?.status === 'passed', 'Kite restore drill did not pass');
    assert(drill?.data?.verification_status === 'integrity_ok', 'Kite restore drill integrity is not ok');

    report.evidence.kiteBackup = {
      backupId,
      filename: backup.data.filename,
      drillId: drill.data.id
    };
    return report.evidence.kiteBackup;
  });

  await runCheck('hermes-workers-ready', async () => {
    const workers = await request('/api/hermes-workers', token);
    const data = Array.isArray(workers?.data) ? workers.data : [];
    assert(data.length === 3, `expected 3 Hermes workers, got ${data.length}`);
    assert(data.every((worker) => worker.configured && worker.healthy), 'not all Hermes workers are configured and healthy');

    report.evidence.hermesWorkers = data.map((worker) => ({
      role: worker.role,
      channelType: worker.channelType,
      status: worker.status,
      model: worker.model
    }));
    return report.evidence.hermesWorkers;
  });

  await runCheck('ops-readiness-ready', async () => {
    const summary = await request('/api/ops-readiness/summary', token);
    const data = summary?.data || {};
    assert(data.status === 'ready', `readiness status is ${data.status}`);
    assert(Number(data.score) >= 100, `readiness score is ${data.score}`);
    assert(!Array.isArray(data.blockers) || data.blockers.length === 0, 'readiness has blockers');
    assert(!Array.isArray(data.warnings) || data.warnings.length === 0, 'readiness has warnings');

    const requiredKeys = [
      'backup_verified',
      'restore_drill_recorded',
      'hermes_workers_healthy',
      'closed_loop_smoke_recorded',
      'kite_backup_available',
      'kite_restore_drill_recorded'
    ];
    const checks = Array.isArray(data.checks) ? data.checks : [];
    for (const key of requiredKeys) {
      const check = checks.find((item) => item.key === key);
      assert(check?.status === 'ready', `${key} is not ready`);
    }

    report.evidence.readiness = {
      status: data.status,
      score: data.score,
      blockers: data.blockers || [],
      warnings: data.warnings || []
    };
    return report.evidence.readiness;
  });
}

function buildCleanupCommand({ execute = false } = {}) {
  if (process.env.E2E_CLEANUP_DOCKER_SERVICE) {
    return {
      command: 'docker',
      args: [
        'exec',
        process.env.E2E_CLEANUP_DOCKER_SERVICE,
        'node',
        '/app/scripts/cleanup-pilot-test-data.mjs',
        ...(execute ? ['--execute'] : [])
      ]
    };
  }

  const args = [
    process.execPath,
    'scripts/cleanup-pilot-test-data.mjs',
    ...(execute ? ['--execute'] : [])
  ];

  if (process.env.E2E_CLEANUP_SUDO === 'true') {
    return {
      command: 'sudo',
      args: [
        'env',
        `PATH=${process.env.PATH || ''}`,
        ...(process.env.DATABASE_PATH ? [`DATABASE_PATH=${process.env.DATABASE_PATH}`] : []),
        ...args
      ]
    };
  }

  return {
    command: args[0],
    args: args.slice(1)
  };
}

const finalCleanupCommand = buildCleanupCommand({ execute: true });
runCommand('final-e2e-cleanup', finalCleanupCommand.command, finalCleanupCommand.args);

const cleanupCommand = buildCleanupCommand();
const cleanupStep = runCommand('e2e-cleanup-dry-run', cleanupCommand.command, cleanupCommand.args);
if (cleanupStep.ok && !cleanupStep.stdoutTail.includes('No pilot E2E test data found')) {
  cleanupStep.ok = false;
  cleanupStep.error = 'E2E cleanup dry-run still found test data';
}

writeReport();
if (report.failed > 0) {
  process.exit(1);
}
