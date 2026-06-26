import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Clock,
  ClipboardList,
  ExternalLink,
  FileSearch,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Server as ServerIcon,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import MarkdownOutput from '../components/MarkdownOutput';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { type MessageKey, useLocale } from '../contexts/LocaleContext';

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  description?: string;
  enabled: number;
  runtime?: string | null;
  runtime_config?: string | Record<string, unknown> | null;
  autonomy_level?: string | null;
  channel_id?: string | null;
}

interface HermesChannel {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  model: string;
  api_key_ref: string;
  enabled: number;
  health_status: string;
  last_checked_at?: string | null;
  tools: Array<{ tool_name: string; enabled: number }>;
}

interface TraceEvent {
  type?: string;
  content?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

interface AgentRunResponse {
  executionId: string;
  sessionId?: string;
  hermesSession?: HermesSession;
  output: string;
  status: string;
  executionTime: number;
  metadata?: {
    correlationId?: string;
    runtime?: string | null;
    runtimeMetadata?: Record<string, unknown>;
    trace?: TraceEvent[];
  };
  trace?: TraceEvent[];
}

interface TraceSummary {
  success?: boolean;
  decisionStatus?: string;
  approvalId?: string;
  taskId?: string;
  correlationId?: string;
  toolCallId?: string;
  error?: string;
}

interface ServerItem {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  enabled: number;
  tags?: string[];
  os_type?: string;
}

interface KubernetesClusterItem {
  id: string;
  name: string;
  environment?: string | null;
  api_server_url?: string | null;
  status?: string | null;
  enabled?: number;
  distribution?: string | null;
  version?: string | null;
  node_count?: number;
  bound_server_count?: number;
}

interface AlertItem {
  id: string;
  source: string;
  severity: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
}

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  is_template: number;
  nodes?: unknown[];
}

interface KnowledgeItem {
  id: string;
  title: string;
  category?: string;
}

interface ToolApprovalItem {
  id: string;
  tool_name: string;
  input: Record<string, unknown>;
  source?: string | null;
  risk_level: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  requested_at: string;
  reviewed_at?: string | null;
  correlation_id?: string | null;
  execution_result?: unknown;
}

interface TaskItem {
  id: string;
  name: string;
  workflow_id: string;
  status: string;
  current_node_id?: string | null;
  node_results?: unknown;
  logs?: unknown;
  execution_order?: unknown;
  created_at: string;
}

interface ExecutionEvidenceItem {
  sourceType?: string;
  sourceId?: string;
  agentName?: string | null;
  taskName?: string | null;
  nodeId?: string | null;
  status?: string;
  riskLevel?: string;
  hypothesis?: string;
  traceId?: string;
  generatedAt?: string;
  createdAt?: string | null;
  evidence?: Record<string, unknown>;
}

interface CorrelationEvidenceSummary {
  schemaVersion?: string;
  counts?: Record<string, unknown>;
  riskLevels?: string[];
  toolCalls?: string[];
  traceIds?: string[];
  releaseOverlayVersionIds?: string[];
  latestEvidenceAt?: string | null;
}

interface CorrelationChain {
  correlationId: string;
  operationCases?: OperationCase[];
  hermesSessions?: HermesSession[];
  agentExecutions?: Array<Record<string, unknown>>;
  approvals?: ToolApprovalItem[];
  tasks?: TaskItem[];
  auditLogs?: Array<Record<string, unknown>>;
  teamRuns?: Array<Record<string, unknown>>;
  workerRuns?: Array<Record<string, unknown>>;
  executionEvidence?: ExecutionEvidenceItem[];
  executionEvidenceSummary?: CorrelationEvidenceSummary;
}

type OperationCaseStatus =
  | 'diagnosing'
  | 'diagnosis_ready'
  | 'approval_pending'
  | 'executing'
  | 'verifying'
  | 'reviewing'
  | 'evolving'
  | 'closed'
  | 'cancelled';

interface OperationCase {
  id: string;
  title: string;
  case_type?: string | null;
  status: OperationCaseStatus;
  severity?: string | null;
  source?: string | null;
  asset_id?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  alert_id?: string | null;
  correlation_id?: string | null;
  server_ids?: string[];
  created_at: string;
  updated_at: string;
}

interface OperationCaseEvent {
  id: string;
  event_type: string;
  source_type?: string | null;
  source_id?: string | null;
  correlation_id?: string | null;
  payload?: Record<string, unknown>;
  created_at: string;
}

interface OperationCaseDetail {
  case: OperationCase;
  events: OperationCaseEvent[];
  trace?: CorrelationChain;
}

interface HermesSession {
  id: string;
  agent_execution_id?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  mode?: HermesMode | string | null;
  input: string;
  output?: string | null;
  selected_context?: unknown;
  trace?: TraceEvent[];
  extracted_refs?: {
    approvalIds?: string[];
    taskIds?: string[];
    correlationIds?: string[];
  };
  correlation_id?: string | null;
  status: string;
  created_at: string;
}

interface VerificationResult {
  success: boolean;
  tool: string;
  decision?: {
    status?: string;
    reason?: string;
    riskLevel?: string;
  };
  data?: {
    taskId?: string;
    verified?: boolean;
    expectedStatus?: string;
    actualStatus?: string;
    failedNodes?: Array<{ nodeId?: string; error?: string }>;
    completedAt?: string | null;
    message?: string;
  };
  error?: string;
}

type HermesMode = 'diagnose' | 'remediate' | 'review';

const panelClass = 'bg-surface/95 backdrop-blur-xl rounded-2xl border border-border shadow-lg';
const inputClass = 'w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all';

const HERMES_MODES: Array<{
  id: HermesMode;
  titleKey: MessageKey;
  subtitleKey: MessageKey;
  agentName: string;
  icon: typeof BrainCircuit;
  color: string;
  promptKeys: MessageKey[];
}> = [
  {
    id: 'diagnose',
    titleKey: 'hermes.mode.diagnose.title',
    subtitleKey: 'hermes.mode.diagnose.subtitle',
    agentName: 'Hermes 诊断修复 Agent',
    icon: FileSearch,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    promptKeys: [
      'hermes.prompt.diagnose.cpu',
      'hermes.prompt.diagnose.alerts',
      'hermes.prompt.diagnose.capacity',
    ],
  },
  {
    id: 'remediate',
    titleKey: 'hermes.mode.remediate.title',
    subtitleKey: 'hermes.mode.remediate.subtitle',
    agentName: 'Hermes 修复编排 Agent',
    icon: Wrench,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    promptKeys: [
      'hermes.prompt.remediate.workflow',
      'hermes.prompt.remediate.service',
      'hermes.prompt.remediate.plan',
    ],
  },
  {
    id: 'review',
    titleKey: 'hermes.mode.review.title',
    subtitleKey: 'hermes.mode.review.subtitle',
    agentName: 'Hermes 复盘进化 Agent',
    icon: ShieldCheck,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    promptKeys: [
      'hermes.prompt.review.trace',
      'hermes.prompt.review.tools',
      'hermes.prompt.review.proposal',
    ],
  },
];

const CASE_STATUS_LABEL_KEYS: Record<OperationCaseStatus, MessageKey> = {
  diagnosing: 'operationCases.status.diagnosing',
  diagnosis_ready: 'operationCases.status.diagnosisReady',
  approval_pending: 'operationCases.status.approvalPending',
  executing: 'operationCases.status.executing',
  verifying: 'operationCases.status.verifying',
  reviewing: 'operationCases.status.reviewing',
  evolving: 'operationCases.status.evolving',
  closed: 'operationCases.status.closed',
  cancelled: 'operationCases.status.cancelled',
};

const CASE_EVENT_LABEL_KEYS: Record<string, MessageKey> = {
  case_created: 'operationCases.event.caseCreated',
  status_changed: 'operationCases.event.statusChanged',
  tool_approval_created: 'operationCases.event.approvalCreated',
  tool_approval_approved: 'operationCases.event.approvalApproved',
  tool_approval_rejected: 'operationCases.event.approvalRejected',
  tool_approval_executed: 'operationCases.event.approvalExecuted',
  tool_approval_execution_failed: 'operationCases.event.approvalFailed',
  workflow_task_created: 'operationCases.event.taskCreated',
  workflow_task_started: 'operationCases.event.taskStarted',
  workflow_task_completed: 'operationCases.event.taskCompleted',
  workflow_task_failed: 'operationCases.event.taskFailed',
  remediation_verification_passed: 'operationCases.event.verifyPassed',
  remediation_verification_failed: 'operationCases.event.verifyFailed',
  hermes_diagnosis_completed: 'operationCases.event.hermesDiagnosis',
  hermes_remediation_reviewed: 'operationCases.event.hermesRemediation',
  hermes_retrospective_completed: 'operationCases.event.hermesReview',
  hermes_session_completed: 'operationCases.event.hermesSession',
  hermes_session_failed: 'operationCases.event.hermesFailed',
  hermes_downstream_refs_detected: 'operationCases.event.hermesRefsDetected',
  evolution_proposal_created: 'operationCases.event.proposalCreated',
  evolution_proposal_status_changed: 'operationCases.event.proposalStatus',
};

function createCorrelationId() {
  return `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseRuntimeConfig(value: Agent['runtime_config']): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return readString(current);
}

function findStringField(value: unknown, fieldName: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, fieldName);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record[fieldName] === 'string') return record[fieldName] as string;
  for (const item of Object.values(record)) {
    const found = findStringField(item, fieldName);
    if (found) return found;
  }
  return undefined;
}

function parseTraceSummary(content?: string): TraceSummary | null {
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      success: typeof parsed.success === 'boolean' ? parsed.success : undefined,
      decisionStatus: readNestedString(parsed, ['decision', 'status']),
      approvalId: readString(parsed.approvalId) || readNestedString(parsed, ['data', 'approval', 'id']),
      taskId: findStringField(parsed, 'taskId'),
      correlationId: readString(parsed.correlationId),
      toolCallId: readString(parsed.toolCallId),
      error: readString(parsed.error),
    };
  } catch {
    return null;
  }
}

function shortId(value?: string | null) {
  if (!value) return '';
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatDateTime(value?: string | null, locale = 'zh-CN') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US');
}

function readCaseEventString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readFirstString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const text = readCaseEventString(item);
    if (text) return text;
  }
  return null;
}

function extractCaseEventRef(event: OperationCaseEvent, type: 'approval' | 'task' | 'proposal'): string | null {
  const directKeys = type === 'approval'
    ? ['approvalId', 'approval_id', 'id']
    : type === 'task'
      ? ['taskId', 'task_id', 'id']
      : ['proposalId', 'proposal_id', 'id'];
  for (const key of directKeys) {
    const value = readCaseEventString(event.payload?.[key]);
    if (value) return value;
  }

  const extractedRefs = event.payload?.extractedRefs;
  if (extractedRefs && typeof extractedRefs === 'object' && !Array.isArray(extractedRefs)) {
    const key = type === 'approval' ? 'approvalIds' : type === 'task' ? 'taskIds' : 'proposalIds';
    const ref = readFirstString((extractedRefs as Record<string, unknown>)[key]);
    if (ref) return ref;
  }

  if (event.event_type.includes(type) || (type === 'task' && event.event_type.includes('workflow'))) {
    return readCaseEventString(event.source_id);
  }
  return null;
}

function formatTraceContent(content?: string) {
  if (!content) return '';
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function collectTraceLinks(trace: TraceEvent[], correlationId?: string) {
  const approvalIds = new Set<string>();
  const taskIds = new Set<string>();
  const correlationIds = new Set<string>();
  if (correlationId) correlationIds.add(correlationId);

  trace.forEach((event) => {
    const summary = parseTraceSummary(event.content);
    const metadataCorrelationId = typeof event.metadata?.correlationId === 'string' ? event.metadata.correlationId : undefined;
    if (summary?.approvalId) approvalIds.add(summary.approvalId);
    if (summary?.taskId) taskIds.add(summary.taskId);
    if (summary?.correlationId) correlationIds.add(summary.correlationId);
    if (metadataCorrelationId) correlationIds.add(metadataCorrelationId);
  });

  return {
    approvalIds: Array.from(approvalIds),
    taskIds: Array.from(taskIds),
    correlationIds: Array.from(correlationIds),
  };
}

function detectKubernetesContext(result: AgentRunResponse | null, contextLines: string[]) {
  if (!result) {
    return { matched: false, signals: [] };
  }

  const traceText = (result.trace || result.metadata?.trace || [])
    .map((event) => [event.type, event.content, JSON.stringify(event.metadata || {})].filter(Boolean).join(' '))
    .join(' ');
  const sourceText = [
    result.output,
    result.hermesSession?.input,
    result.hermesSession?.output,
    JSON.stringify(result.hermesSession?.selected_context || {}),
    traceText,
    contextLines.join('\n')
  ].join('\n').toLowerCase();

  const detectors = [
    { label: 'Kubernetes', patterns: ['kubernetes', 'k8s'] },
    { label: 'Cluster', patterns: ['cluster', '集群'] },
    { label: 'Node', patterns: ['node', '节点'] },
    { label: 'Namespace', patterns: ['namespace', '命名空间'] },
    { label: 'Pod', patterns: ['pod'] },
    { label: 'Workload', patterns: ['deployment', 'statefulset', 'daemonset', 'workload', '工作负载'] },
    { label: 'Service', patterns: ['service', 'svc', '服务'] },
    { label: 'Ingress', patterns: ['ingress'] },
    { label: 'Helm', patterns: ['helm'] },
  ];

  const signals = detectors
    .filter((detector) => detector.patterns.some((pattern) => sourceText.includes(pattern)))
    .map((detector) => detector.label);
  const strongSignals = new Set(['Kubernetes', 'Namespace', 'Pod', 'Workload', 'Ingress', 'Helm']);

  return {
    matched: signals.some((signal) => strongSignals.has(signal)),
    signals: signals.slice(0, 6),
  };
}

function resultFromSession(session: HermesSession): AgentRunResponse {
  const correlationId = session.correlation_id || session.extracted_refs?.correlationIds?.[0];
  return {
    executionId: session.agent_execution_id || session.id,
    sessionId: session.id,
    hermesSession: session,
    output: session.output || '',
    status: session.status,
    executionTime: 0,
    metadata: {
      correlationId: correlationId || undefined,
      runtime: 'hermes',
      trace: session.trace || [],
    },
    trace: session.trace || [],
  };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractTaskIdFromApproval(approval: ToolApprovalItem) {
  return findStringField(approval.input, 'taskId') || findStringField(approval.execution_result, 'taskId');
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    node_results: parseJsonValue(task.node_results),
    logs: parseJsonValue(task.logs),
    execution_order: parseJsonValue(task.execution_order),
  };
}

function getTaskProgress(task: TaskItem) {
  const nodeResults = task.node_results && typeof task.node_results === 'object' && !Array.isArray(task.node_results)
    ? task.node_results as Record<string, unknown>
    : {};
  const executionOrder = Array.isArray(task.execution_order)
    ? task.execution_order.filter((item): item is string => typeof item === 'string')
    : [];
  const total = executionOrder.length || Object.keys(nodeResults).length;
  const completed = Object.values(nodeResults).filter((result) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
    const status = (result as Record<string, unknown>).status;
    return status === 'success' || status === 'completed';
  }).length;
  const failedNode = Object.entries(nodeResults).find(([, result]) => {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
    const record = result as Record<string, unknown>;
    return record.status === 'failed' || Boolean(record.error);
  })?.[0];

  return {
    completed,
    total,
    failedNode,
  };
}

function getTaskLogSummary(task: TaskItem) {
  const logs = Array.isArray(task.logs) ? task.logs : [];
  return logs
    .slice(-3)
    .map((log) => {
      if (!log || typeof log !== 'object' || Array.isArray(log)) return String(log);
      const record = log as Record<string, unknown>;
      return String(record.content || record.message || record.type || '');
    })
    .filter(Boolean);
}

function readCount(counts: Record<string, unknown> | undefined, key: string) {
  const value = counts?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())));
}

function summarizeCorrelationEvidence(chains: CorrelationChain[]) {
  const evidence = chains.flatMap((chain) => chain.executionEvidence || []);
  const summaries = chains.map((chain) => chain.executionEvidenceSummary).filter((summary): summary is CorrelationEvidenceSummary => Boolean(summary));
  const counts = summaries.reduce((acc, summary) => ({
    evidence: acc.evidence + readCount(summary.counts, 'evidence'),
    agentExecutions: acc.agentExecutions + readCount(summary.counts, 'agentExecutions'),
    hermesSessions: acc.hermesSessions + readCount(summary.counts, 'hermesSessions'),
    approvals: acc.approvals + readCount(summary.counts, 'approvals'),
    tasks: acc.tasks + readCount(summary.counts, 'tasks'),
    teamRuns: acc.teamRuns + readCount(summary.counts, 'teamRuns'),
    workerRuns: acc.workerRuns + readCount(summary.counts, 'workerRuns'),
    auditLogs: acc.auditLogs + readCount(summary.counts, 'auditLogs'),
  }), {
    evidence: 0,
    agentExecutions: 0,
    hermesSessions: 0,
    approvals: 0,
    tasks: 0,
    teamRuns: 0,
    workerRuns: 0,
    auditLogs: 0,
  });
  const recentEvidence = evidence
    .slice()
    .sort((left, right) => String(right.generatedAt || right.createdAt || '').localeCompare(String(left.generatedAt || left.createdAt || '')))
    .slice(0, 4);

  return {
    counts: {
      ...counts,
      evidence: counts.evidence || evidence.length,
      agentExecutions: counts.agentExecutions || chains.reduce((total, chain) => total + (chain.agentExecutions?.length || 0), 0),
      approvals: counts.approvals || chains.reduce((total, chain) => total + (chain.approvals?.length || 0), 0),
      tasks: counts.tasks || chains.reduce((total, chain) => total + (chain.tasks?.length || 0), 0),
      teamRuns: counts.teamRuns || chains.reduce((total, chain) => total + (chain.teamRuns?.length || 0), 0),
      workerRuns: counts.workerRuns || chains.reduce((total, chain) => total + (chain.workerRuns?.length || 0), 0),
    },
    riskLevels: uniqueStrings(summaries.flatMap((summary) => summary.riskLevels || [])),
    toolCalls: uniqueStrings(summaries.flatMap((summary) => summary.toolCalls || [])),
    traceIds: uniqueStrings(summaries.flatMap((summary) => summary.traceIds || [])),
    releaseOverlayVersionIds: uniqueStrings(summaries.flatMap((summary) => summary.releaseOverlayVersionIds || [])),
    latestEvidenceAt: summaries.map((summary) => summary.latestEvidenceAt).filter(Boolean).sort().pop() || null,
    recentEvidence,
  };
}

function buildContextLines(options: {
  servers: ServerItem[];
  kubernetesCluster?: KubernetesClusterItem;
  alert?: AlertItem;
  workflow?: WorkflowItem;
  knowledgeCategory?: string;
}, labels: {
  targetServers: string;
  kubernetesCluster: string;
  relatedAlert: string;
  alertContent: string;
  candidateWorkflow: string;
  workflowDescription: string;
  knowledgeCategory: string;
}) {
  const lines: string[] = [];

  if (options.servers.length > 0) {
    lines.push(`${labels.targetServers}: ${options.servers.map((server) => `${server.name}(${server.hostname}:${server.port})`).join(', ')}`);
  }

  if (options.kubernetesCluster) {
    const cluster = options.kubernetesCluster;
    const details = [
      cluster.environment,
      cluster.status,
      typeof cluster.node_count === 'number' ? `nodes=${cluster.node_count}` : undefined,
      typeof cluster.bound_server_count === 'number' ? `boundHosts=${cluster.bound_server_count}` : undefined,
    ].filter(Boolean).join(', ');
    lines.push(`${labels.kubernetesCluster}: ${cluster.name}${details ? ` (${details})` : ''}`);
  }

  if (options.alert) {
    lines.push(`${labels.relatedAlert}: [${options.alert.severity}/${options.alert.status}] ${options.alert.title} (${options.alert.source})`);
    if (options.alert.content) {
      lines.push(`${labels.alertContent}: ${options.alert.content}`);
    }
  }

  if (options.workflow) {
    lines.push(`${labels.candidateWorkflow}: ${options.workflow.name} (${options.workflow.id})`);
    if (options.workflow.description) {
      lines.push(`${labels.workflowDescription}: ${options.workflow.description}`);
    }
  }

  if (options.knowledgeCategory) {
    lines.push(`${labels.knowledgeCategory}: ${options.knowledgeCategory}`);
  }

  return lines;
}

function buildPromptWithContext(input: string, contextLines: string[], labels: {
  selectedContext: string;
  operatorRequest: string;
}) {
  if (contextLines.length === 0) return input;
  return `${labels.selectedContext}:\n${contextLines.map((line) => `- ${line}`).join('\n')}\n\n${labels.operatorRequest}:\n${input}`;
}

export default function HermesAssistant() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const [activeMode, setActiveMode] = useState<HermesMode>('diagnose');
  const [input, setInput] = useState('');
  const [activePromptKey, setActivePromptKey] = useState<MessageKey | null>(HERMES_MODES[0].promptKeys[0]);
  const [lastResult, setLastResult] = useState<AgentRunResponse | null>(null);
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [selectedKubernetesClusterId, setSelectedKubernetesClusterId] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedKnowledgeCategory, setSelectedKnowledgeCategory] = useState('');
  const [approvalActionId, setApprovalActionId] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [verificationResults, setVerificationResults] = useState<Record<string, VerificationResult>>({});
  const [verifyingTaskId, setVerifyingTaskId] = useState('');
  const [urlCorrelationId, setUrlCorrelationId] = useState('');
  const [urlCaseId, setUrlCaseId] = useState('');
  const [hasAppliedUrlContext, setHasAppliedUrlContext] = useState(false);

  const { data: agents, isLoading, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return res.data.data as Agent[];
    },
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as ServerItem[];
    },
  });

  const { data: kubernetesClusters = [] } = useQuery({
    queryKey: ['hermes-context', 'kubernetes-clusters'],
    queryFn: async () => {
      const res = await api.get('/api/kubernetes-clusters');
      return (res.data.data || []) as KubernetesClusterItem[];
    },
    staleTime: 60000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['alerts', 'hermes-context'],
    queryFn: async () => {
      const res = await api.get('/api/alerts', { params: { limit: 30 } });
      return res.data.data as AlertItem[];
    },
  });

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return res.data.data as WorkflowItem[];
    },
  });

  const { data: knowledgeItems } = useQuery({
    queryKey: ['knowledge', 'hermes-context'],
    queryFn: async () => {
      const res = await api.get('/api/knowledge');
      return res.data.data as KnowledgeItem[];
    },
  });

  const { data: hermesSessions, isFetching: isFetchingSessions } = useQuery({
    queryKey: ['hermes-sessions', activeMode],
    queryFn: async () => {
      const res = await api.get('/api/hermes-sessions', { params: { mode: activeMode, limit: 8 } });
      return (res.data.data?.sessions || []) as HermesSession[];
    },
  });

  const { data: hermesChannels } = useQuery({
    queryKey: ['hermes-channels'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels');
      return res.data.data as HermesChannel[];
    },
  });

  const mode = HERMES_MODES.find((item) => item.id === activeMode) || HERMES_MODES[0];
  const currentRole = user?.role || 'viewer';
  const canSubmitRemediation = currentRole === 'admin' || currentRole === 'operator';
  const canHandleApprovals = currentRole === 'admin';
  const canUseActiveMode = activeMode !== 'remediate' || canSubmitRemediation;

  useEffect(() => {
    if (activePromptKey) {
      setInput(t(activePromptKey));
    }
  }, [activePromptKey, t]);

  useEffect(() => {
    if (hasAppliedUrlContext || !searchParams.toString()) return;

    const modeParam = searchParams.get('mode');
    if (modeParam === 'diagnose' || modeParam === 'remediate' || modeParam === 'review') {
      setActiveMode(modeParam);
    }

    const serverIdsParam = searchParams.get('serverIds') || searchParams.get('serverId') || '';
    const serverIds = serverIdsParam.split(',').map((item) => item.trim()).filter(Boolean);
    if (serverIds.length > 0) {
      setSelectedServerIds(Array.from(new Set(serverIds)));
    }

    const knowledgeCategory = searchParams.get('knowledgeCategory');
    const assetType = searchParams.get('assetType') || '';
    const assetId = searchParams.get('assetId') || '';
    const k8sClusterId = searchParams.get('k8sClusterId') || '';
    if (k8sClusterId || assetType === 'kubernetes_cluster' || assetType === 'kubernetes') {
      setSelectedKubernetesClusterId(k8sClusterId || assetId);
      if (!knowledgeCategory) {
        setSelectedKnowledgeCategory('kubernetes');
      }
    }

    const alertId = searchParams.get('alertId');
    if (alertId) {
      setSelectedAlertId(alertId);
    }

    const workflowId = searchParams.get('workflowId');
    if (workflowId) {
      setSelectedWorkflowId(workflowId);
    }

    if (knowledgeCategory) {
      setSelectedKnowledgeCategory(knowledgeCategory);
    }

    const correlationId = searchParams.get('correlationId');
    if (correlationId && /^[a-zA-Z0-9._:-]{8,128}$/.test(correlationId)) {
      setUrlCorrelationId(correlationId);
    }

    const caseId = searchParams.get('caseId');
    if (caseId) {
      setUrlCaseId(caseId);
    }

    const prompt = searchParams.get('prompt');
    if (prompt) {
      setActivePromptKey(null);
      setInput(prompt);
    }

    setHasAppliedUrlContext(true);
    setSearchParams({}, { replace: true });
  }, [hasAppliedUrlContext, searchParams, setSearchParams]);

  const {
    data: activeCaseDetail,
    isFetching: isFetchingActiveCase,
    refetch: refetchActiveCase,
  } = useQuery({
    queryKey: ['hermes-operation-case', urlCaseId],
    enabled: Boolean(urlCaseId),
    queryFn: async () => {
      const res = await api.get(`/api/operation-cases/${encodeURIComponent(urlCaseId)}`);
      return res.data.data as OperationCaseDetail;
    },
    refetchInterval: 20000,
  });

  const selectedAgent = useMemo(() => {
    return (agents || []).find((agent) => agent.name === mode.agentName) || null;
  }, [agents, mode.agentName]);

  const selectedChannel = useMemo(() => {
    if (!selectedAgent?.channel_id) return null;
    return (hermesChannels || []).find((channel) => channel.id === selectedAgent.channel_id) || null;
  }, [hermesChannels, selectedAgent?.channel_id]);

  const runtimeConfig = parseRuntimeConfig(selectedAgent?.runtime_config);
  const allowedTools = selectedChannel
    ? selectedChannel.tools.filter((tool) => tool.enabled === 1).map((tool) => tool.tool_name)
    : Array.isArray(runtimeConfig.allowedTools)
      ? runtimeConfig.allowedTools.filter((tool): tool is string => typeof tool === 'string')
      : [];
  const safetyModeKey: MessageKey = currentRole === 'viewer' || activeMode === 'diagnose' || activeMode === 'review' || selectedAgent?.autonomy_level === 'read_only'
    ? 'hermes.safety.mode.readOnly'
    : selectedAgent?.autonomy_level === 'auto'
      ? 'hermes.safety.mode.auto'
      : 'hermes.safety.mode.approval';
  const safetyStatementKey: MessageKey = currentRole === 'viewer'
    ? 'hermes.safety.statement.viewer'
    : activeMode === 'remediate'
      ? 'hermes.safety.statement.approval'
      : 'hermes.safety.statement.readOnly';
  const trace = lastResult?.trace || lastResult?.metadata?.trace || [];
  const traceLinks = collectTraceLinks(trace, lastResult?.metadata?.correlationId);
  const { data: correlationChains, isFetching: isFetchingCorrelations, refetch: refetchCorrelations } = useQuery({
    queryKey: ['hermes-correlation-chains', lastResult?.executionId, traceLinks.correlationIds],
    enabled: Boolean(lastResult && traceLinks.correlationIds.length > 0),
    queryFn: async () => {
      const results = await Promise.all(traceLinks.correlationIds.map(async (correlationId) => {
        const res = await api.get(`/api/correlations/${encodeURIComponent(correlationId)}`);
        return res.data.data as CorrelationChain;
      }));
      return results;
    },
  });
  const chainApprovals = useMemo(() => uniqueById(
    (correlationChains || []).flatMap((chain) => chain.approvals || [])
  ), [correlationChains]);
  const chainTasks = useMemo(() => uniqueById(
    (correlationChains || []).flatMap((chain) => chain.tasks || []).map(normalizeTask)
  ), [correlationChains]);
  const chainHermesSessions = useMemo(() => uniqueById([
    ...(lastResult?.hermesSession ? [lastResult.hermesSession] : []),
    ...(correlationChains || []).flatMap((chain) => chain.hermesSessions || []),
  ]), [correlationChains, lastResult?.hermesSession]);
  const correlationEvidence = useMemo(() => summarizeCorrelationEvidence(correlationChains || []), [correlationChains]);
  const aggregatedApprovalIds = useMemo(() => {
    return Array.from(new Set([
      ...traceLinks.approvalIds,
      ...chainApprovals.map((approval) => approval.id),
    ]));
  }, [traceLinks.approvalIds, chainApprovals]);
  const { data: fetchedApprovals, isFetching: isFetchingApprovals, refetch: refetchApprovals } = useQuery({
    queryKey: ['hermes-approvals', lastResult?.executionId, aggregatedApprovalIds],
    enabled: Boolean(lastResult && aggregatedApprovalIds.length > 0),
    queryFn: async () => {
      const results = await Promise.all(aggregatedApprovalIds.map(async (approvalId) => {
        try {
          const res = await api.get(`/api/tool-approvals/${encodeURIComponent(approvalId)}`);
          return res.data.data as ToolApprovalItem;
        } catch {
          return null;
        }
      }));
      return results.filter((item): item is ToolApprovalItem => Boolean(item));
    },
  });
  const aggregatedApprovals = useMemo(() => uniqueById([
    ...(fetchedApprovals || []),
    ...chainApprovals,
  ]), [fetchedApprovals, chainApprovals]);
  const aggregatedTaskIds = useMemo(() => {
    return Array.from(new Set([
      ...traceLinks.taskIds,
      ...chainTasks.map((task) => task.id),
      ...aggregatedApprovals.map(extractTaskIdFromApproval).filter((taskId): taskId is string => Boolean(taskId)),
    ]));
  }, [traceLinks.taskIds, chainTasks, aggregatedApprovals]);
  const { data: fetchedTasks, isFetching: isFetchingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['hermes-tasks', lastResult?.executionId, aggregatedTaskIds],
    enabled: Boolean(lastResult && aggregatedTaskIds.length > 0),
    queryFn: async () => {
      const results = await Promise.all(aggregatedTaskIds.map(async (taskId) => {
        try {
          const res = await api.get(`/api/tasks/${encodeURIComponent(taskId)}`);
          return normalizeTask(res.data.data as TaskItem);
        } catch {
          return null;
        }
      }));
      return results.filter((item): item is TaskItem => Boolean(item));
    },
  });
  const aggregatedTasks = useMemo(() => uniqueById([
    ...(fetchedTasks || []),
    ...chainTasks,
  ]), [fetchedTasks, chainTasks]);
  const isFetchingClosure = isFetchingCorrelations || isFetchingApprovals || isFetchingTasks;
  const hasClosureContext = Boolean(lastResult && (
    traceLinks.correlationIds.length > 0 ||
    aggregatedApprovalIds.length > 0 ||
    aggregatedTaskIds.length > 0
  ));
  const enabledServers = useMemo(() => (servers || []).filter((server) => server.enabled === 1), [servers]);
  const templateWorkflows = useMemo(() => (workflows || []).filter((workflow) => workflow.is_template === 1), [workflows]);
  const knowledgeCategories = useMemo(() => {
    return Array.from(new Set((knowledgeItems || []).map((item) => item.category).filter((category): category is string => Boolean(category)))).sort();
  }, [knowledgeItems]);
  const selectedServers = useMemo(
    () => enabledServers.filter((server) => selectedServerIds.includes(server.id)),
    [enabledServers, selectedServerIds]
  );
  const enabledKubernetesClusters = useMemo(
    () => kubernetesClusters.filter((cluster) => cluster.enabled !== 0),
    [kubernetesClusters]
  );
  const selectedKubernetesCluster = useMemo(
    () => enabledKubernetesClusters.find((cluster) => cluster.id === selectedKubernetesClusterId),
    [enabledKubernetesClusters, selectedKubernetesClusterId]
  );
  const selectedAlert = useMemo(
    () => (alerts || []).find((alert) => alert.id === selectedAlertId),
    [alerts, selectedAlertId]
  );
  const selectedWorkflow = useMemo(
    () => (workflows || []).find((workflow) => workflow.id === selectedWorkflowId),
    [workflows, selectedWorkflowId]
  );
  const contextLabels = useMemo(() => ({
    targetServers: t('hermes.context.targetServers'),
    kubernetesCluster: t('hermes.context.kubernetesCluster'),
    relatedAlert: t('hermes.context.relatedAlert'),
    alertContent: t('hermes.context.alertContent'),
    candidateWorkflow: t('hermes.context.candidateWorkflow'),
    workflowDescription: t('hermes.context.workflowDescription'),
    knowledgeCategory: t('hermes.context.knowledgeCategoryPriority'),
    selectedContext: t('hermes.prompt.contextHeader'),
    operatorRequest: t('hermes.prompt.operatorRequest'),
  }), [t]);
  const contextLines = buildContextLines({
    servers: selectedServers,
    kubernetesCluster: selectedKubernetesCluster,
    alert: selectedAlert,
    workflow: selectedWorkflow,
    knowledgeCategory: selectedKnowledgeCategory || undefined,
  }, contextLabels);
  const kubernetesContext = useMemo(
    () => detectKubernetesContext(lastResult, contextLines),
    [lastResult, contextLines]
  );

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((current) => (
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId]
    ));
  };

  const clearContext = () => {
    setSelectedServerIds([]);
    setSelectedKubernetesClusterId('');
    setSelectedAlertId('');
    setSelectedWorkflowId('');
    setSelectedKnowledgeCategory('');
    setUrlCorrelationId('');
    setUrlCaseId('');
  };

  const restoreSession = (session: HermesSession) => {
    if (session.mode === 'diagnose' || session.mode === 'remediate' || session.mode === 'review') {
      setActiveMode(session.mode);
    }
    setInput(session.input);
    setActivePromptKey(null);
    setLastResult(resultFromSession(session));
    setActiveTraceIndex(null);
    setApprovalActionId('');
    setApprovalComment('');
    setVerificationResults({});
    setVerifyingTaskId('');
  };

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) {
        throw new Error(t('hermes.error.agentNotFound'));
      }
      if (!canUseActiveMode) {
        throw new Error(t('hermes.error.readOnlyRole'));
      }
      const correlationId = urlCorrelationId || createCorrelationId();
      const finalInput = buildPromptWithContext(input, contextLines, contextLabels);
      const payloadKubernetesContext = selectedKubernetesCluster ? {
        id: selectedKubernetesCluster.id,
        name: selectedKubernetesCluster.name,
        environment: selectedKubernetesCluster.environment || undefined,
        apiServer: selectedKubernetesCluster.api_server_url || undefined,
        status: selectedKubernetesCluster.status || undefined,
        distribution: selectedKubernetesCluster.distribution || undefined,
        version: selectedKubernetesCluster.version || undefined,
        nodeCount: selectedKubernetesCluster.node_count,
        boundServerCount: selectedKubernetesCluster.bound_server_count,
      } : undefined;
      const res = await api.post(`/api/agents/${selectedAgent.id}/test`, {
        input: finalInput,
        serverId: selectedServerIds[0],
        serverIds: selectedServerIds,
        context: {
          source: 'hermes_assistant',
          mode: activeMode,
          correlationId,
          operationCaseId: urlCaseId || undefined,
          serverIds: selectedServerIds,
          serverId: selectedServerIds[0],
          contextType: selectedKubernetesCluster ? 'kubernetes' : undefined,
          assetId: selectedKubernetesCluster?.id,
          assetType: selectedKubernetesCluster ? 'kubernetes_cluster' : undefined,
          assetName: selectedKubernetesCluster?.name,
          k8sClusterId: selectedKubernetesCluster?.id,
          kubernetesCluster: payloadKubernetesContext,
          alertId: selectedAlertId || undefined,
          alert: selectedAlert ? {
            id: selectedAlert.id,
            title: selectedAlert.title,
            severity: selectedAlert.severity,
            status: selectedAlert.status,
            source: selectedAlert.source,
          } : undefined,
          workflowId: selectedWorkflowId || undefined,
          workflow: selectedWorkflow ? {
            id: selectedWorkflow.id,
            name: selectedWorkflow.name,
            description: selectedWorkflow.description,
          } : undefined,
          knowledgeCategory: selectedKnowledgeCategory || undefined,
          selectedContext: contextLines,
        },
      });
      return res.data.data as AgentRunResponse;
    },
    onSuccess: (data) => {
      setLastResult(data);
      setActiveTraceIndex(null);
      setApprovalActionId('');
      setApprovalComment('');
      setVerificationResults({});
      setVerifyingTaskId('');
      queryClient.invalidateQueries({ queryKey: ['hermes-sessions'] });
      if (urlCaseId) {
        queryClient.invalidateQueries({ queryKey: ['hermes-operation-case', urlCaseId] });
      }
      toast.success(t('hermes.toast.completed'));
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermes.toast.failed'));
    },
  });

  const ModeIcon = mode.icon;
  const joinNames = (names: string[]) => names.join(locale === 'zh-CN' ? '、' : ', ');
  const getApprovalStatusLabel = (status: ToolApprovalItem['status']) => {
    const keys: Record<ToolApprovalItem['status'], MessageKey> = {
      pending: 'hermes.closure.status.pending',
      approved: 'hermes.closure.status.approved',
      executed: 'hermes.closure.status.executed',
      failed: 'hermes.closure.status.failed',
      rejected: 'hermes.closure.status.rejected',
    };
    return t(keys[status]);
  };
  const getTaskStatusLabel = (status: string) => {
    const keys: Record<string, MessageKey> = {
      pending: 'hermes.closure.taskStatus.pending',
      running: 'hermes.closure.taskStatus.running',
      completed: 'hermes.closure.taskStatus.completed',
      success: 'hermes.closure.taskStatus.completed',
      failed: 'hermes.closure.taskStatus.failed',
      paused: 'hermes.closure.taskStatus.paused',
      cancelled: 'hermes.closure.taskStatus.cancelled',
    };
    return keys[status] ? t(keys[status]) : status;
  };
  const getStatusClass = (status: string) => clsx(
    'px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap',
    status === 'pending' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    status === 'approved' && 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    (status === 'executed' || status === 'completed' || status === 'success') && 'bg-green-500/10 text-green-400 border-green-500/30',
    status === 'running' && 'bg-primary/10 text-primary border-primary/30',
    (status === 'failed' || status === 'cancelled') && 'bg-red-500/10 text-red-400 border-red-500/30',
    (status === 'rejected' || status === 'paused') && 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  );
  const refreshClosure = () => {
    refetchCorrelations();
    refetchApprovals();
    refetchTasks();
    refetchActiveCase();
  };
  const approveApprovalMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await api.post(`/api/tool-approvals/${approvalId}/approve`, { comment: approvalComment });
      return res.data.data as ToolApprovalItem;
    },
    onSuccess: () => {
      setApprovalActionId('');
      setApprovalComment('');
      toast.success(t('hermes.closure.approveSuccess'));
      refreshClosure();
    },
    onError: (error: unknown) => {
      refreshClosure();
      toast.error(error instanceof Error ? error.message : t('hermes.closure.approveFailed'));
    },
  });
  const rejectApprovalMutation = useMutation({
    mutationFn: async (approvalId: string) => {
      const res = await api.post(`/api/tool-approvals/${approvalId}/reject`, { comment: approvalComment });
      return res.data.data as ToolApprovalItem;
    },
    onSuccess: () => {
      setApprovalActionId('');
      setApprovalComment('');
      toast.success(t('hermes.closure.rejectSuccess'));
      refreshClosure();
    },
    onError: (error: unknown) => {
      refreshClosure();
      toast.error(error instanceof Error ? error.message : t('hermes.closure.rejectFailed'));
    },
  });
  const isApprovalActionPending = approveApprovalMutation.isPending || rejectApprovalMutation.isPending;
  const verifyTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      setVerifyingTaskId(taskId);
      try {
        const res = await api.post('/api/tools/verify_remediation/invoke', {
          input: { taskId, expectedStatus: 'completed' },
          correlationId: traceLinks.correlationIds[0],
        });
        return { taskId, result: res.data as VerificationResult };
      } catch (error: unknown) {
        const response = (error as { response?: { data?: VerificationResult } }).response;
        if (response?.data) {
          return { taskId, result: response.data };
        }
        throw error;
      }
    },
    onSuccess: ({ taskId, result }) => {
      setVerificationResults((current) => ({
        ...current,
        [taskId]: result,
      }));
      toast[result.success ? 'success' : 'error'](
        result.success ? t('hermes.closure.verifyPassed') : t('hermes.closure.verifyNotPassed')
      );
      refreshClosure();
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : t('hermes.closure.verifyFailed'));
    },
    onSettled: () => {
      setVerifyingTaskId('');
    },
  });

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{t('hermes.title')}</h1>
                <p className="text-text-secondary">{t('hermes.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/tool-approvals')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              {t('hermes.nav.approvals')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              {t('hermes.nav.tasks')}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('common.refresh')}
            </button>
          </div>
        </div>

        {urlCaseId && (
          <HermesCaseContextCard
            caseId={urlCaseId}
            detail={activeCaseDetail}
            loading={isFetchingActiveCase}
            locale={locale}
            t={t}
            onOpenCase={() => navigate(`/operation-cases?caseId=${encodeURIComponent(urlCaseId)}`)}
            onNavigate={(path) => navigate(path)}
            onRefresh={() => refetchActiveCase()}
            onReview={(correlationId) => {
              setActiveMode('review');
              setActivePromptKey(null);
              setInput(t('hermes.case.reviewInput', {
                caseId: shortId(urlCaseId),
                correlationId: correlationId || urlCorrelationId || '-',
              }));
            }}
          />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-4">
            {HERMES_MODES.map((item) => {
              const agent = (agents || []).find((candidate) => candidate.name === item.agentName);
              const Icon = item.icon;
              const active = item.id === activeMode;
              const disabledByRole = item.id === 'remediate' && !canSubmitRemediation;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabledByRole}
                  title={disabledByRole ? t('hermes.safety.viewerNoRemediate') : undefined}
                  onClick={() => {
                    if (disabledByRole) return;
                    setActiveMode(item.id);
                    setActivePromptKey(item.promptKeys[0]);
                    setLastResult(null);
                    setActiveTraceIndex(null);
                  }}
                  className={clsx(
                    'w-full text-left rounded-2xl border p-4 transition-all',
                    disabledByRole && 'opacity-55 cursor-not-allowed',
                    active
                      ? 'bg-primary/10 border-primary/40 shadow-lg shadow-black/10'
                      : 'bg-surface border-border hover:border-primary/30'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0', item.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-text-primary">{t(item.titleKey)}</h2>
                        {agent?.enabled === 1 ? (
                          <span className="w-2 h-2 rounded-full bg-status-success" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-status-failed" />
                        )}
                      </div>
                      <p className="text-xs text-text-secondary mt-1">{t(item.subtitleKey)}</p>
                      <p className="text-xs text-text-tertiary mt-2 truncate">{item.agentName}</p>
                      {disabledByRole && (
                        <p className="text-xs text-amber-300 mt-2">{t('hermes.safety.viewerNoRemediate')}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            <div className={clsx(panelClass, 'p-4')}>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-text-primary">{t('hermes.currentAgent')}</h3>
              </div>
              {isLoading ? (
                <div className="text-sm text-text-secondary">{t('common.loading')}</div>
              ) : selectedAgent ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{selectedAgent.name}</div>
                    <div className="text-xs text-text-secondary mt-1">{selectedAgent.role || selectedAgent.description || '-'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {selectedAgent.runtime || 'llm'}
                    </span>
                    {selectedAgent.autonomy_level && (
                      <span className="px-2 py-1 rounded-lg bg-background text-text-secondary border border-border">
                        {selectedAgent.autonomy_level}
                      </span>
                    )}
                    <span className={clsx(
                      'px-2 py-1 rounded-lg border',
                      selectedAgent.enabled === 1
                        ? 'bg-status-success/10 text-status-success border-status-success/20'
                        : 'bg-status-failed/10 text-status-failed border-status-failed/20'
                    )}>
                      {selectedAgent.enabled === 1 ? t('common.enabled') : t('common.disabled')}
                    </span>
                  </div>
                  {selectedChannel && (
                    <div className="rounded-xl bg-background border border-border p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-text-tertiary">{t('hermes.channel.current')}</span>
                        <span className="font-semibold text-text-primary">{selectedChannel.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-text-tertiary">{t('hermesChannels.model')}</div>
                          <div className="font-medium text-text-primary mt-0.5">{selectedChannel.model}</div>
                        </div>
                        <div>
                          <div className="text-text-tertiary">{t('common.status')}</div>
                          <div className="font-medium text-text-primary mt-0.5">{selectedChannel.health_status}</div>
                        </div>
                      </div>
                      <div className="text-text-secondary">
                        {t('hermes.channel.summary', { tools: allowedTools.length, secret: selectedChannel.api_key_ref })}
                      </div>
                    </div>
                  )}
                  {allowedTools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allowedTools.slice(0, 10).map((tool) => (
                        <span key={tool} className="px-2 py-1 text-[11px] rounded-md bg-background text-text-tertiary border border-border">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="rounded-xl bg-background border border-border p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-tertiary">{t('hermes.safety.currentMode')}</span>
                      <span className="font-semibold text-text-primary">{t(safetyModeKey)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-text-tertiary">{t('hermes.safety.currentRole')}</span>
                      <span className="font-semibold text-text-primary">{t(`role.${currentRole}` as MessageKey)}</span>
                    </div>
                    <div className="text-text-secondary">{t(safetyStatementKey)}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm text-status-warning">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{t('hermes.notFound', { agent: mode.agentName })}</span>
                </div>
              )}
            </div>

            <div className={clsx(panelClass, 'p-4')}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-text-primary">{t('hermes.sessions.title')}</h3>
                </div>
                {isFetchingSessions && <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin" />}
              </div>
              {!hermesSessions || hermesSessions.length === 0 ? (
                <div className="py-4 text-xs text-text-tertiary">{t('hermes.sessions.empty')}</div>
              ) : (
                <div className="space-y-2">
                  {hermesSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => restoreSession(session)}
                      className="w-full text-left rounded-lg bg-background border border-border p-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-text-primary truncate">
                          {session.agent_name || t('hermes.sessions.unknownAgent')}
                        </span>
                        <span className={getStatusClass(session.status)}>{session.status}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-text-tertiary">
                        {session.created_at ? new Date(session.created_at).toLocaleString() : '-'}
                      </div>
                      <div className="mt-2 text-xs text-text-secondary line-clamp-2">{session.output || session.input}</div>
                      {session.correlation_id && (
                        <div className="mt-2 text-[11px] text-primary">corr {shortId(session.correlation_id)}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className={clsx(panelClass, 'p-5')}>
              <div className="flex items-center gap-3 mb-4">
                <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center', mode.color)}>
                  <ModeIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{t(mode.titleKey)}</h2>
                  <p className="text-sm text-text-secondary">{t(mode.subtitleKey)}</p>
                </div>
              </div>

              <div className="mb-5 rounded-xl bg-background border border-border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{t('hermes.context.title')}</h3>
                    <p className="text-xs text-text-tertiary mt-1">{t('hermes.context.subtitle')}</p>
                  </div>
                  {(selectedServerIds.length > 0 || selectedKubernetesClusterId || selectedAlertId || selectedWorkflowId || selectedKnowledgeCategory) && (
                    <button
                      type="button"
                      onClick={clearContext}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-text-primary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t('hermes.context.clear')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ServerIcon className="w-4 h-4 text-text-tertiary" />
                      <label className="text-xs font-medium text-text-secondary">{t('hermes.context.targetServers')}</label>
                    </div>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                      {enabledServers.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-text-tertiary">{t('hermes.context.noServers')}</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {enabledServers.slice(0, 12).map((server) => {
                            const checked = selectedServerIds.includes(server.id);
                            return (
                              <button
                                key={server.id}
                                type="button"
                                onClick={() => toggleServer(server.id)}
                                className={clsx(
                                  'text-left rounded-lg border px-3 py-2 transition-colors min-w-0',
                                  checked
                                    ? 'bg-primary/10 border-primary/40 text-primary'
                                    : 'bg-background border-border text-text-secondary hover:text-text-primary hover:border-primary/30'
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium truncate">{server.name}</span>
                                  {checked && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                                </div>
                                <div className="text-[11px] text-text-tertiary truncate mt-0.5">{server.hostname}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Network className="w-4 h-4 text-text-tertiary" />
                        <label className="text-xs font-medium text-text-secondary">{t('hermes.context.kubernetesCluster')}</label>
                      </div>
                      <select
                        value={selectedKubernetesClusterId}
                        onChange={(event) => {
                          setSelectedKubernetesClusterId(event.target.value);
                          if (event.target.value && !selectedKnowledgeCategory) {
                            setSelectedKnowledgeCategory('kubernetes');
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-primary/60"
                      >
                        <option value="">{t('hermes.context.noKubernetesCluster')}</option>
                        {enabledKubernetesClusters.map((cluster) => (
                          <option key={cluster.id} value={cluster.id}>
                            {cluster.name} · {cluster.bound_server_count ?? 0}/{cluster.node_count ?? 0}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Bell className="w-4 h-4 text-text-tertiary" />
                        <label className="text-xs font-medium text-text-secondary">{t('hermes.context.relatedAlert')}</label>
                      </div>
                      <select
                        value={selectedAlertId}
                        onChange={(event) => setSelectedAlertId(event.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-primary/60"
                      >
                        <option value="">{t('hermes.context.noAlert')}</option>
                        {(alerts || []).slice(0, 30).map((alert) => (
                          <option key={alert.id} value={alert.id}>
                            [{alert.severity}] {alert.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <GitBranch className="w-4 h-4 text-text-tertiary" />
                        <label className="text-xs font-medium text-text-secondary">{t('hermes.context.candidateWorkflow')}</label>
                      </div>
                      <select
                        value={selectedWorkflowId}
                        onChange={(event) => setSelectedWorkflowId(event.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-primary/60"
                      >
                        <option value="">{t('hermes.context.noWorkflow')}</option>
                        {templateWorkflows.map((workflow) => (
                          <option key={workflow.id} value={workflow.id}>
                            {workflow.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <FileSearch className="w-4 h-4 text-text-tertiary" />
                        <label className="text-xs font-medium text-text-secondary">{t('hermes.context.knowledgeCategory')}</label>
                      </div>
                      <select
                        value={selectedKnowledgeCategory}
                        onChange={(event) => setSelectedKnowledgeCategory(event.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-text-primary focus:outline-none focus:border-primary/60"
                      >
                        <option value="">{t('hermes.context.noCategory')}</option>
                        {knowledgeCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {contextLines.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contextLines.map((line) => (
                      <span key={line} className="max-w-full px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs truncate">
                        {line}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {mode.promptKeys.map((promptKey) => (
                  <button
                    key={promptKey}
                    type="button"
                    onClick={() => {
                      setActivePromptKey(promptKey);
                      setInput(t(promptKey));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors"
                  >
                    {t(promptKey)}
                  </button>
                ))}
                {selectedServers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePromptKey(null);
                      setInput(t('hermes.quick.diagnoseInput', { servers: joinNames(selectedServers.map((server) => server.name)) }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/15 transition-colors"
                  >
                    {t('hermes.quick.diagnoseSelected')}
                  </button>
                )}
                {selectedKubernetesCluster && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePromptKey(null);
                      setInput(t('hermes.quick.diagnoseKubernetesInput', { cluster: selectedKubernetesCluster.name }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-500/15 transition-colors"
                  >
                    {t('hermes.quick.diagnoseKubernetes')}
                  </button>
                )}
                {selectedAlert && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePromptKey(null);
                      setInput(t('hermes.quick.alertInput', { alert: selectedAlert.title }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 hover:bg-amber-500/15 transition-colors"
                  >
                    {t('hermes.quick.analyzeAlert')}
                  </button>
                )}
                {selectedWorkflow && canSubmitRemediation && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePromptKey(null);
                      setInput(t('hermes.quick.workflowInput', { workflow: selectedWorkflow.name }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 hover:bg-emerald-500/15 transition-colors"
                  >
                    {t('hermes.quick.prepareWorkflow')}
                  </button>
                )}
                {traceLinks.correlationIds[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMode('review');
                      setActivePromptKey(null);
                      setInput(t('hermes.quick.reviewCorrelationInput', { correlationId: traceLinks.correlationIds[0] }));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 hover:bg-sky-500/15 transition-colors"
                  >
                    {t('hermes.quick.reviewCorrelation')}
                  </button>
                )}
              </div>

              <textarea
                value={input}
                onChange={(event) => {
                  setActivePromptKey(null);
                  setInput(event.target.value);
                }}
                rows={7}
                className={clsx(inputClass, 'resize-none')}
                placeholder={t('hermes.input.placeholder')}
              />

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2 text-xs text-text-tertiary">
                  <span className="px-2 py-1 rounded-lg bg-background border border-border">
                    {t('hermes.badge.correlation')}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-background border border-border">
                    {t('hermes.badge.trace')}
                  </span>
                  {!canUseActiveMode && (
                    <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      {t('hermes.safety.viewerNoRemediate')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => runMutation.mutate()}
                  disabled={!selectedAgent || selectedAgent.enabled !== 1 || !input.trim() || !canUseActiveMode || runMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {runMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {t('hermes.run')}
                </button>
              </div>
            </div>

            {lastResult && (
              <div className={clsx(panelClass, 'p-5')}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {lastResult.status === 'success' ? (
                        <CheckCircle2 className="w-5 h-5 text-status-success" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-status-failed" />
                      )}
                      <h2 className="text-lg font-semibold text-text-primary">{t('hermes.result.title')}</h2>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 rounded-lg bg-background border border-border text-text-secondary">
                        {lastResult.executionTime}ms
                      </span>
                      {lastResult.metadata?.runtime && (
                        <span className="px-2 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                          {lastResult.metadata.runtime}
                        </span>
                      )}
                      {lastResult.metadata?.correlationId && (
                        <span className="px-2 py-1 rounded-lg bg-background border border-border text-text-secondary">
                          corr {shortId(lastResult.metadata.correlationId)}
                        </span>
                      )}
                      {lastResult.sessionId && (
                        <span className="px-2 py-1 rounded-lg bg-background border border-border text-text-secondary">
                          session {shortId(lastResult.sessionId)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {traceLinks.approvalIds.map((approvalId) => (
                      <button
                        key={approvalId}
                        type="button"
                        onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-xs"
                      >
                        {t('hermes.link.approval', { id: shortId(approvalId) })}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ))}
                    {traceLinks.taskIds.map((taskId) => (
                      <button
                        key={taskId}
                        type="button"
                        onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(taskId)}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 text-xs"
                      >
                        {t('hermes.link.task', { id: shortId(taskId) })}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>

                {kubernetesContext.matched && (
                  <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Boxes className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-text-primary">{t('hermes.kubernetes.title')}</h3>
                          <p className="text-xs text-text-secondary mt-1">{t('hermes.kubernetes.subtitle')}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {kubernetesContext.signals.map((signal) => (
                              <span key={signal} className="px-2 py-1 rounded-lg bg-background border border-border text-[11px] text-text-secondary">
                                {signal}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(selectedKubernetesCluster
                            ? `/kubernetes-console?cluster=${encodeURIComponent(selectedKubernetesCluster.name)}`
                            : '/kubernetes-console'
                          )}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 text-xs"
                        >
                          {t('hermes.kubernetes.openConsole')}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/kubernetes-clusters')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background text-text-secondary border border-border hover:text-text-primary text-xs"
                        >
                          {t('hermes.kubernetes.openClusters')}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/topology')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background text-text-secondary border border-border hover:text-text-primary text-xs"
                        >
                          {t('hermes.kubernetes.openTopology')}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-background border border-border p-4">
                  <MarkdownOutput content={lastResult.output || t('hermes.result.empty')} />
                </div>
              </div>
            )}

            {hasClosureContext && (
              <div className={clsx(panelClass, 'p-5')}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Activity className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">{t('hermes.closure.title')}</h2>
                      <p className="text-sm text-text-secondary">{t('hermes.closure.subtitle')}</p>
                      {traceLinks.correlationIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {traceLinks.correlationIds.map((correlationId) => (
                            <span
                              key={correlationId}
                              className="px-2 py-1 rounded-lg bg-background border border-border text-xs text-text-secondary"
                            >
                              corr {shortId(correlationId)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshClosure}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <RefreshCw className={clsx('w-4 h-4', isFetchingClosure && 'animate-spin')} />
                    {t('hermes.closure.refresh')}
                  </button>
                </div>

                {(correlationEvidence.counts.evidence > 0 || correlationEvidence.counts.agentExecutions > 0 || correlationEvidence.counts.teamRuns > 0 || correlationEvidence.counts.workerRuns > 0) && (
                  <div className="mb-4 rounded-xl bg-background border border-border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileSearch className="w-4 h-4 text-primary" />
                        <div>
                          <h3 className="text-sm font-semibold text-text-primary">{t('hermes.closure.evidenceTitle')}</h3>
                          <p className="text-xs text-text-tertiary mt-0.5">{t('hermes.closure.evidenceSubtitle')}</p>
                        </div>
                      </div>
                      {correlationEvidence.latestEvidenceAt && (
                        <span className="text-xs text-text-tertiary">
                          {t('hermes.closure.latestEvidence')}: {new Date(correlationEvidence.latestEvidenceAt).toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 mb-3">
                      {[
                        { label: t('hermes.closure.evidenceItems'), value: correlationEvidence.counts.evidence },
                        { label: t('hermes.closure.agentExecutions'), value: correlationEvidence.counts.agentExecutions },
                        { label: t('hermes.closure.workflowTasks'), value: correlationEvidence.counts.tasks },
                        { label: t('hermes.closure.teamRuns'), value: correlationEvidence.counts.teamRuns },
                        { label: t('hermes.closure.workerRuns'), value: correlationEvidence.counts.workerRuns },
                        { label: t('hermes.closure.auditLogs'), value: correlationEvidence.counts.auditLogs },
                      ].map((item) => (
                        <div key={item.label} className="rounded-lg bg-surface border border-border px-3 py-2 min-w-0">
                          <div className="text-lg font-semibold text-text-primary">{item.value}</div>
                          <div className="text-[11px] text-text-tertiary truncate">{item.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      {correlationEvidence.riskLevels.map((risk) => (
                        <span key={risk} className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs">
                          {t('hermes.closure.riskLevel')}: {risk}
                        </span>
                      ))}
                      {correlationEvidence.toolCalls.slice(0, 6).map((tool) => (
                        <span key={tool} className="px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs">
                          {tool}
                        </span>
                      ))}
                      {correlationEvidence.releaseOverlayVersionIds.slice(0, 4).map((versionId) => (
                        <span key={versionId} className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">
                          {t('hermes.closure.releaseOverlays')}: {shortId(versionId)}
                        </span>
                      ))}
                    </div>

                    {correlationEvidence.recentEvidence.length === 0 ? (
                      <div className="py-4 text-center text-sm text-text-tertiary">{t('hermes.closure.noEvidence')}</div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {correlationEvidence.recentEvidence.map((item) => {
                          const title = item.agentName || item.taskName || item.sourceType || '-';
                          const source = [item.sourceType, item.nodeId || item.sourceId].filter(Boolean).join(' / ');
                          return (
                            <div key={`${item.sourceType || 'evidence'}-${item.sourceId || item.traceId || item.generatedAt}`} className="rounded-lg bg-surface border border-border p-3 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-text-primary truncate">{title}</span>
                                {item.riskLevel && <span className="text-[11px] text-amber-300 flex-shrink-0">{item.riskLevel}</span>}
                              </div>
                              <div className="mt-1 text-[11px] text-text-tertiary truncate">{source}</div>
                              {item.hypothesis && (
                                <div className="mt-2 text-xs text-text-secondary line-clamp-2">{item.hypothesis}</div>
                              )}
                              {item.traceId && (
                                <div className="mt-2 text-[11px] text-text-tertiary">trace {shortId(item.traceId)}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {chainHermesSessions.length > 0 && (
                  <div className="mb-4 rounded-xl bg-background border border-border p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold text-text-primary">{t('hermes.sessions.chainTitle')}</h3>
                      </div>
                      <span className="text-xs text-text-tertiary">{chainHermesSessions.length}</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {chainHermesSessions.slice(0, 4).map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => restoreSession(session)}
                          className="text-left rounded-lg bg-surface border border-border p-3 hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-text-primary truncate">{session.agent_name || '-'}</span>
                            <span className="text-[11px] text-text-tertiary">{session.mode || '-'}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-text-tertiary">
                            {session.created_at ? new Date(session.created_at).toLocaleString() : '-'}
                          </div>
                          <div className="mt-2 text-xs text-text-secondary line-clamp-1">{session.output || session.input}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-background border border-border p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-semibold text-text-primary">{t('hermes.closure.approvals')}</h3>
                      </div>
                      <span className="text-xs text-text-tertiary">{aggregatedApprovals.length}</span>
                    </div>
                    {isFetchingClosure && aggregatedApprovals.length === 0 ? (
                      <div className="py-8 text-center text-sm text-text-secondary">{t('common.loading')}</div>
                    ) : aggregatedApprovals.length === 0 ? (
                      <div className="py-8 text-center text-sm text-text-tertiary">{t('hermes.closure.noApprovals')}</div>
                    ) : (
                      <div className="space-y-3">
                        {aggregatedApprovals.map((approval) => (
                          <div key={approval.id} className="rounded-lg bg-surface border border-border p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-text-primary truncate">{approval.tool_name}</div>
                                <div className="text-xs text-text-tertiary mt-1">
                                  {new Date(approval.requested_at).toLocaleString()} · {approval.source || 'api'}
                                </div>
                              </div>
                              <span className={getStatusClass(approval.status)}>{getApprovalStatusLabel(approval.status)}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div>
                                <div className="text-text-tertiary">{t('hermes.closure.riskLevel')}</div>
                                <div className="text-text-secondary break-words">{approval.risk_level || '-'}</div>
                              </div>
                              <div>
                                <div className="text-text-tertiary">{t('hermes.closure.correlation')}</div>
                                <div className="text-text-secondary break-all">{approval.correlation_id ? shortId(approval.correlation_id) : '-'}</div>
                              </div>
                            </div>
                            {approval.reason && (
                              <div className="mt-3 text-xs text-text-secondary line-clamp-2">{approval.reason}</div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(approval.id)}`)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 text-xs"
                              >
                                {t('hermes.closure.viewApproval')}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              {extractTaskIdFromApproval(approval) && (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(extractTaskIdFromApproval(approval)!)}`)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 text-xs"
                                >
                                  {t('hermes.closure.viewTask')}
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                              {approval.status === 'pending' && canHandleApprovals && approvalActionId !== approval.id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setApprovalActionId(approval.id);
                                    setApprovalComment('');
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-xs"
                                >
                                  {t('hermes.closure.handleApproval')}
                                </button>
                              )}
                              {approval.status === 'pending' && !canHandleApprovals && (
                                <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-text-tertiary">
                                  {t('hermes.closure.adminApprovalOnly')}
                                </span>
                              )}
                            </div>
                            {approval.status === 'pending' && canHandleApprovals && approvalActionId === approval.id && (
                              <div className="mt-3 pt-3 border-t border-border space-y-3">
                                <textarea
                                  value={approvalComment}
                                  onChange={(event) => setApprovalComment(event.target.value)}
                                  placeholder={t('hermes.closure.commentPlaceholder')}
                                  className="w-full min-h-20 px-3 py-2 rounded-lg bg-background border border-border text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 resize-none"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setApprovalActionId('');
                                      setApprovalComment('');
                                    }}
                                    disabled={isApprovalActionPending}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-background text-text-secondary border border-border hover:text-text-primary disabled:opacity-50 text-xs"
                                  >
                                    {t('common.cancel')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rejectApprovalMutation.mutate(approval.id)}
                                    disabled={isApprovalActionPending}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 text-xs"
                                  >
                                    {rejectApprovalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                    {t('hermes.closure.reject')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => approveApprovalMutation.mutate(approval.id)}
                                    disabled={isApprovalActionPending}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 disabled:opacity-50 text-xs"
                                  >
                                    {approveApprovalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {t('hermes.closure.approveAndRun')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-background border border-border p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-green-400" />
                        <h3 className="text-sm font-semibold text-text-primary">{t('hermes.closure.tasks')}</h3>
                      </div>
                      <span className="text-xs text-text-tertiary">{aggregatedTasks.length}</span>
                    </div>
                    {isFetchingClosure && aggregatedTasks.length === 0 ? (
                      <div className="py-8 text-center text-sm text-text-secondary">{t('common.loading')}</div>
                    ) : aggregatedTasks.length === 0 ? (
                      <div className="py-8 text-center text-sm text-text-tertiary">{t('hermes.closure.noTasks')}</div>
                    ) : (
                      <div className="space-y-3">
                        {aggregatedTasks.map((task) => {
                          const progress = getTaskProgress(task);
                          const logSummary = getTaskLogSummary(task);
                          const verification = verificationResults[task.id];
                          const verified = verification?.data?.verified === true;
                          const verifying = verifyingTaskId === task.id && verifyTaskMutation.isPending;
                          return (
                            <div key={task.id} className="rounded-lg bg-surface border border-border p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium text-text-primary truncate">{task.name || task.id}</div>
                                  <div className="text-xs text-text-tertiary mt-1">{new Date(task.created_at).toLocaleString()}</div>
                                </div>
                                <span className={getStatusClass(task.status)}>{getTaskStatusLabel(task.status)}</span>
                              </div>
                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div>
                                  <div className="text-text-tertiary">{t('hermes.closure.progress')}</div>
                                  <div className="text-text-secondary">
                                    {progress.total > 0 ? `${progress.completed}/${progress.total}` : '-'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-text-tertiary">{t('hermes.closure.failedNode')}</div>
                                  <div className="text-text-secondary break-words">{progress.failedNode || '-'}</div>
                                </div>
                              </div>
                              {logSummary.length > 0 && (
                                <div className="mt-3 rounded-lg bg-background border border-border p-2">
                                  <div className="text-xs text-text-tertiary mb-1">{t('hermes.closure.logSummary')}</div>
                                  <div className="space-y-1">
                                    {logSummary.map((line, index) => (
                                      <div key={`${task.id}-log-${index}`} className="text-xs text-text-secondary line-clamp-1">
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {verification && (
                                <div className={clsx(
                                  'mt-3 rounded-lg border p-3',
                                  verified
                                    ? 'bg-green-500/10 border-green-500/20'
                                    : 'bg-red-500/10 border-red-500/20'
                                )}>
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-xs font-semibold text-text-primary">{t('hermes.closure.verificationResult')}</div>
                                    <span className={clsx(
                                      'px-2 py-0.5 rounded-md text-xs font-semibold border',
                                      verified
                                        ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                                    )}>
                                      {verified ? t('hermes.closure.verified') : t('hermes.closure.notVerified')}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <div className="text-text-tertiary">{t('hermes.closure.expectedStatus')}</div>
                                      <div className="text-text-secondary">{verification.data?.expectedStatus || '-'}</div>
                                    </div>
                                    <div>
                                      <div className="text-text-tertiary">{t('hermes.closure.actualStatus')}</div>
                                      <div className="text-text-secondary">{verification.data?.actualStatus || '-'}</div>
                                    </div>
                                  </div>
                                  {verification.data?.message && (
                                    <div className="mt-2 text-xs text-text-secondary">{verification.data.message}</div>
                                  )}
                                  {verification.data?.failedNodes && verification.data.failedNodes.length > 0 && (
                                    <div className="mt-2">
                                      <div className="text-xs text-text-tertiary mb-1">{t('hermes.closure.failedNodes')}</div>
                                      <div className="space-y-1">
                                        {verification.data.failedNodes.map((node, index) => (
                                          <div key={`${task.id}-verify-failed-${index}`} className="text-xs text-red-300">
                                            {node.nodeId || '-'}: {node.error || '-'}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {verification.error && (
                                    <div className="mt-2 text-xs text-red-300">{verification.error}</div>
                                  )}
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => verifyTaskMutation.mutate(task.id)}
                                  disabled={verifying}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 disabled:opacity-50 text-xs"
                                >
                                  {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                  {verifying ? t('hermes.closure.verifying') : t('hermes.closure.verify')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(task.id)}`)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20 text-xs"
                                >
                                  {t('hermes.closure.viewTask')}
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {trace.length > 0 && (
              <div className={clsx(panelClass, 'p-5')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">{t('hermes.trace.title')}</h2>
                  </div>
                  <span className="text-xs text-text-tertiary">{t('hermes.trace.count', { count: trace.length })}</span>
                </div>

                <div className="space-y-3">
                  {trace.map((event, index) => {
                    const summary = parseTraceSummary(event.content);
                    const toolName = typeof event.metadata?.tool === 'string' ? event.metadata.tool : null;
                    const toolCalls = Array.isArray(event.metadata?.toolCalls)
                      ? event.metadata.toolCalls.filter((item): item is string => typeof item === 'string')
                      : [];
                    const metadataCorrelationId = typeof event.metadata?.correlationId === 'string'
                      ? event.metadata.correlationId
                      : undefined;
                    const isToolEvent = event.type?.startsWith('tool_call');
                    const open = activeTraceIndex === index;

                    return (
                      <div key={`${event.type || 'trace'}-${index}`} className="rounded-xl bg-background border border-border p-4">
                        <button
                          type="button"
                          onClick={() => setActiveTraceIndex(open ? null : index)}
                          className="w-full flex items-start justify-between gap-3 text-left"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={clsx(
                              'w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0',
                              isToolEvent
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-primary/10 text-primary border-primary/20'
                            )}>
                              {isToolEvent ? <Wrench className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-text-primary">{event.type || 'trace'}</span>
                                {summary?.decisionStatus && (
                                  <span className="px-2 py-0.5 rounded-md bg-surface text-xs text-text-secondary border border-border">
                                    {summary.decisionStatus}
                                  </span>
                                )}
                                {summary?.success !== undefined && (
                                  <span className={clsx(
                                    'px-2 py-0.5 rounded-md text-xs border',
                                    summary.success
                                      ? 'bg-status-success/10 text-status-success border-status-success/20'
                                      : 'bg-status-failed/10 text-status-failed border-status-failed/20'
                                  )}>
                                    {summary.success ? 'success' : 'failed'}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-text-tertiary">
                                {event.timestamp ? new Date(event.timestamp).toLocaleString() : '-'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-primary text-right">
                            <span>{toolName || toolCalls.join(', ')}</span>
                            <ArrowRight className={clsx('w-4 h-4 transition-transform', open && 'rotate-90')} />
                          </div>
                        </button>

                        {Boolean(summary?.approvalId || summary?.taskId || summary?.correlationId || metadataCorrelationId) && (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {summary?.approvalId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(summary.approvalId!)}`)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
                              >
                                {t('hermes.link.approvalLower', { id: shortId(summary.approvalId) })}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            {summary?.taskId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(summary.taskId!)}`)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20"
                              >
                                {t('hermes.link.taskLower', { id: shortId(summary.taskId) })}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            {(summary?.correlationId || metadataCorrelationId) && (
                              <span className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                                corr {shortId(summary?.correlationId || metadataCorrelationId)}
                              </span>
                            )}
                          </div>
                        )}

                        {open && (
                          <pre className="mt-3 text-xs text-text-secondary whitespace-pre-wrap overflow-x-auto bg-surface rounded-lg border border-border p-3">
                            {formatTraceContent(event.content)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HermesCaseContextCard({
  caseId,
  detail,
  loading,
  locale,
  t,
  onOpenCase,
  onNavigate,
  onRefresh,
  onReview,
}: {
  caseId: string;
  detail?: OperationCaseDetail;
  loading: boolean;
  locale: string;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenCase: () => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onReview: (correlationId?: string | null) => void;
}) {
  const operationCase = detail?.case;
  const events = detail?.events || [];
  const trace = detail?.trace;
  const statusKey = operationCase ? CASE_STATUS_LABEL_KEYS[operationCase.status] : null;
  const recentEvents = events.slice(0, 5);
  const correlationId = operationCase?.correlation_id || detail?.trace?.correlationId || null;
  const proposalCount = Number(trace?.executionEvidenceSummary?.counts?.proposals || 0);
  const counts = [
    { label: t('operationCases.metric.approvals'), value: trace?.approvals?.length || 0, icon: ShieldCheck },
    { label: t('operationCases.metric.tasks'), value: trace?.tasks?.length || 0, icon: GitBranch },
    { label: t('operationCases.metric.proposals'), value: Number.isFinite(proposalCount) ? proposalCount : 0, icon: Sparkles },
    { label: t('operationCases.metric.evidence'), value: trace?.executionEvidence?.length || 0, icon: Activity },
  ];

  return (
    <section className={clsx(panelClass, 'p-4 border-primary/20')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-primary">
              <ClipboardList className="w-3.5 h-3.5" />
              {t('hermes.case.active')}
            </span>
            <span className="rounded-lg border border-border bg-background px-2 py-1">
              case {shortId(caseId)}
            </span>
            {correlationId && (
              <span className="rounded-lg border border-border bg-background px-2 py-1">
                corr {shortId(correlationId)}
              </span>
            )}
            {statusKey && (
              <span className={clsx('rounded-lg border px-2 py-1 font-semibold', getCaseStatusClass(operationCase!.status))}>
                {t(statusKey)}
              </span>
            )}
          </div>
          <h2 className="mt-3 text-lg font-semibold text-text-primary break-words">
            {operationCase?.title || (loading ? t('common.loading') : t('hermes.case.notLoaded'))}
          </h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
            <span>{t('operationCases.field.asset')}: {operationCase?.asset_name || operationCase?.asset_id || '-'}</span>
            <span>{t('operationCases.field.alert')}: {operationCase?.alert_id || '-'}</span>
            <span>{t('hermes.case.updatedAt')}: {formatDateTime(operationCase?.updated_at || operationCase?.created_at, locale)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenCase}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            {t('hermes.case.openCase')}
          </button>
          <button
            type="button"
            onClick={() => onReview(correlationId)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
          >
            <History className="w-4 h-4" />
            {t('hermes.case.review')}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counts.map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-background/50 p-3">
            <item.icon className="w-4 h-4 text-primary" />
            <div className="mt-2 text-lg font-semibold text-text-primary">{item.value}</div>
            <div className="text-xs text-text-secondary">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-background/40">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Clock className="w-4 h-4 text-primary" />
            {t('hermes.case.timeline')}
          </div>
          <span className="text-xs text-text-secondary">{t('operationCases.timeline.count', { count: events.length })}</span>
        </div>
        <div className="divide-y divide-border">
          {recentEvents.length === 0 && (
            <div className="px-3 py-3 text-sm text-text-secondary">
              {loading ? t('common.loading') : t('operationCases.timeline.empty')}
            </div>
          )}
          {recentEvents.map((event) => {
            const labelKey = CASE_EVENT_LABEL_KEYS[event.event_type] || 'operationCases.event.unknown';
            const approvalId = extractCaseEventRef(event, 'approval');
            const taskId = extractCaseEventRef(event, 'task');
            const proposalId = event.event_type.includes('evolution') ? extractCaseEventRef(event, 'proposal') : null;
            return (
              <div key={event.id} className="px-3 py-2 flex items-start gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">{t(labelKey)}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-tertiary">
                    <span>{formatDateTime(event.created_at, locale)}</span>
                    {event.source_type && <span>{event.source_type}</span>}
                    {event.source_id && <span>{shortId(event.source_id)}</span>}
                  </div>
                  {(approvalId || taskId || proposalId) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {approvalId && (
                        <CaseEventJumpButton
                          label={`approval ${shortId(approvalId)}`}
                          onClick={() => onNavigate(`/tool-approvals?approvalId=${encodeURIComponent(approvalId)}`)}
                        />
                      )}
                      {taskId && (
                        <CaseEventJumpButton
                          label={`task ${shortId(taskId)}`}
                          onClick={() => onNavigate(`/tasks?taskId=${encodeURIComponent(taskId)}`)}
                        />
                      )}
                      {proposalId && (
                        <CaseEventJumpButton
                          label={`proposal ${shortId(proposalId)}`}
                          onClick={() => onNavigate(`/evolution-proposals?proposalId=${encodeURIComponent(proposalId)}`)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CaseEventJumpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover"
    >
      {label}
      <ArrowRight className="w-3 h-3" />
    </button>
  );
}

function getCaseStatusClass(status: OperationCaseStatus) {
  return clsx(
    status === 'closed' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    status === 'approval_pending' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    (status === 'executing' || status === 'verifying') && 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    status === 'evolving' && 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    status === 'cancelled' && 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    !['closed', 'approval_pending', 'executing', 'verifying', 'evolving', 'cancelled'].includes(status) && 'bg-primary/10 text-primary border-primary/30'
  );
}
