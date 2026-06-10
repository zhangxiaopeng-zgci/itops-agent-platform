import axios from 'axios';
import { randomUUID } from 'crypto';
import db from '../models/database';

export type HermesWorkerRole = 'diagnose' | 'remediate' | 'evolve';

export interface HermesWorkerDefinition {
  role: HermesWorkerRole;
  name: string;
  channelType: string;
  url?: string;
}

export interface HermesWorkerStatus extends HermesWorkerDefinition {
  configured: boolean;
  healthy: boolean;
  latencyMs: number;
  status: string;
  model?: string;
  upstreamConfigured?: boolean;
  error?: string;
  runStats?: HermesWorkerRunStats;
  lastRun?: HermesWorkerRunRecord | null;
}

export interface HermesWorkerRunMetadata {
  attempted: boolean;
  used: boolean;
  fallbackUsed: boolean;
  role?: HermesWorkerRole;
  url?: string;
  latencyMs?: number;
  error?: string;
}

export interface HermesWorkerRunResult {
  data: Record<string, unknown>;
  metadata: HermesWorkerRunMetadata;
}

export interface HermesWorkerRunTelemetry {
  agentId?: string;
  channelId?: string;
  correlationId?: string;
}

export interface HermesWorkerRunRecord {
  id: string;
  worker_role: string | null;
  worker_url: string | null;
  agent_id: string | null;
  channel_id: string | null;
  correlation_id: string | null;
  status: string;
  latency_ms: number | null;
  fallback_used: number;
  error: string | null;
  created_at: string;
}

export interface HermesWorkerHeartbeatRecord {
  id: string;
  worker_role: string;
  worker_url: string | null;
  healthy: number;
  status: string;
  latency_ms: number | null;
  model: string | null;
  upstream_configured: number;
  error: string | null;
  checked_at: string;
}

export interface HermesWorkerRunStats {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  fallbackRuns: number;
  avgLatencyMs: number | null;
  lastRunAt: string | null;
}

const WORKERS: HermesWorkerDefinition[] = [
  {
    role: 'diagnose',
    name: 'Hermes Diagnose Worker',
    channelType: 'diagnose',
    url: process.env.HERMES_WORKER_DIAGNOSE_URL
  },
  {
    role: 'remediate',
    name: 'Hermes Remediate Worker',
    channelType: 'remediate',
    url: process.env.HERMES_WORKER_REMEDIATE_URL
  },
  {
    role: 'evolve',
    name: 'Hermes Evolve Worker',
    channelType: 'review',
    url: process.env.HERMES_WORKER_EVOLVE_URL
  }
];

export function listHermesWorkerDefinitions(): HermesWorkerDefinition[] {
  return WORKERS.map(worker => ({ ...worker }));
}

export function resolveHermesWorkerForChannel(channelType?: string): HermesWorkerDefinition | null {
  if (!channelType) return null;
  return WORKERS.find(worker => worker.channelType === channelType) || null;
}

export async function getHermesWorkerStatuses(): Promise<HermesWorkerStatus[]> {
  const statuses = await Promise.all(WORKERS.map(async (worker) => {
    if (!worker.url) {
      const status: HermesWorkerStatus = {
        ...worker,
        configured: false,
        healthy: false,
        latencyMs: 0,
        status: 'not_configured'
      };
      persistHermesWorkerStatus(status);
      return appendWorkerStats(status);
    }

    const startTime = Date.now();
    try {
      const response = await axios.get(`${trimTrailingSlash(worker.url)}/health`, { timeout: 5000 });
      const status: HermesWorkerStatus = {
        ...worker,
        configured: true,
        healthy: response.data?.status === 'healthy',
        latencyMs: Date.now() - startTime,
        status: String(response.data?.status || 'unknown'),
        model: typeof response.data?.model === 'string' ? response.data.model : undefined,
        upstreamConfigured: Boolean(response.data?.upstreamConfigured)
      };
      persistHermesWorkerStatus(status);
      persistHermesWorkerHeartbeat(status);
      return appendWorkerStats(status);
    } catch (error) {
      const status: HermesWorkerStatus = {
        ...worker,
        configured: true,
        healthy: false,
        latencyMs: Date.now() - startTime,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      persistHermesWorkerStatus(status);
      persistHermesWorkerHeartbeat(status);
      return appendWorkerStats(status);
    }
  }));

  cleanupOldHermesWorkerObservability();
  return statuses;
}

export async function runHermesWorker(
  worker: HermesWorkerDefinition,
  body: Record<string, unknown>,
  timeoutMs: number,
  telemetry?: HermesWorkerRunTelemetry
): Promise<HermesWorkerRunResult> {
  if (!worker.url) {
    throw new Error(`Hermes worker URL is not configured for role: ${worker.role}`);
  }

  const startTime = Date.now();
  const response = await axios.post(
    `${trimTrailingSlash(worker.url)}/run`,
    body,
    { timeout: timeoutMs }
  );

  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.error || `Hermes worker ${worker.role} returned an invalid response`);
  }

  const metadata: HermesWorkerRunMetadata = {
    attempted: true,
    used: true,
    fallbackUsed: false,
    role: worker.role,
    url: worker.url,
    latencyMs: Date.now() - startTime
  };

  recordHermesWorkerRun({
    workerRole: worker.role,
    workerUrl: worker.url,
    status: 'success',
    latencyMs: metadata.latencyMs,
    fallbackUsed: false,
    telemetry
  });

  return {
    data: response.data.data,
    metadata
  };
}

export function isHermesWorkerFallbackEnabled(): boolean {
  return process.env.HERMES_WORKER_FALLBACK_ENABLED !== 'false';
}

export function recordHermesWorkerRun(input: {
  workerRole?: string | null;
  workerUrl?: string | null;
  status: 'success' | 'failed' | 'fallback' | 'not_configured';
  latencyMs?: number | null;
  fallbackUsed?: boolean;
  error?: string | null;
  telemetry?: HermesWorkerRunTelemetry;
}): void {
  try {
    db.prepare(`
      INSERT INTO hermes_worker_runs (
        id, worker_role, worker_url, agent_id, channel_id, correlation_id,
        status, latency_ms, fallback_used, error, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      randomUUID(),
      input.workerRole || null,
      input.workerUrl || null,
      input.telemetry?.agentId || null,
      input.telemetry?.channelId || null,
      input.telemetry?.correlationId || null,
      input.status,
      input.latencyMs ?? null,
      input.fallbackUsed ? 1 : 0,
      input.error || null
    );
  } catch {
    // Observability must never break runtime execution.
  }
}

export function listHermesWorkerRuns(limit = 50): HermesWorkerRunRecord[] {
  return (db.prepare(`
    SELECT *
    FROM hermes_worker_runs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 200)) as Array<Record<string, unknown>>).map(parseRunRecord);
}

export function listHermesWorkerHeartbeats(limit = 100): HermesWorkerHeartbeatRecord[] {
  return (db.prepare(`
    SELECT *
    FROM hermes_worker_heartbeats
    ORDER BY checked_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 500)) as Array<Record<string, unknown>>).map(parseHeartbeatRecord);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function appendWorkerStats(status: HermesWorkerStatus): HermesWorkerStatus {
  return {
    ...status,
    runStats: getRunStats(status.role),
    lastRun: getLastRun(status.role)
  };
}

function persistHermesWorkerStatus(status: HermesWorkerStatus): void {
  try {
    db.prepare(`
      INSERT INTO hermes_workers (
        id, role, name, channel_type, url, configured, healthy, status,
        model, upstream_configured, last_latency_ms, last_error, last_checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET
        name = excluded.name,
        channel_type = excluded.channel_type,
        url = excluded.url,
        configured = excluded.configured,
        healthy = excluded.healthy,
        status = excluded.status,
        model = excluded.model,
        upstream_configured = excluded.upstream_configured,
        last_latency_ms = excluded.last_latency_ms,
        last_error = excluded.last_error,
        last_checked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      `hermes-worker-${status.role}`,
      status.role,
      status.name,
      status.channelType,
      status.url || null,
      status.configured ? 1 : 0,
      status.healthy ? 1 : 0,
      status.status,
      status.model || null,
      status.upstreamConfigured ? 1 : 0,
      status.latencyMs,
      status.error || null
    );
  } catch {
    // Observability must never break health checks.
  }
}

function persistHermesWorkerHeartbeat(status: HermesWorkerStatus): void {
  try {
    db.prepare(`
      INSERT INTO hermes_worker_heartbeats (
        id, worker_role, worker_url, healthy, status, latency_ms,
        model, upstream_configured, error, checked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      randomUUID(),
      status.role,
      status.url || null,
      status.healthy ? 1 : 0,
      status.status,
      status.latencyMs,
      status.model || null,
      status.upstreamConfigured ? 1 : 0,
      status.error || null
    );
  } catch {
    // Observability must never break health checks.
  }
}

function getRunStats(role: string): HermesWorkerRunStats {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS totalRuns,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successRuns,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedRuns,
      SUM(CASE WHEN fallback_used = 1 THEN 1 ELSE 0 END) AS fallbackRuns,
      AVG(latency_ms) AS avgLatencyMs,
      MAX(created_at) AS lastRunAt
    FROM hermes_worker_runs
    WHERE worker_role = ?
      AND created_at >= datetime('now', '-24 hours')
  `).get(role) as Record<string, unknown> | undefined;

  return {
    totalRuns: Number(row?.totalRuns || 0),
    successRuns: Number(row?.successRuns || 0),
    failedRuns: Number(row?.failedRuns || 0),
    fallbackRuns: Number(row?.fallbackRuns || 0),
    avgLatencyMs: row?.avgLatencyMs === null || row?.avgLatencyMs === undefined ? null : Math.round(Number(row.avgLatencyMs)),
    lastRunAt: typeof row?.lastRunAt === 'string' ? row.lastRunAt : null
  };
}

function getLastRun(role: string): HermesWorkerRunRecord | null {
  const row = db.prepare(`
    SELECT *
    FROM hermes_worker_runs
    WHERE worker_role = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(role) as Record<string, unknown> | undefined;

  return row ? parseRunRecord(row) : null;
}

function parseRunRecord(row: Record<string, unknown>): HermesWorkerRunRecord {
  return {
    id: String(row.id),
    worker_role: nullableString(row.worker_role),
    worker_url: nullableString(row.worker_url),
    agent_id: nullableString(row.agent_id),
    channel_id: nullableString(row.channel_id),
    correlation_id: nullableString(row.correlation_id),
    status: String(row.status || 'unknown'),
    latency_ms: nullableNumber(row.latency_ms),
    fallback_used: Number(row.fallback_used || 0),
    error: nullableString(row.error),
    created_at: String(row.created_at || '')
  };
}

function parseHeartbeatRecord(row: Record<string, unknown>): HermesWorkerHeartbeatRecord {
  return {
    id: String(row.id),
    worker_role: String(row.worker_role || ''),
    worker_url: nullableString(row.worker_url),
    healthy: Number(row.healthy || 0),
    status: String(row.status || 'unknown'),
    latency_ms: nullableNumber(row.latency_ms),
    model: nullableString(row.model),
    upstream_configured: Number(row.upstream_configured || 0),
    error: nullableString(row.error),
    checked_at: String(row.checked_at || '')
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanupOldHermesWorkerObservability(): void {
  try {
    db.prepare(`DELETE FROM hermes_worker_heartbeats WHERE checked_at < datetime('now', '-7 days')`).run();
    db.prepare(`DELETE FROM hermes_worker_runs WHERE created_at < datetime('now', '-30 days')`).run();
  } catch {
    // Best-effort cleanup.
  }
}
