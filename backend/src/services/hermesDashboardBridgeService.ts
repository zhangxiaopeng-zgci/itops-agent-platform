import { randomUUID } from 'crypto';
import db from '../models/database';
import { createOrGetFeedbackDrivenProposal, EvolutionProposalRecord } from './evolutionProposalService';

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

export type HermesBoardFeedbackCategory =
  | 'useful'
  | 'wrong_root_cause'
  | 'missing_evidence'
  | 'unsafe_action'
  | 'needs_workflow';

export interface HermesBoardFeedback {
  id: string;
  source_type: string;
  source_id: string;
  category: HermesBoardFeedbackCategory;
  reason: string | null;
  correlation_id: string | null;
  evidence_refs: unknown;
  generated_proposal_id: string | null;
  created_by: string | null;
  created_at: string;
  proposal?: EvolutionProposalRecord | null;
}

export interface CreateHermesBoardFeedbackInput {
  sourceType: string;
  sourceId: string;
  category: HermesBoardFeedbackCategory;
  reason?: string | null;
  correlationId?: string | null;
  evidenceRefs?: unknown;
  createdBy?: string | null;
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

export function createHermesBoardFeedback(input: CreateHermesBoardFeedbackInput): HermesBoardFeedback {
  const sourceType = normalizeFeedbackSourceType(input.sourceType);
  const sourceId = normalizeFeedbackText(input.sourceId, 'sourceId', 160);
  const category = normalizeFeedbackCategory(input.category);
  const reason = normalizeOptionalFeedbackText(input.reason, 1000);
  const correlationId = normalizeOptionalFeedbackText(input.correlationId, 128);
  const evidenceRefs = input.evidenceRefs ?? {};
  const id = randomUUID();

  let proposal: EvolutionProposalRecord | null = null;
  if (category !== 'useful') {
    proposal = createOrGetFeedbackDrivenProposal({
      sourceType,
      sourceId,
      reason: buildFeedbackReason(category, reason),
      priority: category === 'unsafe_action' ? 'P1' : 'P2',
      correlationId,
      evidence: {
        ...objectOrEmpty(evidenceRefs),
        boardFeedback: {
          category,
          reason: reason || null
        }
      },
      createdBy: input.createdBy || null
    });
  }

  db.prepare(`
    INSERT INTO hermes_board_feedback (
      id, source_type, source_id, category, reason, correlation_id,
      evidence_refs, generated_proposal_id, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sourceType,
    sourceId,
    category,
    reason,
    correlationId,
    JSON.stringify(evidenceRefs),
    proposal?.id || null,
    input.createdBy || null
  );

  const row = db.prepare('SELECT * FROM hermes_board_feedback WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('Failed to save Hermes board feedback');
  }

  return {
    ...parseHermesBoardFeedback(row),
    proposal
  };
}

function parseHermesBoardFeedback(row: Record<string, unknown>): HermesBoardFeedback {
  return {
    id: String(row.id),
    source_type: String(row.source_type),
    source_id: String(row.source_id),
    category: normalizeFeedbackCategory(String(row.category)),
    reason: nullableString(row.reason),
    correlation_id: nullableString(row.correlation_id),
    evidence_refs: parseJson(row.evidence_refs, {}),
    generated_proposal_id: nullableString(row.generated_proposal_id),
    created_by: nullableString(row.created_by),
    created_at: String(row.created_at || '')
  };
}

function normalizeFeedbackSourceType(value: string): string {
  const normalized = String(value || '').trim();
  if (['hermes_session', 'worker_run', 'correlation_trace', 'tool_approval', 'task'].includes(normalized)) {
    return normalized;
  }
  throw new Error('Invalid feedback source type');
}

function normalizeFeedbackCategory(value: string): HermesBoardFeedbackCategory {
  if (
    value === 'useful'
    || value === 'wrong_root_cause'
    || value === 'missing_evidence'
    || value === 'unsafe_action'
    || value === 'needs_workflow'
  ) {
    return value;
  }
  throw new Error('Invalid feedback category');
}

function buildFeedbackReason(category: HermesBoardFeedbackCategory, reason: string | null): string {
  const categoryReason: Record<HermesBoardFeedbackCategory, string> = {
    useful: 'useful',
    wrong_root_cause: 'wrong root cause',
    missing_evidence: 'missing evidence',
    unsafe_action: 'unsafe action',
    needs_workflow: 'needs workflow'
  };
  return [categoryReason[category], reason].filter(Boolean).join(': ');
}

function normalizeFeedbackText(value: unknown, field: string, maxLength: number): string {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required`);
  return text.slice(0, maxLength);
}

function normalizeOptionalFeedbackText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
