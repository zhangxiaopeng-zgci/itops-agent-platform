import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Edit, Trash2, Play, Clock, Search, 
  ChevronLeft, BookOpen, Server, BrainCircuit, Cable, CheckCircle2, AlertTriangle, Wrench, MessageSquare, ExternalLink
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import MarkdownOutput from '../components/MarkdownOutput';
import { useLocale } from '../contexts/LocaleContext';

interface Agent {
  id: string;
  name: string;
  avatar: string;
  role: string;
  system_prompt: string;
  model: string;
  temperature: number;
  enabled: number;
  is_preset: number;
  category?: string;
  tags?: string[];
  description?: string;
  usage_count?: number;
  last_used_at?: string;
  primary_model_id?: string;
  fallback_model_id?: string;
  primary_model_name?: string;
  fallback_model_name?: string;
  runtime?: string;
  runtime_config?: string | Record<string, unknown> | null;
  autonomy_level?: string;
  tool_policy_id?: string;
}

interface AIModel {
  id: string;
  name: string;
  provider_type: string;
  model_id: string;
  enabled: number;
}

interface Server {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  enabled: number;
}

interface AgentExecution {
  id: string;
  agent_id: string;
  agent_name: string;
  input_text: string;
  output_text: string;
  status: string;
  error_message?: string;
  execution_time_ms: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface HermesRuntimeConfig {
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  maxToolRounds?: number;
  allowedTools?: string[];
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

const DEFAULT_HERMES_TOOLS = 'list_servers, query_alerts, search_knowledge_base, list_workflows, run_readonly_command, get_task_status, verify_remediation';
const panelClass = 'bg-surface/95 backdrop-blur-xl rounded-2xl border border-border shadow-lg';
const softPanelClass = 'bg-background/70 rounded-xl border border-border';
const inputClass = 'w-full px-4 py-2 bg-background border border-border rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all';
const textareaClass = `${inputClass} resize-none`;
const labelClass = 'block text-sm font-medium text-text-secondary mb-2';
const mutedTextClass = 'text-text-secondary';
const subtleTextClass = 'text-text-tertiary';

function parseRuntimeConfig(value: Agent['runtime_config']): HermesRuntimeConfig {
  if (!value) return {};
  if (typeof value === 'object') return value as HermesRuntimeConfig;
  try {
    return JSON.parse(value) as HermesRuntimeConfig;
  } catch {
    return {};
  }
}

function formatRuntime(runtime?: string): string {
  const labels: Record<string, string> = {
    builtin: 'Builtin',
    llm: 'LLM',
    custom_http: 'Custom HTTP',
    hermes: 'Hermes',
    openclaw: 'OpenClaw',
    mcp: 'MCP'
  };
  return labels[runtime || ''] || runtime || 'LLM';
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
      error: readString(parsed.error)
    };
  } catch {
    return null;
  }
}

function formatTraceContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

function findStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, key);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct = readString(record[key]);
  if (direct) return direct;

  for (const child of Object.values(record)) {
    const found = findStringField(child, key);
    if (found) return found;
  }
  return undefined;
}

function readNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return readString(current);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function shortTraceId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

export default function Agents() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useLocale();
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testResult, setTestResult] = useState<{output: string, time: number, metadata?: Record<string, unknown>} | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents', selectedCategory, searchQuery],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (selectedCategory) params.category = selectedCategory;
      if (searchQuery) params.search = searchQuery;
      const res = await api.get('/api/agents', { params });
      return res.data.data as Agent[];
    },
  });

  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as Server[];
    },
  });

  // Get unique categories from agents
  const categories = Array.from(new Set((agents || []).map(a => a.category).filter(Boolean) as string[]));

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/agents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async ({ agentId, input, serverIds }: { agentId: string, input: string, serverIds?: string[] }) => {
      const res = await api.post(`/api/agents/${agentId}/test`, { input, serverIds });
      return res.data.data;
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(t('agents.deleteConfirm', { name }))) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingAgent(null);
    setShowModal(true);
  };

  const handleTest = (agent: Agent) => {
    setEditingAgent(agent);
    setTestResult(null);
    setShowTestModal(true);
    
    // 默认选择所有服务器
    if (servers && servers.length > 0 && selectedServerIds.length === 0) {
      setSelectedServerIds(servers.filter((s) => s.enabled).map((s) => s.id));
    }
    
    // 根据 Agent 名字自动填入预设的测试输入
    const presetInputs: Record<string, string> = {
      '告警处理 Agent': '服务器CPU使用率异常，当前值92%，阈值80%，请分析并提供处理建议',
      '告警处理': '服务器CPU使用率异常，当前值92%，阈值80%，请分析并提供处理建议',
      '故障诊断 Agent': '应用服务响应超时，请诊断可能的原因并提供排查步骤',
      '故障诊断': '应用服务响应超时，请诊断可能的原因并提供排查步骤',
      '日志分析 Agent': '系统日志中有多个错误记录，请分析并找出问题根源',
      '日志分析': '系统日志中有多个错误记录，请分析并找出问题根源',
      '系统巡检 Agent': '请执行系统健康检查，检查CPU、内存、磁盘、网络状态',
      '系统巡检': '请执行系统健康检查，检查CPU、内存、磁盘、网络状态',
      '变更执行 Agent': '请执行Nginx服务重启操作',
      '变更执行': '请执行Nginx服务重启操作',
      '文档生成 Agent': '请生成今天的系统运维报告',
      '文档生成': '请生成今天的系统运维报告',
      '合规检查 Agent': '请执行安全合规检查，验证系统配置是否符合安全标准',
      '合规检查': '请执行安全合规检查，验证系统配置是否符合安全标准',
      '服务器命令执行 Agent': '请检查服务器磁盘使用情况',
      '服务器命令执行': '请检查服务器磁盘使用情况',
      '自动巡检 Agent': '请对所有服务器执行批量巡检',
      '自动巡检': '请对所有服务器执行批量巡检'
    };
    
    const defaultInput = presetInputs[agent.name] || '请描述您要处理的运维问题';
    setTestInput(defaultInput);
  };

  const runTest = () => {
    if (!editingAgent || !testInput) return;
    setIsTesting(true);
    testMutation.mutate(
      { 
        agentId: editingAgent.id, 
        input: testInput,
        serverIds: selectedServerIds.length > 0 ? selectedServerIds : undefined
      },
      {
        onSuccess: (data) => {
          setTestResult({ output: data.output, time: data.executionTime, metadata: data.metadata });
          queryClient.invalidateQueries({ queryKey: ['agents'] });
        },
        onSettled: () => setIsTesting(false),
      }
    );
  };

  const filteredAgents = agents || [];

  if (showDetail) {
    return (
      <AgentDetailInner 
        agentId={showDetail} 
        onBack={() => setShowDetail(null)} 
        deleteMutation={deleteMutation}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-6 scrollbar-thin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">{t('agents.title')}</h1>
            <p className="text-text-secondary">{t('agents.subtitle')}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-black/15 transition-all duration-300 font-semibold hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-5 h-5" />
              {t('agents.new')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className={`${panelClass} p-5 flex flex-wrap gap-4 items-center`}>
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('agents.searchPlaceholder')}
              className={`${inputClass} text-sm w-64`}
            />
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-text-secondary font-medium">{t('common.category')}:</span>
            <button
              onClick={() => setSelectedCategory(null)}
              className={clsx(
                "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                !selectedCategory
                  ? "bg-primary text-white shadow-lg shadow-black/15"
                  : "bg-background border border-border text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
              {t('common.all')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={clsx(
                "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                selectedCategory === cat
                    ? "bg-primary text-white shadow-lg shadow-black/15"
                    : "bg-background border border-border text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${panelClass} p-6 animate-pulse`}>
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-background" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-32 bg-background rounded" />
                    <div className="h-4 w-24 bg-background rounded" />
                  </div>
                </div>
                <div className="space-y-2 mb-5">
                  <div className="h-4 bg-background rounded" />
                  <div className="h-4 w-3/4 bg-background rounded" />
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="h-4 bg-background rounded" />
                  <div className="h-4 bg-background rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className={`group relative ${panelClass} p-6 hover:border-primary/50 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 transform hover:-translate-y-1`}
              >
                {/* Background glow effect */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -z-10 group-hover:opacity-100 opacity-50 transition-opacity" />
                
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowDetail(agent.id)}>
                    <div className="relative">
                      <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-primary/10 border border-primary/30 shadow-lg shadow-black/20 text-3xl">
                        {agent.avatar}
                      </div>
                      <div className="absolute -bottom-1 -right-1">
                        <div className={clsx(
                          "w-4 h-4 rounded-full border-2 border-surface",
                          agent.enabled ? "bg-gradient-to-r from-green-400 to-emerald-500 shadow-lg shadow-green-500/40" : "bg-[var(--color-text-tertiary)]"
                        )} />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary tracking-tight group-hover:text-primary transition-colors">{agent.name}</h3>
                      <p className="text-sm text-text-secondary mt-1">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {agent.is_preset === 1 && (
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/30 font-medium">
                        {t('common.preset')}
                      </span>
                    )}
                    {agent.category && (
                      <span className="px-3 py-1 bg-background text-text-secondary text-xs rounded-full border border-border">
                        {agent.category}
                      </span>
                    )}
                  </div>
                </div>

                {agent.description && (
                  <p className="text-sm text-text-secondary mb-4 line-clamp-2 leading-relaxed">
                    {agent.description}
                  </p>
                )}

                {/* Tags */}
                {agent.tags && agent.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {agent.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-background border border-border text-xs text-text-secondary rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                    {agent.tags.length > 3 && (
                      <span className="text-xs text-text-tertiary px-2 py-1">
                        +{agent.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-2 mb-5 pt-3 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-tertiary">{t('agents.primaryModel')}</span>
                    <span className="text-text-primary font-medium">{agent.primary_model_name || agent.model || '-'}</span>
                  </div>
                  {agent.fallback_model_name && (
                    <div className="flex justify-between text-sm">
                      <span className="text-text-tertiary">{t('agents.fallbackModel')}</span>
                      <span className="text-text-primary font-medium">{agent.fallback_model_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-text-tertiary">{t('common.runtime')}</span>
                    <span className={clsx(
                      "text-text-primary font-medium",
                      agent.runtime === 'hermes' && "text-primary"
                    )}>{formatRuntime(agent.runtime)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-tertiary">{t('agents.usageCount')}</span>
                    <span className="text-text-primary font-medium">{agent.usage_count || 0}</span>
                  </div>
                  {agent.last_used_at && (
                    <div className="flex justify-between text-sm">
                      <span className="text-text-tertiary">{t('agents.lastUsed')}</span>
                      <span className="text-text-secondary">
                        {new Date(agent.last_used_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                  <span
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-xs font-semibold',
                      agent.enabled
                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-green-500/30'
                        : 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30'
                    )}
                  >
                    {agent.enabled ? t('common.online') : t('common.offline')}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTest(agent)}
                      className="p-2.5 hover:bg-primary/10 text-primary rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                      title={t('common.test')}
                    >
                      <Play className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => setShowDetail(agent.id)}
                      className="p-2.5 hover:bg-background text-text-secondary hover:text-text-primary rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                      title={t('common.details')}
                    >
                      <BookOpen className="w-4.5 h-4.5" />
                    </button>
                    <button
                      onClick={() => handleEdit(agent)}
                      className="p-2.5 hover:bg-background text-text-secondary hover:text-text-primary rounded-xl transition-all hover:scale-105 active:scale-95"
                      title={t('common.edit')}
                    >
                      <Edit className="w-4.5 h-4.5" />
                    </button>
                    {agent.is_preset !== 1 && (
                      <button
                        onClick={() => handleDelete(agent.id, agent.name)}
                        className="p-2.5 hover:bg-red-500/20 text-red-400 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setShowModal(false)}
        />
      )}

      {showTestModal && editingAgent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${panelClass} w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]`}>
            {/* 头部 */}
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/30 text-2xl">
                  {editingAgent.avatar}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">{t('agents.testAgent', { name: editingAgent.name })}</h2>
                  <p className="text-sm text-text-secondary">{editingAgent.role}</p>
                </div>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="p-2 hover:bg-background rounded-xl text-text-secondary hover:text-text-primary transition-all"
              >
                ✕
              </button>
            </div>
            
            {/* 内容区域 - 可滚动 */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* 服务器选择 */}
              <div className="pt-3 border-t border-border">
                <label className={`${labelClass} flex items-center gap-2`}>
                  <Server className="w-4 h-4" />
                  {t('agents.selectServers')}
                </label>
                {servers && servers.length > 0 ? (
                  <div className="space-y-2">
                    {servers.filter((s) => s.enabled).map((server) => (
                      <label key={server.id} className="flex items-center gap-3 p-3 bg-background border border-border rounded-xl hover:bg-surface transition-all cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedServerIds.includes(server.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedServerIds([...selectedServerIds, server.id]);
                            } else {
                              setSelectedServerIds(selectedServerIds.filter((id) => id !== server.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-text-primary">{server.name}</div>
                          <div className="text-xs text-text-tertiary">{server.hostname}:{server.port}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">{t('agents.noServers')}</p>
                )}
                {selectedServerIds.length > 0 && servers && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    {t('agents.selectedServers', {
                      count: selectedServerIds.length,
                      servers: selectedServerIds.map((id) => servers.find((s) => s.id === id)?.name).join(', ')
                    })}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  {t('agents.inputContent')}
                </label>
                <textarea
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder={t('agents.inputPlaceholder')}
                  className={`${textareaClass} py-3 h-32`}
                />
              </div>

              <button
                onClick={runTest}
                disabled={!testInput || isTesting}
                className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-black/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 font-semibold"
              >
                {isTesting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    {t('agents.running')}
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    {t('agents.runTest')}
                  </>
                )}
              </button>

              {testResult && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-text-secondary">{t('agents.outputResult')}</span>
                    <span className="text-xs text-text-tertiary">
                      {t('agents.elapsed', { time: testResult.time })}
                    </span>
                  </div>
                  <div className="bg-background rounded-xl p-4 border border-border max-h-64 overflow-y-auto scrollbar-thin">
                    <MarkdownOutput content={testResult.output} />
                  </div>
                  {typeof testResult.metadata?.runtime === 'string' && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                      <BrainCircuit className="w-4 h-4 text-primary" />
                      {t('common.runtime')}: {formatRuntime(String(testResult.metadata.runtime))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 底部 - 固定 */}
            <div className="p-6 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="w-full px-6 py-3 bg-background text-text-secondary rounded-xl hover:bg-surface transition-all duration-300 font-semibold border border-border"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AgentDetailInnerProps {
  agentId: string;
  onBack: () => void;
  deleteMutation: { mutate: (id: string) => void };
}

function AgentDetailInner({ agentId, onBack, deleteMutation }: AgentDetailInnerProps) {
  const navigate = useNavigate();
  const { t } = useLocale();
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agents', agentId],
    queryFn: async () => {
      const res = await api.get(`/api/agents/${agentId}`);
      return res.data.data as Agent;
    },
  });

  const { data: executions, isLoading: executionsLoading } = useQuery({
    queryKey: ['agents', agentId, 'executions'],
    queryFn: async () => {
      const res = await api.get(`/api/agents/${agentId}/executions`, { params: { limit: 30 } });
      return res.data.data as { executions: AgentExecution[], pagination: { total: number; page: number; limit: number } };
    },
  });

  if (agentLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-surface rounded-xl transition-all"
            >
              <ChevronLeft className="w-5 h-5 text-text-secondary" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-primary/10 border border-primary/30 text-2xl shadow-lg shadow-black/10">
                {agent.avatar}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-3">
                  {agent.name}
                </h1>
                <p className="text-sm text-text-secondary">{agent.role}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${panelClass} p-6`}>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('common.category')}</span>
                <span className="text-text-primary">{agent.category || '-'}</span>
              </div>
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('agents.primaryModel')}</span>
                <span className="text-text-primary font-medium">{agent.primary_model_name || agent.model || '-'}</span>
              </div>
              {agent.fallback_model_name && (
                <div>
                  <span className="text-sm text-text-tertiary block mb-1">{t('agents.fallbackModel')}</span>
                  <span className="text-text-primary font-medium">{agent.fallback_model_name}</span>
                </div>
              )}
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('agents.temperature')}</span>
                <span className="text-text-primary">{agent.temperature}</span>
              </div>
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('common.runtime')}</span>
                <span className={clsx(
                  "inline-flex items-center gap-2 text-text-primary font-medium",
                  agent.runtime === 'hermes' && "text-primary"
                )}>
                  <BrainCircuit className="w-4 h-4" />
                  {formatRuntime(agent.runtime)}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('agents.usageCount')}</span>
                <span className="text-text-primary font-medium">{agent.usage_count || 0}</span>
              </div>
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('agents.lastUsed')}</span>
                <span className="text-text-secondary">
                  {agent.last_used_at ? new Date(agent.last_used_at).toLocaleString() : '-'}
                </span>
              </div>
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('common.status')}</span>
                <span className={clsx(
                  "px-3 py-1.5 rounded-full text-xs font-semibold",
                  agent.enabled
                    ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-green-500/30'
                    : 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30'
                )}>
                  {agent.enabled ? t('common.online') : t('common.offline')}
                </span>
              </div>
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('agents.autonomyLevel')}</span>
                <span className="text-text-primary">{agent.autonomy_level || 'suggest'}</span>
              </div>
            </div>
          </div>

          {agent.tags && agent.tags.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <span className="text-sm text-text-tertiary block mb-2">{t('common.tags')}</span>
              <div className="flex flex-wrap gap-1.5">
                {agent.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-background border border-border text-xs text-text-secondary rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {agent.system_prompt && (
            <div className="mt-6 pt-4 border-t border-border">
              <span className="text-sm text-text-tertiary block mb-2">{t('agents.systemPrompt')}</span>
              <div className="bg-background rounded-xl p-4 border border-border">
                <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono">
                  {agent.system_prompt}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className={`${panelClass} p-6`}>
          <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-text-secondary" />
            {t('agents.executionHistory')}
          </h2>
          
          {executionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (!executions || executions.executions.length === 0) ? (
            <div className="text-center py-12 text-text-secondary">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('agents.noExecutions')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {executions.executions.map((exec) => (
                <div key={exec.id} className="bg-background rounded-xl p-4 border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={clsx(
                        "px-3 py-1.5 rounded-full text-xs font-semibold",
                        exec.status === 'success' 
                          ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-green-500/30'
                          : 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30'
                      )}>
                        {exec.status === 'success' ? t('common.success') : t('common.failed')}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {new Date(exec.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {exec.execution_time_ms}ms
                    </span>
                  </div>
                  <div className="mb-3">
                    <span className="text-xs text-text-tertiary block mb-1">{t('common.input')}:</span>
                    <p className="text-sm text-text-secondary">{exec.input_text}</p>
                  </div>
                  <div>
                    <span className="text-xs text-text-tertiary block mb-1">{t('common.output')}:</span>
                    <pre className="text-sm text-text-secondary whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin">
                      {exec.output_text}
                    </pre>
                  </div>
                  {exec.error_message && (
                    <div className="mt-2">
                      <span className="text-xs text-amber-400 block mb-1">{t('common.error')}:</span>
                      <p className="text-sm text-red-400">{exec.error_message}</p>
                    </div>
                  )}
                  {exec.metadata && Object.keys(exec.metadata).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {typeof exec.metadata.runtime === 'string' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                            <BrainCircuit className="w-3.5 h-3.5" />
                            {formatRuntime(exec.metadata.runtime)}
                          </span>
                        )}
                        {Array.isArray(exec.metadata.trace) && (
                          <span className="px-2 py-1 rounded-lg bg-surface text-text-secondary border border-border">
                            Trace {exec.metadata.trace.length}
                          </span>
                        )}
                      </div>
	                      {Array.isArray(exec.metadata.trace) && exec.metadata.trace.length > 0 && (
	                        <div className="mt-3 space-y-2">
	                          {exec.metadata.trace.map((event, index) => {
	                            const traceEvent = event as { type?: string; content?: string; timestamp?: string; metadata?: Record<string, unknown> };
	                            const summary = parseTraceSummary(traceEvent.content);
	                            const toolName = typeof traceEvent.metadata?.tool === 'string' ? traceEvent.metadata.tool : null;
	                            const correlationId = summary?.correlationId || (typeof traceEvent.metadata?.correlationId === 'string' ? traceEvent.metadata.correlationId : undefined);
	                            const toolCallId = summary?.toolCallId || (typeof traceEvent.metadata?.toolCallId === 'string' ? traceEvent.metadata.toolCallId : undefined);
	                            const toolCalls = Array.isArray(traceEvent.metadata?.toolCalls) ? traceEvent.metadata.toolCalls as string[] : [];
	                            const isToolEvent = traceEvent.type?.startsWith('tool_call');
	                            return (
	                              <div key={`${exec.id}-trace-${index}`} className="rounded-lg bg-surface border border-border p-3">
	                                <div className="flex items-start justify-between gap-3 mb-2">
	                                  <div className="flex items-center gap-2 min-w-0">
	                                    <span className={clsx(
	                                      'inline-flex items-center justify-center w-6 h-6 rounded-md border',
	                                      isToolEvent
	                                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
	                                        : 'bg-primary/10 text-primary border-primary/20'
	                                    )}>
	                                      {isToolEvent ? <Wrench className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
	                                    </span>
	                                    <div className="min-w-0">
	                                      <div className="flex items-center gap-2">
	                                        <span className="text-xs font-semibold text-text-secondary">{traceEvent.type || 'trace'}</span>
	                                        {summary?.success !== undefined && (
	                                          <span className={clsx(
	                                            'text-[11px] px-1.5 py-0.5 rounded border',
	                                            summary.success
	                                              ? 'bg-green-500/10 text-green-300 border-green-500/20'
	                                              : 'bg-red-500/10 text-red-300 border-red-500/20'
	                                          )}>
	                                            {summary.success ? 'success' : 'failed'}
	                                          </span>
	                                        )}
	                                      </div>
	                                      {traceEvent.timestamp && (
	                                        <span className="text-[11px] text-text-tertiary">
	                                          {new Date(traceEvent.timestamp).toLocaleString()}
	                                        </span>
	                                      )}
	                                    </div>
	                                  </div>
	                                  {(toolName || toolCalls.length > 0) && (
	                                    <span className="text-xs text-primary text-right break-words max-w-[45%]">
	                                      {toolName || toolCalls.join(', ')}
	                                    </span>
	                                  )}
	                                </div>
	                                {summary && (
	                                  <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
	                                    {summary.decisionStatus && (
	                                      <span className="px-2 py-1 rounded bg-background text-text-secondary border border-border">
	                                        {summary.decisionStatus}
	                                      </span>
	                                    )}
	                                    {summary.approvalId && (
	                                      <button
	                                        type="button"
	                                        onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(summary.approvalId!)}`)}
	                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"
	                                      >
	                                        approval {shortTraceId(summary.approvalId)}
	                                        <ExternalLink className="w-3 h-3" />
	                                      </button>
	                                    )}
	                                    {summary.taskId && (
	                                      <button
	                                        type="button"
	                                        onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(summary.taskId!)}`)}
	                                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-300 border border-green-500/20 hover:bg-green-500/20"
	                                      >
	                                        task {shortTraceId(summary.taskId)}
	                                        <ExternalLink className="w-3 h-3" />
	                                      </button>
	                                    )}
	                                    {correlationId && (
	                                      <span className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
	                                        corr {shortTraceId(correlationId)}
	                                      </span>
	                                    )}
	                                    {toolCallId && (
	                                      <span className="px-2 py-1 rounded bg-background text-text-secondary border border-border">
	                                        call {shortTraceId(toolCallId)}
	                                      </span>
	                                    )}
	                                  </div>
	                                )}
	                                {summary?.error ? (
	                                  <p className="text-xs text-red-300 whitespace-pre-wrap">{summary.error}</p>
	                                ) : traceEvent.content ? (
	                                  <p className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-4">{formatTraceContent(traceEvent.content)}</p>
	                                ) : null}
	                              </div>
	                            );
	                          })}
	                        </div>
	                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={`${panelClass} p-6`}>
          <div className="flex gap-3">
            <button
              onClick={() => {
                onBack();
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-black/15 transition-all duration-300 font-semibold"
            >
              <Edit className="w-4 h-4" />
              {t('agents.editAgent')}
            </button>
            {agent.is_preset !== 1 && (
              <button
                onClick={() => {
                  if (confirm(t('agents.deleteConfirm', { name: agent.name }))) {
                    deleteMutation.mutate(agent.id);
                    onBack();
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30 rounded-xl hover:from-red-500/30 hover:to-rose-500/30 transition-all duration-300 font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                {t('agents.deleteAgent')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentModal({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useLocale();
  const initialRuntimeConfig = parseRuntimeConfig(agent?.runtime_config);
  const [tagsInput, setTagsInput] = useState(
    Array.isArray(agent?.tags) ? agent.tags.join(', ') : ''
  );
  const [showTestModal, setShowTestModal] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [hermesConfig, setHermesConfig] = useState({
    baseUrl: initialRuntimeConfig.baseUrl || '',
    model: initialRuntimeConfig.model || 'smart-router',
    apiKeyEnv: initialRuntimeConfig.apiKeyEnv || 'HERMES_API_KEY',
    timeoutMs: initialRuntimeConfig.timeoutMs || 300000,
    maxToolRounds: initialRuntimeConfig.maxToolRounds || 3,
    allowedTools: (initialRuntimeConfig.allowedTools || DEFAULT_HERMES_TOOLS.split(',').map(tool => tool.trim())).join(', ')
  });
  
  const { data: aiModels } = useQuery({
    queryKey: ['aiModels'],
    queryFn: async () => {
      const res = await api.get('/api/ai-models');
      return res.data.data as AIModel[];
    }
  });
  
  const [formData, setFormData] = useState({
    name: agent?.name || '',
    avatar: agent?.avatar || '🤖',
    role: agent?.role || '',
    system_prompt: agent?.system_prompt || '',
    model: agent?.model || 'doubao-4o',
    temperature: agent?.temperature || 0.7,
    enabled: agent?.enabled !== 0,
    category: agent?.category || '',
    description: agent?.description || '',
    primary_model_id: agent?.primary_model_id || '',
    fallback_model_id: agent?.fallback_model_id || '',
    runtime: agent?.runtime || 'llm',
    autonomy_level: agent?.autonomy_level || 'suggest',
    tool_policy_id: agent?.tool_policy_id || '',
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData & { tags?: string[], runtime_config?: HermesRuntimeConfig | null }) => {
      if (agent) {
        await api.put(`/api/agents/${agent.id}`, data);
      } else {
        await api.post('/api/agents', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    mutation.mutate({ ...formData, tags, runtime_config: buildRuntimeConfig() });
  };

  const buildRuntimeConfig = (): HermesRuntimeConfig | null => {
    if (formData.runtime !== 'hermes') {
      return null;
    }

    return {
      baseUrl: hermesConfig.baseUrl.trim() || undefined,
      model: hermesConfig.model.trim() || 'smart-router',
      apiKeyEnv: hermesConfig.apiKeyEnv.trim() || 'HERMES_API_KEY',
      timeoutMs: hermesConfig.timeoutMs,
      maxToolRounds: hermesConfig.maxToolRounds,
      allowedTools: hermesConfig.allowedTools.split(',').map(tool => tool.trim()).filter(Boolean)
    };
  };

  const testHermesConnection = async () => {
    setConnectionLoading(true);
    setConnectionResult(null);
    try {
      const res = await api.post('/api/agents/runtime/hermes/test-connection', {
        runtime_config: buildRuntimeConfig()
      });
      const data = res.data.data;
      setConnectionResult({
        success: true,
        message: `连接成功 · ${data.model} · ${data.latencyMs}ms`
      });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; data?: { error?: string } } }; message?: string };
      setConnectionResult({
        success: false,
        message: err.response?.data?.data?.error || err.response?.data?.error || err.message || '连接测试失败'
      });
    } finally {
      setConnectionLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testInput.trim()) return;
    
    setTestLoading(true);
    setTestResult(null);
    
    try {
      const testAgent = {
        ...formData,
        runtime_config: buildRuntimeConfig(),
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        id: agent?.id || 'test'
      };
      
      const res = await api.post(`/api/agents/${testAgent.id}/test`, {
        input: testInput
      });
      
      setTestResult(res.data.data.output || '测试完成，无返回结果');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setTestResult(`测试失败: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`${panelClass} p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl`}>
        <h2 className="text-xl font-bold text-text-primary mb-6">
          {agent ? t('agents.modalTitleEdit') : t('agents.modalTitleNew')}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                {t('agents.name')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('agents.avatar')}
              </label>
              <input
                type="text"
                value={formData.avatar}
                onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                className={inputClass}
                placeholder={t('agents.avatarPlaceholder')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                {t('agents.role')}
              </label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('common.category')}
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={inputClass}
              >
                <option value="">{t('agents.chooseCategory')}</option>
                <option value="告警处理">告警处理</option>
                <option value="故障处理">故障处理</option>
                <option value="数据分析">数据分析</option>
                <option value="巡检审计">巡检审计</option>
                <option value="服务器管理">服务器管理</option>
                <option value="操作执行">操作执行</option>
                <option value="文档报告">文档报告</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              {t('agents.description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`${textareaClass} h-20`}
              placeholder={t('agents.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass}>
              {t('agents.systemPrompt')}
            </label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              className={`${textareaClass} h-40`}
              required
            />
          </div>

          <div className={`${softPanelClass} p-4`}>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              {t('agents.primaryModel')} *
            </label>
            <select
              value={formData.primary_model_id}
              onChange={(e) => setFormData({ ...formData, primary_model_id: e.target.value })}
              className={inputClass}
            >
              <option value="">{t('agents.choosePrimaryModel')}</option>
              {(aiModels || []).filter((m: { enabled: number }) => m.enabled === 1).map((model: { id: string; name: string }) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-tertiary mt-1">
              {t('agents.primaryModelHelp')}
            </p>
          </div>

          <div className={`${softPanelClass} p-4`}>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              {t('agents.fallbackModel')} (可选)
            </label>
            <select
              value={formData.fallback_model_id}
              onChange={(e) => setFormData({ ...formData, fallback_model_id: e.target.value })}
              className={inputClass}
            >
              <option value="">{t('agents.chooseFallbackModel')}</option>
              {(aiModels || []).filter((m: { enabled: number }) => m.enabled === 1).map((model: { id: string; name: string }) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-tertiary mt-1">
              {t('agents.fallbackModelHelp')}
            </p>
          </div>

          <div className={`${softPanelClass} p-4 space-y-4`}>
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                {t('common.runtime')}
              </label>
              {formData.runtime === 'hermes' && (
                <button
                  type="button"
                  onClick={testHermesConnection}
                  disabled={connectionLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 disabled:opacity-50 transition-all text-sm"
                >
                  <Cable className="w-4 h-4" />
                  {connectionLoading ? t('agents.testingConnection') : t('agents.testConnection')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <select
                  value={formData.runtime}
                  onChange={(e) => {
                    setConnectionResult(null);
                    setFormData({ ...formData, runtime: e.target.value });
                  }}
                  className={inputClass}
                >
                  <option value="llm">LLM</option>
                  <option value="builtin">Builtin</option>
                  <option value="custom_http">Custom HTTP</option>
                  <option value="hermes">Hermes</option>
                </select>
              </div>
              <div>
                <select
                  value={formData.autonomy_level}
                  onChange={(e) => setFormData({ ...formData, autonomy_level: e.target.value })}
                  className={inputClass}
                >
                  <option value="suggest">suggest</option>
                  <option value="read_only">read_only</option>
                  <option value="approval_required">approval_required</option>
                  <option value="auto">auto</option>
                </select>
              </div>
            </div>

            {formData.runtime === 'hermes' && (
              <div className="space-y-4 pt-3 border-t border-border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Base URL</label>
                    <input
                      type="text"
                      value={hermesConfig.baseUrl}
                      onChange={(e) => setHermesConfig({ ...hermesConfig, baseUrl: e.target.value })}
                      className={inputClass}
                      placeholder={t('agents.baseUrlPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Model</label>
                    <input
                      type="text"
                      value={hermesConfig.model}
                      onChange={(e) => setHermesConfig({ ...hermesConfig, model: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">API Key Env</label>
                    <input
                      type="text"
                      value={hermesConfig.apiKeyEnv}
                      onChange={(e) => setHermesConfig({ ...hermesConfig, apiKeyEnv: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Timeout ms</label>
                    <input
                      type="number"
                      min="1000"
                      max="300000"
                      value={hermesConfig.timeoutMs}
                      onChange={(e) => setHermesConfig({ ...hermesConfig, timeoutMs: parseInt(e.target.value, 10) || 300000 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-tertiary mb-1">Tool rounds</label>
                    <input
                      type="number"
                      min="0"
                      max="8"
                      value={hermesConfig.maxToolRounds}
                      onChange={(e) => setHermesConfig({ ...hermesConfig, maxToolRounds: parseInt(e.target.value, 10) || 3 })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-text-tertiary mb-1">Allowed tools</label>
                  <input
                    type="text"
                    value={hermesConfig.allowedTools}
                    onChange={(e) => setHermesConfig({ ...hermesConfig, allowedTools: e.target.value })}
                    className={inputClass}
                  />
                </div>

                {connectionResult && (
                  <div className={clsx(
                    "flex items-start gap-2 rounded-xl border p-3 text-sm",
                    connectionResult.success
                      ? "bg-green-500/10 border-green-500/30 text-green-300"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  )}>
                    {connectionResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                    <span>{connectionResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                {t('agents.temperature')}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t('agents.tagsInput')}
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className={inputClass}
                placeholder={t('agents.tagsPlaceholder')}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
            />
            <label htmlFor="enabled" className="text-sm text-text-secondary">
              {t('agents.enableAgent')}
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowTestModal(true)}
              className="px-5 py-2.5 bg-primary/10 text-primary border border-primary/30 rounded-xl hover:bg-primary/15 transition-all font-semibold"
            >
              {t('agents.testGeneric')}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-background text-text-secondary rounded-xl hover:bg-surface transition-all font-semibold border border-border"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-black/15 disabled:opacity-50 disabled:shadow-none transition-all duration-300 font-semibold"
            >
              {mutation.isPending ? t('common.saving') : (agent ? t('common.save') : t('common.create'))}
            </button>
          </div>
        </form>

        {/* 测试模态框 */}
        {showTestModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`${panelClass} w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]`}>
              <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  {t('agents.testGeneric')}
                </h2>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="p-2 hover:bg-background rounded-xl text-text-secondary hover:text-text-primary transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                  <label className={labelClass}>
                    {t('agents.testInput')}
                  </label>
                  <textarea
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    className={`${textareaClass} py-3 h-32`}
                    placeholder={t('agents.testInputPlaceholder')}
                  />
                </div>

                <button
                  onClick={handleTest}
                  disabled={testLoading || !testInput.trim()}
                  className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-black/15 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold"
                >
                  {testLoading ? t('agents.testingConnection') : t('agents.runTest')}
                </button>

                {testResult && (
                  <div>
                    <label className={labelClass}>
                      {t('agents.testResult')}
                    </label>
                    <div className="p-4 bg-background rounded-xl border border-border max-h-64 overflow-y-auto scrollbar-thin">
                      <pre className="text-sm text-text-primary whitespace-pre-wrap">
                        {testResult}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-border flex-shrink-0">
                <button
                  onClick={() => setShowTestModal(false)}
                  className="w-full px-6 py-3 bg-background text-text-secondary rounded-xl hover:bg-surface transition-all duration-300 font-semibold border border-border"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
