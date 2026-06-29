#!/usr/bin/env node

const apiBase = (process.env.API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const username = process.env.SMOKE_USERNAME || 'admin';
const password = process.env.SMOKE_PASSWORD;
const requireActiveRelease = process.env.REQUIRE_ACTIVE_RELEASE === 'true';
const runClosedLoopSmoke = process.env.CLOSED_LOOP_SMOKE === 'true';

if (!password) {
  throw new Error('SMOKE_PASSWORD is required');
}

const checks = [
  { name: 'health-summary', path: '/api/health/summary', auth: true },
  { name: 'dashboard-stats', path: '/api/dashboard/stats', auth: true },
  { name: 'servers', path: '/api/servers', auth: true },
  { name: 'server-groups', path: '/api/server-groups', auth: true },
  { name: 'agents', path: '/api/agents', auth: true },
  { name: 'workflows', path: '/api/workflows', auth: true },
  { name: 'tasks', path: '/api/tasks', auth: true },
  { name: 'alerts', path: '/api/alerts', auth: true },
  { name: 'knowledge', path: '/api/knowledge', auth: true },
  { name: 'scripts', path: '/api/scripts', auth: true },
  { name: 'scheduled-tasks', path: '/api/scheduled-tasks', auth: true },
  { name: 'audit', path: '/api/audit?limit=5', auth: true },
  { name: 'notifications', path: '/api/notifications', auth: true },
  { name: 'users', path: '/api/users', auth: true },
  { name: 'settings', path: '/api/settings', auth: true },
  { name: 'ops-readiness', path: '/api/ops-readiness/summary', auth: true },
  { name: 'closed-loop-smoke-drills', path: '/api/ops-readiness/closed-loop-smoke-drills?limit=5', auth: true },
  { name: 'kite-backups', path: '/api/ops-readiness/kite-backups?limit=5', auth: true },
  { name: 'kite-restore-drills', path: '/api/ops-readiness/kite-restore-drills?limit=5', auth: true },
  { name: 'hermes-channels', path: '/api/hermes-channels', auth: true },
  { name: 'hermes-workers', path: '/api/hermes-workers', auth: true },
  { name: 'hermes-control-plane', path: '/api/hermes-control-plane/overview', auth: true },
  { name: 'agent-teams', path: '/api/agent-teams', auth: true },
  { name: 'skills', path: '/api/skills', auth: true },
  { name: 'mcp-servers', path: '/api/mcp-servers', auth: true },
  { name: 'evolution-proposals', path: '/api/evolution-proposals?limit=5', auth: true },
  { name: 'release-versions', path: '/api/evolution-proposals/releases/versions?status=active&limit=5', auth: true },
  { name: 'evolution-tasks', path: '/api/evolution-tasks', auth: true },
  { name: 'tool-approvals', path: '/api/tool-approvals', auth: true },
  { name: 'ai-models', path: '/api/ai-models', auth: true },
  { name: 'remediation-policies', path: '/api/remediation-policies', auth: true },
  { name: 'remediation-executions', path: '/api/remediation-executions', auth: true },
  { name: 'network-devices', path: '/api/network-devices', auth: true },
  { name: 'credentials', path: '/api/ssh-keys', auth: true },
  { name: 'kubernetes-credentials', path: '/api/kubernetes-credentials', auth: true },
  { name: 'topology-global', path: '/api/topology/global', auth: true },
  { name: 'topology-dependency', path: '/api/topology/dependency', auth: true },
];

async function request(path, token) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function postJson(path, token, payload = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

async function login() {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json().catch(() => null);
  const token = body?.data?.token || body?.token;
  if (!response.ok || !token) {
    throw new Error(`login failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return token;
}

function getPayloadSize(body) {
  if (Array.isArray(body?.data)) return body.data.length;
  if (Array.isArray(body)) return body.length;
  if (body?.data && typeof body.data === 'object') return Object.keys(body.data).length;
  if (body && typeof body === 'object') return Object.keys(body).length;
  return 0;
}

const startedAt = new Date().toISOString();
const token = await login();
const results = [];

for (const check of checks) {
  const started = Date.now();
  try {
    const { response, body } = await request(check.path, check.auth ? token : undefined);
    const ok = response.ok && body?.success !== false;
    results.push({
      name: check.name,
      path: check.path,
      ok,
      status: response.status,
      durationMs: Date.now() - started,
      size: getPayloadSize(body),
      error: ok ? undefined : body?.message || body?.error || body
    });
  } catch (error) {
    results.push({
      name: check.name,
      path: check.path,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      size: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

if (runClosedLoopSmoke) {
  const started = Date.now();
  let smokeCorrelationId = null;
  try {
    const { response, body } = await postJson('/api/ops-readiness/closed-loop-smoke', token, { retainEvidence: false });
    const data = body?.data || {};
    smokeCorrelationId = data.correlationId || null;
    const ok = response.ok
      && body?.success !== false
      && data.success === true
      && data.finalCaseStatus === 'reviewing'
      && data.verificationPassed === true
      && data.cleanedUp === true
      && Array.isArray(data.eventTypes)
      && data.eventTypes.includes('remediation_verification_passed');
    results.push({
      name: 'closed-loop-smoke',
      path: '/api/ops-readiness/closed-loop-smoke',
      ok,
      status: response.status,
      durationMs: Date.now() - started,
      size: getPayloadSize(body),
      error: ok ? undefined : body?.message || body?.error || body
    });
  } catch (error) {
    results.push({
      name: 'closed-loop-smoke',
      path: '/api/ops-readiness/closed-loop-smoke',
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      size: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const drillStarted = Date.now();
  try {
    const { response, body } = await request('/api/ops-readiness/closed-loop-smoke-drills?limit=5', token);
    const latest = Array.isArray(body?.data) ? body.data[0] : null;
    const ok = response.ok
      && body?.success !== false
      && latest?.status === 'passed'
      && latest?.verification_passed === true
      && latest?.cleaned_up === true
      && (!smokeCorrelationId || latest?.correlation_id === smokeCorrelationId);
    results.push({
      name: 'closed-loop-smoke-drill-record',
      path: '/api/ops-readiness/closed-loop-smoke-drills?limit=5',
      ok,
      status: response.status,
      durationMs: Date.now() - drillStarted,
      size: getPayloadSize(body),
      error: ok ? undefined : body?.message || body?.error || body
    });
  } catch (error) {
    results.push({
      name: 'closed-loop-smoke-drill-record',
      path: '/api/ops-readiness/closed-loop-smoke-drills?limit=5',
      ok: false,
      status: 0,
      durationMs: Date.now() - drillStarted,
      size: 0,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const readiness = results.find((item) => item.name === 'ops-readiness');
const releases = results.find((item) => item.name === 'release-versions');
const semanticFailures = [];

if (!readiness?.ok) {
  semanticFailures.push('ops-readiness summary is unavailable');
}

if (requireActiveRelease && (!releases?.ok || releases.size < 1)) {
  semanticFailures.push('no active release version found');
}

const failed = results.filter((item) => !item.ok);
const summary = {
  apiBase,
  startedAt,
  finishedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  semanticFailures,
  results
};

console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0 || semanticFailures.length > 0) {
  process.exit(1);
}
