import { randomUUID } from 'crypto';
import db from '../models/database';

export type HermesDashboardEmbedMode = 'link' | 'iframe' | 'sidecar';
export type HermesDashboardAuthMode = 'none' | 'reverse_proxy' | 'token';

export interface HermesDashboardSettings {
  enabled: boolean;
  dashboardUrl: string;
  embedMode: HermesDashboardEmbedMode;
  authMode: HermesDashboardAuthMode;
  allowedOrigins: string[];
}

export interface HermesDashboardHealth {
  enabled: boolean;
  reachable: boolean;
  status: 'disabled' | 'not_configured' | 'healthy' | 'unreachable';
  dashboardUrl: string | null;
  checkedAt: string;
  latencyMs: number | null;
  statusPayload: unknown | null;
  error: string | null;
}

export interface HermesExternalLink {
  id: string;
  source_type: string;
  source_id: string;
  correlation_id: string | null;
  external_system: string;
  external_url: string;
  external_card_id: string | null;
  external_run_id: string | null;
  external_state: string | null;
  title: string | null;
  metadata: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertHermesExternalLinkInput {
  source_type: string;
  source_id: string;
  correlation_id?: string | null;
  external_system?: string | null;
  external_url: string;
  external_card_id?: string | null;
  external_run_id?: string | null;
  external_state?: string | null;
  title?: string | null;
  metadata?: unknown;
  created_by?: string | null;
}

const SETTING_KEYS = {
  enabled: 'HERMES_DASHBOARD_ENABLED',
  dashboardUrl: 'HERMES_DASHBOARD_URL',
  embedMode: 'HERMES_DASHBOARD_EMBED_MODE',
  authMode: 'HERMES_DASHBOARD_AUTH_MODE',
  allowedOrigins: 'HERMES_DASHBOARD_ALLOWED_ORIGINS',
} as const;

function readSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string | null } | undefined;
  return row?.value ?? fallback;
}

function writeSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, value, value);
}

function normalizeDashboardUrl(value: string | null | undefined): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function normalizeEmbedMode(value: string | null | undefined): HermesDashboardEmbedMode {
  if (value === 'iframe' || value === 'sidecar') return value;
  return 'link';
}

function normalizeAuthMode(value: string | null | undefined): HermesDashboardAuthMode {
  if (value === 'reverse_proxy' || value === 'token') return value;
  return 'none';
}

function splitOrigins(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function getHermesDashboardSettings(): HermesDashboardSettings {
  return {
    enabled: readSetting(SETTING_KEYS.enabled, 'false') === 'true',
    dashboardUrl: normalizeDashboardUrl(readSetting(SETTING_KEYS.dashboardUrl, '')),
    embedMode: normalizeEmbedMode(readSetting(SETTING_KEYS.embedMode, 'link')),
    authMode: normalizeAuthMode(readSetting(SETTING_KEYS.authMode, 'none')),
    allowedOrigins: splitOrigins(readSetting(SETTING_KEYS.allowedOrigins, '')),
  };
}

export function updateHermesDashboardSettings(input: Partial<HermesDashboardSettings>): HermesDashboardSettings {
  if (input.enabled !== undefined) writeSetting(SETTING_KEYS.enabled, input.enabled ? 'true' : 'false');
  if (input.dashboardUrl !== undefined) writeSetting(SETTING_KEYS.dashboardUrl, normalizeDashboardUrl(input.dashboardUrl));
  if (input.embedMode !== undefined) writeSetting(SETTING_KEYS.embedMode, normalizeEmbedMode(input.embedMode));
  if (input.authMode !== undefined) writeSetting(SETTING_KEYS.authMode, normalizeAuthMode(input.authMode));
  if (input.allowedOrigins !== undefined) writeSetting(SETTING_KEYS.allowedOrigins, input.allowedOrigins.join(','));
  return getHermesDashboardSettings();
}

export async function probeHermesDashboard(): Promise<HermesDashboardHealth> {
  const settings = getHermesDashboardSettings();
  const checkedAt = new Date().toISOString();

  if (!settings.enabled) {
    return {
      enabled: false,
      reachable: false,
      status: 'disabled',
      dashboardUrl: settings.dashboardUrl || null,
      checkedAt,
      latencyMs: null,
      statusPayload: null,
      error: null,
    };
  }

  if (!settings.dashboardUrl) {
    return {
      enabled: true,
      reachable: false,
      status: 'not_configured',
      dashboardUrl: null,
      checkedAt,
      latencyMs: null,
      statusPayload: null,
      error: 'Hermes Dashboard URL is not configured',
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${settings.dashboardUrl}/api/status`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const text = await response.text();
    let statusPayload: unknown = text;
    try {
      statusPayload = text ? JSON.parse(text) : null;
    } catch {
      statusPayload = text;
    }

    return {
      enabled: true,
      reachable: response.ok,
      status: response.ok ? 'healthy' : 'unreachable',
      dashboardUrl: settings.dashboardUrl,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      statusPayload,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      enabled: true,
      reachable: false,
      status: 'unreachable',
      dashboardUrl: settings.dashboardUrl,
      checkedAt,
      latencyMs: Date.now() - startedAt,
      statusPayload: null,
      error: error instanceof Error ? error.message : 'Failed to reach Hermes Dashboard',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function listHermesExternalLinks(filters: { sourceType?: string; sourceId?: string; correlationId?: string; limit?: number } = {}): HermesExternalLink[] {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.sourceType) {
    clauses.push('source_type = ?');
    values.push(filters.sourceType);
  }
  if (filters.sourceId) {
    clauses.push('source_id = ?');
    values.push(filters.sourceId);
  }
  if (filters.correlationId) {
    clauses.push('correlation_id = ?');
    values.push(filters.correlationId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200);

  return db.prepare(`
    SELECT *
    FROM hermes_external_links
    ${where}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT ?
  `).all(...values, limit) as HermesExternalLink[];
}

export function upsertHermesExternalLink(input: UpsertHermesExternalLinkInput): HermesExternalLink {
  const id = randomUUID();
  const externalSystem = input.external_system || 'hermes_dashboard';
  const metadata = input.metadata === undefined ? null : JSON.stringify(input.metadata);

  db.prepare(`
    INSERT INTO hermes_external_links (
      id, source_type, source_id, correlation_id, external_system, external_url,
      external_card_id, external_run_id, external_state, title, metadata, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_type, source_id, external_system, external_card_id)
    DO UPDATE SET
      correlation_id = excluded.correlation_id,
      external_url = excluded.external_url,
      external_run_id = excluded.external_run_id,
      external_state = excluded.external_state,
      title = excluded.title,
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id,
    input.source_type,
    input.source_id,
    input.correlation_id || null,
    externalSystem,
    input.external_url,
    input.external_card_id || null,
    input.external_run_id || null,
    input.external_state || null,
    input.title || null,
    metadata,
    input.created_by || null
  );

  const row = db.prepare(`
    SELECT *
    FROM hermes_external_links
    WHERE source_type = ? AND source_id = ? AND external_system = ?
      AND COALESCE(external_card_id, '') = COALESCE(?, '')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(input.source_type, input.source_id, externalSystem, input.external_card_id || null) as HermesExternalLink | undefined;

  if (!row) {
    throw new Error('Failed to save Hermes external link');
  }

  return row;
}
