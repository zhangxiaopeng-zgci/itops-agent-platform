import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  GitBranch,
  Loader2,
  MessageSquare,
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

interface CorrelationChain {
  correlationId: string;
  hermesSessions?: HermesSession[];
  approvals?: ToolApprovalItem[];
  tasks?: TaskItem[];
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

function shortId(value?: string) {
  if (!value) return '';
  return value.length <= 12 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
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

function buildContextLines(options: {
  servers: ServerItem[];
  alert?: AlertItem;
  workflow?: WorkflowItem;
  knowledgeCategory?: string;
}, labels: {
  targetServers: string;
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const { locale, t } = useLocale();
  const [activeMode, setActiveMode] = useState<HermesMode>('diagnose');
  const [input, setInput] = useState('');
  const [activePromptKey, setActivePromptKey] = useState<MessageKey | null>(HERMES_MODES[0].promptKeys[0]);
  const [lastResult, setLastResult] = useState<AgentRunResponse | null>(null);
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [selectedKnowledgeCategory, setSelectedKnowledgeCategory] = useState('');
  const [approvalActionId, setApprovalActionId] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [verificationResults, setVerificationResults] = useState<Record<string, VerificationResult>>({});
  const [verifyingTaskId, setVerifyingTaskId] = useState('');

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

  const mode = HERMES_MODES.find((item) => item.id === activeMode) || HERMES_MODES[0];

  useEffect(() => {
    if (activePromptKey) {
      setInput(t(activePromptKey));
    }
  }, [activePromptKey, t]);

  const selectedAgent = useMemo(() => {
    return (agents || []).find((agent) => agent.name === mode.agentName) || null;
  }, [agents, mode.agentName]);

  const runtimeConfig = parseRuntimeConfig(selectedAgent?.runtime_config);
  const allowedTools = Array.isArray(runtimeConfig.allowedTools)
    ? runtimeConfig.allowedTools.filter((tool): tool is string => typeof tool === 'string')
    : [];
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
    alert: selectedAlert,
    workflow: selectedWorkflow,
    knowledgeCategory: selectedKnowledgeCategory || undefined,
  }, contextLabels);

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((current) => (
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId]
    ));
  };

  const clearContext = () => {
    setSelectedServerIds([]);
    setSelectedAlertId('');
    setSelectedWorkflowId('');
    setSelectedKnowledgeCategory('');
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
      const correlationId = createCorrelationId();
      const finalInput = buildPromptWithContext(input, contextLines, contextLabels);
      const res = await api.post(`/api/agents/${selectedAgent.id}/test`, {
        input: finalInput,
        serverId: selectedServerIds[0],
        serverIds: selectedServerIds,
        context: {
          source: 'hermes_assistant',
          mode: activeMode,
          correlationId,
          serverIds: selectedServerIds,
          serverId: selectedServerIds[0],
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

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-4">
            {HERMES_MODES.map((item) => {
              const agent = (agents || []).find((candidate) => candidate.name === item.agentName);
              const Icon = item.icon;
              const active = item.id === activeMode;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveMode(item.id);
                    setActivePromptKey(item.promptKeys[0]);
                    setLastResult(null);
                    setActiveTraceIndex(null);
                  }}
                  className={clsx(
                    'w-full text-left rounded-2xl border p-4 transition-all',
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
                  {allowedTools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {allowedTools.slice(0, 10).map((tool) => (
                        <span key={tool} className="px-2 py-1 text-[11px] rounded-md bg-background text-text-tertiary border border-border">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
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
                  {(selectedServerIds.length > 0 || selectedAlertId || selectedWorkflowId || selectedKnowledgeCategory) && (
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
                {selectedWorkflow && (
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
                </div>
                <button
                  type="button"
                  onClick={() => runMutation.mutate()}
                  disabled={!selectedAgent || selectedAgent.enabled !== 1 || !input.trim() || runMutation.isPending}
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
                              {approval.status === 'pending' && approvalActionId !== approval.id && (
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
                            </div>
                            {approval.status === 'pending' && approvalActionId === approval.id && (
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
