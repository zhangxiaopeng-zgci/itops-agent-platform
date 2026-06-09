import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
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
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import MarkdownOutput from '../components/MarkdownOutput';
import { useToast } from '../contexts/ToastContext';

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

type HermesMode = 'diagnose' | 'remediate' | 'review';

const panelClass = 'bg-surface/95 backdrop-blur-xl rounded-2xl border border-border shadow-lg';
const inputClass = 'w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all';

const HERMES_MODES: Array<{
  id: HermesMode;
  title: string;
  subtitle: string;
  agentName: string;
  icon: typeof BrainCircuit;
  color: string;
  prompts: string[];
}> = [
  {
    id: 'diagnose',
    title: '诊断问题',
    subtitle: '只读证据、诊断结论、修复建议',
    agentName: 'Hermes 诊断修复 Agent',
    icon: FileSearch,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    prompts: [
      '诊断 k8s-node01 当前 CPU 告警，先收集证据，不要执行修复。',
      '分析最近的严重告警，判断是否需要提交修复审批。',
      '检查这批服务器是否存在资源瓶颈，并给出下一步建议。',
    ],
  },
  {
    id: 'remediate',
    title: '修复编排',
    subtitle: '方案确认、审批提交、任务追踪',
    agentName: 'Hermes 修复编排 Agent',
    icon: Wrench,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    prompts: [
      '根据已确认的故障原因，选择合适的工作流并提交审批。',
      '为 k8s-node01 的服务异常准备修复编排，列出风险、回滚和验证目标。',
      '查看可用修复工作流，给出一个需要审批的执行计划。',
    ],
  },
  {
    id: 'review',
    title: '复盘优化',
    subtitle: 'Trace、审批、任务、改进建议',
    agentName: 'Hermes 复盘进化 Agent',
    icon: ShieldCheck,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompts: [
      '复盘最近一次 Hermes 诊断和修复链路，找出可以优化的地方。',
      '查看最近失败或等待审批的工具调用，给出改进建议。',
      '根据最近任务和审批记录，提出工作流和知识库优化 proposal。',
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

export default function HermesAssistant() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeMode, setActiveMode] = useState<HermesMode>('diagnose');
  const [input, setInput] = useState(HERMES_MODES[0].prompts[0]);
  const [lastResult, setLastResult] = useState<AgentRunResponse | null>(null);
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);

  const { data: agents, isLoading, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return res.data.data as Agent[];
    },
  });

  const mode = HERMES_MODES.find((item) => item.id === activeMode) || HERMES_MODES[0];
  const selectedAgent = useMemo(() => {
    return (agents || []).find((agent) => agent.name === mode.agentName) || null;
  }, [agents, mode.agentName]);

  const runtimeConfig = parseRuntimeConfig(selectedAgent?.runtime_config);
  const allowedTools = Array.isArray(runtimeConfig.allowedTools)
    ? runtimeConfig.allowedTools.filter((tool): tool is string => typeof tool === 'string')
    : [];
  const trace = lastResult?.trace || lastResult?.metadata?.trace || [];
  const traceLinks = collectTraceLinks(trace, lastResult?.metadata?.correlationId);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) {
        throw new Error('未找到对应的 Hermes Agent');
      }
      const correlationId = createCorrelationId();
      const res = await api.post(`/api/agents/${selectedAgent.id}/test`, {
        input,
        context: {
          source: 'hermes_assistant',
          mode: activeMode,
          correlationId,
        },
      });
      return res.data.data as AgentRunResponse;
    },
    onSuccess: (data) => {
      setLastResult(data);
      setActiveTraceIndex(null);
      toast.success('Hermes 执行完成');
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Hermes 执行失败');
    },
  });

  const ModeIcon = mode.icon;

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
                <h1 className="text-2xl font-bold text-text-primary">Hermes 运维助手</h1>
                <p className="text-text-secondary">诊断、修复审批、复盘优化</p>
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
              工具审批
            </button>
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <GitBranch className="w-4 h-4" />
              任务执行
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
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
                    setInput(item.prompts[0]);
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
                        <h2 className="font-semibold text-text-primary">{item.title}</h2>
                        {agent?.enabled === 1 ? (
                          <span className="w-2 h-2 rounded-full bg-status-success" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-status-failed" />
                        )}
                      </div>
                      <p className="text-xs text-text-secondary mt-1">{item.subtitle}</p>
                      <p className="text-xs text-text-tertiary mt-2 truncate">{item.agentName}</p>
                    </div>
                  </div>
                </button>
              );
            })}

            <div className={clsx(panelClass, 'p-4')}>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-text-primary">当前 Agent</h3>
              </div>
              {isLoading ? (
                <div className="text-sm text-text-secondary">加载中...</div>
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
                      {selectedAgent.enabled === 1 ? '已启用' : '已停用'}
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
                  <span>未找到 {mode.agentName}</span>
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
                  <h2 className="text-lg font-semibold text-text-primary">{mode.title}</h2>
                  <p className="text-sm text-text-secondary">{mode.subtitle}</p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {mode.prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={7}
                className={clsx(inputClass, 'resize-none')}
                placeholder="输入要交给 Hermes 处理的问题..."
              />

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2 text-xs text-text-tertiary">
                  <span className="px-2 py-1 rounded-lg bg-background border border-border">
                    correlation 自动生成
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-background border border-border">
                    trace 自动保存
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
                  运行 Hermes
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
                      <h2 className="text-lg font-semibold text-text-primary">执行结果</h2>
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
                        审批 {shortId(approvalId)}
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
                        任务 {shortId(taskId)}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-background border border-border p-4">
                  <MarkdownOutput content={lastResult.output || '(无输出)'} />
                </div>
              </div>
            )}

            {trace.length > 0 && (
              <div className={clsx(panelClass, 'p-5')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">Trace 时间线</h2>
                  </div>
                  <span className="text-xs text-text-tertiary">{trace.length} 条</span>
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
                                approval {shortId(summary.approvalId)}
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            {summary?.taskId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(summary.taskId!)}`)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20"
                              >
                                task {shortId(summary.taskId)}
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
