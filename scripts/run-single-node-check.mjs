#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const composeFile = process.env.SINGLE_NODE_COMPOSE_FILE || 'docker-compose.hermes.yml';
const deployRoot = path.resolve(process.env.ITOPS_DEPLOY_ROOT || path.join(process.cwd(), '..'));
const backupDir = process.env.ITOPS_BACKUP_DIR || path.join(deployRoot, 'backups');
const reportsDir = path.resolve(process.env.SINGLE_NODE_REPORT_DIR || 'reports');
const apiBase = (process.env.API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const username = process.env.SINGLE_NODE_USERNAME || process.env.ACCEPTANCE_USERNAME || process.env.SMOKE_USERNAME || 'admin';
const password = process.env.SINGLE_NODE_PASSWORD || process.env.ACCEPTANCE_PASSWORD || process.env.SMOKE_PASSWORD || process.env.E2E_PASSWORD || '';
const useSudo = process.env.SINGLE_NODE_CHECK_SUDO === 'true';
const diskWarningPercent = parsePositiveInteger(process.env.SINGLE_NODE_DISK_WARNING_PERCENT, 85);
const diskBlockedPercent = parsePositiveInteger(process.env.SINGLE_NODE_DISK_BLOCKED_PERCENT, 92);
const backupWarningHours = parsePositiveInteger(process.env.SINGLE_NODE_BACKUP_WARNING_HOURS, 36);
const backupBlockedHours = parsePositiveInteger(process.env.SINGLE_NODE_BACKUP_BLOCKED_HOURS, 72);

const expectedServices = [
  'backend',
  'frontend',
  'kite',
  'hermes-diagnose',
  'hermes-remediate',
  'hermes-evolve'
];

const report = {
  startedAt: new Date().toISOString(),
  deployRoot,
  composeFile,
  apiBase,
  checks: []
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function runMaybeSudo(command, args) {
  if (useSudo) {
    return run('sudo', [command, ...args]);
  }
  return run(command, args);
}

function addCheck(key, category, status, message, observed = {}) {
  report.checks.push({ key, category, status, message, observed });
  const label = status === 'ready' ? 'OK' : status.toUpperCase();
  console.log(`[${label}] ${key}: ${message}`);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseComposeJsonLines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function checkComposeServices() {
  const result = run('docker', ['compose', '-f', composeFile, 'ps', '--format', 'json']);
  if (result.status !== 0) {
    addCheck('compose_services', 'deployment', 'blocked', 'Unable to read Docker Compose service status.', {
      stderr: result.stderr.trim()
    });
    return;
  }

  let services = [];
  try {
    services = parseComposeJsonLines(result.stdout);
  } catch (error) {
    addCheck('compose_services', 'deployment', 'blocked', 'Unable to parse Docker Compose service status.', {
      error: error instanceof Error ? error.message : String(error),
      stdout: result.stdout.slice(0, 2000)
    });
    return;
  }

  const byService = new Map(services.map((service) => [service.Service || service.Name, service]));
  const observed = {};
  let blocked = false;
  let warning = false;

  for (const name of expectedServices) {
    const service = byService.get(name);
    if (!service) {
      observed[name] = { present: false };
      blocked = true;
      continue;
    }

    observed[name] = {
      state: service.State,
      health: service.Health || null,
      status: service.Status
    };

    if (service.State !== 'running') {
      blocked = true;
    } else if (name !== 'kite' && service.Health && service.Health !== 'healthy') {
      blocked = true;
    } else if (name !== 'kite' && !service.Health) {
      warning = true;
    }
  }

  addCheck(
    'compose_services',
    'deployment',
    blocked ? 'blocked' : warning ? 'warning' : 'ready',
    blocked
      ? 'One or more required single-node containers are missing or unhealthy.'
      : warning
        ? 'All required containers are running, but at least one service has no health status.'
        : 'All required single-node containers are running and healthy.',
    observed
  );
}

function checkDiskUsage() {
  const result = run('df', ['-Pk', deployRoot]);
  if (result.status !== 0) {
    addCheck('disk_capacity', 'data', 'blocked', 'Unable to read filesystem usage.', {
      stderr: result.stderr.trim()
    });
    return;
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const row = lines[lines.length - 1]?.trim().split(/\s+/);
  const usagePercent = Number.parseInt((row?.[4] || '').replace('%', ''), 10);
  const availableKb = Number.parseInt(row?.[3] || '0', 10);
  const mountedOn = row?.[5] || deployRoot;

  let status = 'ready';
  if (!Number.isFinite(usagePercent)) status = 'blocked';
  else if (usagePercent >= diskBlockedPercent) status = 'blocked';
  else if (usagePercent >= diskWarningPercent) status = 'warning';

  addCheck(
    'disk_capacity',
    'data',
    status,
    Number.isFinite(usagePercent)
      ? `Disk usage is ${usagePercent}% on ${mountedOn}.`
      : 'Unable to parse disk usage percent.',
    { usagePercent, availableGb: Math.round((availableKb / 1024 / 1024) * 100) / 100, mountedOn }
  );
}

function checkDatabaseIntegrity() {
  const script = `
    const Database = require('better-sqlite3');
    const db = new Database('/app/data/app.db', { readonly: true, fileMustExist: true });
    const result = db.prepare('PRAGMA integrity_check').all();
    console.log(JSON.stringify(result));
    db.close();
  `;
  const result = run('docker', ['exec', 'backend', 'node', '-e', script]);
  if (result.status !== 0) {
    addCheck('database_integrity', 'data', 'blocked', 'Unable to run SQLite integrity check.', {
      stderr: result.stderr.trim()
    });
    return;
  }

  let integrity = [];
  try {
    integrity = JSON.parse(result.stdout.trim());
  } catch (error) {
    addCheck('database_integrity', 'data', 'blocked', 'Unable to parse SQLite integrity check output.', {
      error: error instanceof Error ? error.message : String(error),
      stdout: result.stdout.slice(0, 2000)
    });
    return;
  }

  const ok = integrity.length === 1 && integrity[0]?.integrity_check === 'ok';
  addCheck(
    'database_integrity',
    'data',
    ok ? 'ready' : 'blocked',
    ok ? 'SQLite integrity_check returned ok.' : 'SQLite integrity_check reported corruption.',
    { integrity }
  );
}

function listBackupFiles(kind) {
  const args = [
    backupDir,
    '-maxdepth',
    '2',
    '-type',
    'f',
    '-name',
    '*.db.gz',
    '-printf',
    '%T@ %s %p\n'
  ];
  const result = runMaybeSudo('find', args);
  if (result.status !== 0) {
    return { error: result.stderr.trim(), files: [] };
  }

  const files = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(\d+)\s+(.+)$/);
      if (!match) return null;
      return {
        mtimeMs: Number(match[1]) * 1000,
        size: Number(match[2]),
        filePath: match[3]
      };
    })
    .filter(Boolean)
    .filter((file) => kind === 'kite' ? file.filePath.includes('/kite/') : !file.filePath.includes('/kite/'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return { files };
}

function checkBackupFreshness(kind) {
  const { files, error } = listBackupFiles(kind);
  const key = kind === 'kite' ? 'kite_backup_freshness' : 'database_backup_freshness';

  if (error) {
    addCheck(key, 'data', 'blocked', `Unable to list ${kind} backup files.`, { error });
    return;
  }

  if (files.length === 0) {
    addCheck(key, 'data', 'blocked', `No ${kind} backup files were found.`, { backupDir });
    return;
  }

  const latest = files[0];
  const ageHours = Math.round(((Date.now() - latest.mtimeMs) / 1000 / 60 / 60) * 10) / 10;
  let status = 'ready';
  if (ageHours >= backupBlockedHours) status = 'blocked';
  else if (ageHours >= backupWarningHours) status = 'warning';

  const gzipResult = runMaybeSudo('gzip', ['-t', latest.filePath]);
  if (gzipResult.status !== 0) {
    status = 'blocked';
  }

  addCheck(
    key,
    'data',
    status,
    `${kind} latest backup is ${ageHours} hour(s) old and gzip validation ${gzipResult.status === 0 ? 'passed' : 'failed'}.`,
    {
      backupDir,
      totalFiles: files.length,
      latestFile: latest.filePath,
      latestSize: latest.size,
      ageHours,
      gzipOk: gzipResult.status === 0
    }
  );
}

async function checkApiReadiness() {
  if (!password) {
    addCheck('ops_readiness', 'runtime', 'warning', 'Password was not provided, skipped authenticated readiness summary.', {
      hint: 'Set SINGLE_NODE_PASSWORD or ACCEPTANCE_PASSWORD.'
    });
    return;
  }

  try {
    const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const loginBody = await loginResponse.json();
    const token = loginBody?.data?.token || loginBody?.token;
    if (!loginResponse.ok || !token) {
      throw new Error(`login failed: HTTP ${loginResponse.status}`);
    }

    const readinessResponse = await fetch(`${apiBase}/api/ops-readiness/summary`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
    });
    const readinessBody = await readinessResponse.json();
    const data = readinessBody?.data || {};
    const ok = readinessResponse.ok
      && readinessBody?.success !== false
      && data.status === 'ready'
      && Number(data.score) >= 100
      && (!Array.isArray(data.blockers) || data.blockers.length === 0)
      && (!Array.isArray(data.warnings) || data.warnings.length === 0);

    addCheck(
      'ops_readiness',
      'runtime',
      ok ? 'ready' : data.status === 'blocked' ? 'blocked' : 'warning',
      ok ? 'Ops readiness is ready with score 100.' : `Ops readiness status=${data.status}, score=${data.score}.`,
      {
        status: data.status,
        score: data.score,
        blockers: data.blockers || [],
        warnings: data.warnings || []
      }
    );
  } catch (error) {
    addCheck('ops_readiness', 'runtime', 'blocked', 'Unable to read ops readiness summary.', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function checkLatestAcceptanceReport() {
  const reportsPath = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsPath)) {
    addCheck('latest_acceptance_report', 'deployment', 'warning', 'No reports directory was found.', { reportsPath });
    return;
  }

  const reports = fs.readdirSync(reportsPath)
    .filter((name) => name.startsWith('production-acceptance-') && name.endsWith('.json'))
    .map((name) => {
      const filePath = path.join(reportsPath, name);
      const stat = fs.statSync(filePath);
      return { name, filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (reports.length === 0) {
    addCheck('latest_acceptance_report', 'deployment', 'warning', 'No production acceptance report was found.', { reportsPath });
    return;
  }

  const latest = reports[0];
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(latest.filePath, 'utf8'));
  } catch (error) {
    addCheck('latest_acceptance_report', 'deployment', 'warning', 'Latest production acceptance report cannot be parsed.', {
      filePath: latest.filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  const ageHours = Math.round(((Date.now() - latest.mtimeMs) / 1000 / 60 / 60) * 10) / 10;
  const ok = parsed.status === 'passed' && parsed.failed === 0;
  addCheck(
    'latest_acceptance_report',
    'deployment',
    ok ? 'ready' : 'warning',
    ok ? `Latest production acceptance report passed ${ageHours} hour(s) ago.` : 'Latest production acceptance report did not pass.',
    { filePath: latest.filePath, ageHours, status: parsed.status, passed: parsed.passed, failed: parsed.failed }
  );
}

function writeReport() {
  const blockers = report.checks.filter((item) => item.status === 'blocked').map((item) => item.key);
  const warnings = report.checks.filter((item) => item.status === 'warning').map((item) => item.key);
  report.finishedAt = new Date().toISOString();
  report.status = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';
  report.blockers = blockers;
  report.warnings = warnings;

  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamp = report.finishedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `single-node-check-${timestamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n[single-node-check] report: ${reportPath}`);
  console.log(`[single-node-check] status: ${report.status}, blockers=${blockers.length}, warnings=${warnings.length}`);

  if (blockers.length > 0) {
    process.exit(1);
  }
}

checkComposeServices();
checkDiskUsage();
checkDatabaseIntegrity();
checkBackupFreshness('database');
checkBackupFreshness('kite');
await checkApiReadiness();
checkLatestAcceptanceReport();
writeReport();
