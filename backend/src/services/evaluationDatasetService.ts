import db from '../models/database';

export type EvaluationDatasetCategory =
  | 'alert_incident'
  | 'server_fault'
  | 'kubernetes_issue'
  | 'historical_failure'
  | 'approval_rejection'
  | 'verification_failure';

export interface EvaluationDatasetCase {
  id: string;
  category: EvaluationDatasetCategory;
  source_type: string;
  source_id: string;
  title: string;
  summary: string;
  status?: string | null;
  risk_level?: string | null;
  correlation_id?: string | null;
  task_id?: string | null;
  approval_id?: string | null;
  expected_signals: string[];
  coverage_tags: string[];
  created_at?: string | null;
}

export interface EvaluationDatasetCategorySummary {
  category: EvaluationDatasetCategory;
  total: number;
  ready: boolean;
  latest_at?: string | null;
}

export interface EvaluationMetricCoverage {
  key: string;
  categories: EvaluationDatasetCategory[];
  covered_count: number;
  ready: boolean;
}

export interface EvaluationDatasetOverview {
  categories: EvaluationDatasetCategorySummary[];
  metrics: EvaluationMetricCoverage[];
  cases: EvaluationDatasetCase[];
  readiness: {
    score: number;
    covered_categories: number;
    total_categories: number;
    total_cases: number;
    blockers: EvaluationDatasetCategory[];
  };
  generated_at: string;
}

const CATEGORY_ORDER: EvaluationDatasetCategory[] = [
  'alert_incident',
  'server_fault',
  'kubernetes_issue',
  'historical_failure',
  'approval_rejection',
  'verification_failure'
];

const METRIC_REQUIREMENTS: Array<{ key: string; categories: EvaluationDatasetCategory[] }> = [
  { key: 'diagnosis_hit', categories: ['alert_incident', 'server_fault', 'kubernetes_issue'] },
  { key: 'evidence_citation', categories: ['alert_incident', 'historical_failure', 'verification_failure'] },
  { key: 'risk_judgement', categories: ['approval_rejection', 'server_fault'] },
  { key: 'dangerous_action_guard', categories: ['approval_rejection', 'verification_failure'] },
  { key: 'verification_steps', categories: ['server_fault', 'verification_failure'] },
  { key: 'approval_policy', categories: ['approval_rejection'] },
  { key: 'skill_reuse', categories: ['historical_failure', 'kubernetes_issue'] }
];

export function buildEvaluationDatasetOverview(): EvaluationDatasetOverview {
  const cases = [
    ...collectAlertIncidentCases(),
    ...collectServerFaultCases(),
    ...collectKubernetesCases(),
    ...collectHistoricalFailureCases(),
    ...collectApprovalRejectionCases(),
    ...collectVerificationFailureCases()
  ];

  const categories = CATEGORY_ORDER.map(category => {
    const categoryCases = cases.filter(item => item.category === category);
    return {
      category,
      total: categoryCases.length,
      ready: categoryCases.length > 0,
      latest_at: latestAt(categoryCases)
    };
  });

  const metrics = METRIC_REQUIREMENTS.map(metric => {
    const coveredCount = metric.categories.filter(category =>
      cases.some(item => item.category === category)
    ).length;
    return {
      key: metric.key,
      categories: metric.categories,
      covered_count: coveredCount,
      ready: coveredCount === metric.categories.length
    };
  });

  const coveredCategories = categories.filter(category => category.ready).length;

  return {
    categories,
    metrics,
    cases: cases
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 18),
    readiness: {
      score: Math.round((coveredCategories / CATEGORY_ORDER.length) * 100),
      covered_categories: coveredCategories,
      total_categories: CATEGORY_ORDER.length,
      total_cases: cases.length,
      blockers: categories.filter(category => !category.ready).map(category => category.category)
    },
    generated_at: new Date().toISOString()
  };
}

function collectAlertIncidentCases(): EvaluationDatasetCase[] {
  return safeRows(`
    SELECT *
    FROM alerts
    WHERE status IN ('new', 'open', 'active', 'firing')
       OR severity IN ('critical', 'high')
    ORDER BY created_at DESC
    LIMIT 8
  `).map(row => ({
    id: `alert_incident:${asString(row.id)}`,
    category: 'alert_incident',
    source_type: 'alert',
    source_id: asString(row.id),
    title: asString(row.title, 'Alert incident'),
    summary: firstText(row.content, row.metadata, row.title),
    status: asString(row.status, null),
    risk_level: asString(row.severity, null),
    task_id: asString(row.related_task_id, null),
    expected_signals: ['diagnosis_hit', 'evidence_citation'],
    coverage_tags: compact(['alert', asString(row.source, ''), asString(row.severity, '')]),
    created_at: asString(row.created_at, null)
  }));
}

function collectServerFaultCases(): EvaluationDatasetCase[] {
  return safeRows(`
    SELECT *
    FROM tasks
    WHERE status IN ('failed', 'error', 'cancelled')
    ORDER BY created_at DESC
    LIMIT 8
  `).map(row => ({
    id: `server_fault:${asString(row.id)}`,
    category: 'server_fault',
    source_type: 'task',
    source_id: asString(row.id),
    title: asString(row.name, 'Failed workflow task'),
    summary: firstText(row.logs, row.context, row.node_results, row.name),
    status: asString(row.status, null),
    correlation_id: readCorrelationId(row.context),
    task_id: asString(row.id),
    expected_signals: ['diagnosis_hit', 'verification_steps', 'risk_judgement'],
    coverage_tags: compact(['server', 'workflow', asString(row.status, '')]),
    created_at: asString(row.created_at, null)
  }));
}

function collectKubernetesCases(): EvaluationDatasetCase[] {
  const rows = [
    ...safeRows(`
      SELECT *
      FROM alerts
      WHERE lower(title || ' ' || coalesce(content, '') || ' ' || coalesce(metadata, '')) LIKE '%k8s%'
         OR lower(title || ' ' || coalesce(content, '') || ' ' || coalesce(metadata, '')) LIKE '%kubernetes%'
      ORDER BY created_at DESC
      LIMIT 5
    `),
    ...safeRows(`
      SELECT *
      FROM tasks
      WHERE lower(name || ' ' || coalesce(logs, '') || ' ' || coalesce(context, '')) LIKE '%k8s%'
         OR lower(name || ' ' || coalesce(logs, '') || ' ' || coalesce(context, '')) LIKE '%kubernetes%'
      ORDER BY created_at DESC
      LIMIT 5
    `)
  ];

  return dedupeBy(rows.map((row): EvaluationDatasetCase => ({
    id: `kubernetes_issue:${asString(row.id)}`,
    category: 'kubernetes_issue',
    source_type: row.title ? 'alert' : 'task',
    source_id: asString(row.id),
    title: firstText(row.title, row.name, 'Kubernetes issue'),
    summary: firstText(row.content, row.logs, row.metadata, row.context, row.title, row.name),
    status: asString(row.status, null),
    risk_level: asString(row.severity, null),
    correlation_id: readCorrelationId(row.context),
    task_id: asString(row.related_task_id || row.id, null),
    expected_signals: ['diagnosis_hit', 'skill_reuse'],
    coverage_tags: compact(['kubernetes', asString(row.severity, ''), asString(row.status, '')]),
    created_at: asString(row.created_at, null)
  })), item => item.id).slice(0, 8);
}

function collectHistoricalFailureCases(): EvaluationDatasetCase[] {
  return safeRows(`
    SELECT *
    FROM agent_executions
    WHERE status IN ('failed', 'error')
       OR error_message IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 8
  `).map(row => ({
    id: `historical_failure:${asString(row.id)}`,
    category: 'historical_failure',
    source_type: 'agent_execution',
    source_id: asString(row.id),
    title: asString(row.agent_name, 'Agent execution failure'),
    summary: firstText(row.error_message, row.output_text, row.input_text, row.metadata),
    status: asString(row.status, null),
    correlation_id: readCorrelationId(row.metadata),
    expected_signals: ['evidence_citation', 'skill_reuse'],
    coverage_tags: compact(['agent_execution', asString(row.agent_name, ''), asString(row.status, '')]),
    created_at: asString(row.created_at, null)
  }));
}

function collectApprovalRejectionCases(): EvaluationDatasetCase[] {
  return safeRows(`
    SELECT *
    FROM tool_approvals
    WHERE status IN ('rejected', 'failed')
    ORDER BY requested_at DESC
    LIMIT 8
  `).map(row => ({
    id: `approval_rejection:${asString(row.id)}`,
    category: 'approval_rejection',
    source_type: 'tool_approval',
    source_id: asString(row.id),
    title: asString(row.tool_name, 'Rejected approval'),
    summary: firstText(row.reason, row.review_comment, row.input, row.execution_result),
    status: asString(row.status, null),
    risk_level: asString(row.risk_level, null),
    correlation_id: asString(row.correlation_id, null),
    approval_id: asString(row.id),
    expected_signals: ['risk_judgement', 'dangerous_action_guard', 'approval_policy'],
    coverage_tags: compact(['approval', asString(row.tool_name, ''), asString(row.risk_level, '')]),
    created_at: asString(row.requested_at, null)
  }));
}

function collectVerificationFailureCases(): EvaluationDatasetCase[] {
  const rows = [
    ...safeRows(`
      SELECT *
      FROM evolution_review_queue
      WHERE lower(source_type || ' ' || coalesce(reason, '')) LIKE '%verification%'
         OR lower(source_type || ' ' || coalesce(reason, '')) LIKE '%verify%'
         OR lower(source_type || ' ' || coalesce(reason, '')) LIKE '%验证%'
      ORDER BY created_at DESC
      LIMIT 5
    `),
    ...safeRows(`
      SELECT *
      FROM tasks
      WHERE status IN ('failed', 'error')
        AND (
          lower(name || ' ' || coalesce(logs, '') || ' ' || coalesce(context, '')) LIKE '%verify%'
          OR lower(name || ' ' || coalesce(logs, '') || ' ' || coalesce(context, '')) LIKE '%verification%'
          OR lower(name || ' ' || coalesce(logs, '') || ' ' || coalesce(context, '')) LIKE '%验证%'
        )
      ORDER BY created_at DESC
      LIMIT 5
    `)
  ];

  return dedupeBy(rows.map((row): EvaluationDatasetCase => ({
    id: `verification_failure:${asString(row.id)}`,
    category: 'verification_failure',
    source_type: row.source_type ? 'evolution_review_queue' : 'task',
    source_id: asString(row.id),
    title: firstText(row.reason, row.name, 'Verification failure'),
    summary: firstText(row.reason, row.logs, row.context, row.result_summary, row.name),
    status: asString(row.status, null),
    correlation_id: asString(row.correlation_id, null) || readCorrelationId(row.context),
    task_id: row.name ? asString(row.id) : null,
    expected_signals: ['evidence_citation', 'dangerous_action_guard', 'verification_steps'],
    coverage_tags: compact(['verification', asString(row.source_type, ''), asString(row.status, '')]),
    created_at: asString(row.created_at, null)
  })), item => item.id).slice(0, 8);
}

function safeRows(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
  try {
    return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value, '').trim();
    if (text) {
      return text.length > 240 ? `${text.slice(0, 237)}...` : text;
    }
  }
  return '-';
}

function asString(value: unknown, fallback: null): string | null;
function asString(value: unknown, fallback?: string): string;
function asString(value: unknown, fallback: string | null = ''): string | null {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function compact(values: string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean);
}

function readCorrelationId(value: unknown): string | null {
  const text = asString(value, '');
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const direct = parsed.correlationId || parsed.correlation_id;
    return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
  } catch {
    const match = text.match(/correlation[_-]?id["'\s:=]+([a-zA-Z0-9_.:-]+)/i);
    return match?.[1] || null;
  }
}

function latestAt(cases: EvaluationDatasetCase[]): string | null {
  const values = cases
    .map(item => item.created_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return values.length > 0 ? values[values.length - 1] : null;
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
