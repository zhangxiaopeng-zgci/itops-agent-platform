import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Edit, Trash2, Play, Clock, Search, 
  ChevronLeft, BookOpen, Server, BrainCircuit, Cable, CheckCircle2, AlertTriangle, Wrench, MessageSquare, ExternalLink, ShieldCheck
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import MarkdownOutput from '../components/MarkdownOutput';
import { useAuth } from '../contexts/AuthContext';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

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
  channel_id?: string | null;
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

const AGENT_CATEGORY_OPTIONS = [
  { value: '\u667a\u80fd\u8bca\u65ad', labelKey: 'agents.category.intelligentDiagnosis' },
  { value: '\u4fee\u590d\u7f16\u6392', labelKey: 'agents.category.remediationOrchestration' },
  { value: '\u590d\u76d8\u8fdb\u5316', labelKey: 'agents.category.reviewEvolution' },
  { value: '\u544a\u8b66\u5904\u7406', labelKey: 'agents.category.alertHandling' },
  { value: '\u6545\u969c\u8bca\u65ad', labelKey: 'agents.category.incidentDiagnosis' },
  { value: '\u6545\u969c\u5904\u7406', labelKey: 'agents.category.incidentHandling' },
  { value: '\u65e5\u5fd7\u5206\u6790', labelKey: 'agents.category.logAnalysis' },
  { value: '\u6570\u636e\u5206\u6790', labelKey: 'agents.category.dataAnalysis' },
  { value: '\u7cfb\u7edf\u5de1\u68c0', labelKey: 'agents.category.systemInspection' },
  { value: '\u7f51\u7edc\u5de1\u68c0', labelKey: 'agents.category.networkInspection' },
  { value: 'Network\u5de1\u68c0', labelKey: 'agents.category.networkInspection' },
  { value: '\u5de1\u68c0\u5ba1\u8ba1', labelKey: 'agents.category.inspectionAudit' },
  { value: '\u670d\u52a1\u5668\u7ba1\u7406', labelKey: 'agents.category.serverManagement' },
  { value: '\u670d\u52a1\u5668\u64cd\u4f5c', labelKey: 'agents.category.serverOperations' },
  { value: '\u64cd\u4f5c\u6267\u884c', labelKey: 'agents.category.operationExecution' },
  { value: '\u53d8\u66f4\u6267\u884c', labelKey: 'agents.category.changeExecution' },
  { value: '\u5408\u89c4\u68c0\u67e5', labelKey: 'agents.category.complianceCheck' },
  { value: '\u6587\u6863\u751f\u6210', labelKey: 'agents.category.documentGeneration' },
  { value: '\u6587\u6863\u62a5\u544a', labelKey: 'agents.category.documentation' }
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>;

const AGENT_TEST_PRESETS = [
  {
    names: ['\u544a\u8b66\u5904\u7406 Agent', '\u544a\u8b66\u5904\u7406'],
    inputKey: 'agents.testPreset.alertHandling'
  },
  {
    names: ['\u6545\u969c\u8bca\u65ad Agent', '\u6545\u969c\u8bca\u65ad'],
    inputKey: 'agents.testPreset.incidentDiagnosis'
  },
  {
    names: ['\u65e5\u5fd7\u5206\u6790 Agent', '\u65e5\u5fd7\u5206\u6790'],
    inputKey: 'agents.testPreset.logAnalysis'
  },
  {
    names: ['\u7cfb\u7edf\u5de1\u68c0 Agent', '\u7cfb\u7edf\u5de1\u68c0'],
    inputKey: 'agents.testPreset.systemInspection'
  },
  {
    names: ['\u53d8\u66f4\u6267\u884c Agent', '\u53d8\u66f4\u6267\u884c'],
    inputKey: 'agents.testPreset.changeExecution'
  },
  {
    names: ['\u6587\u6863\u751f\u6210 Agent', '\u6587\u6863\u751f\u6210'],
    inputKey: 'agents.testPreset.documentGeneration'
  },
  {
    names: ['\u5408\u89c4\u68c0\u67e5 Agent', '\u5408\u89c4\u68c0\u67e5'],
    inputKey: 'agents.testPreset.complianceCheck'
  },
  {
    names: ['\u670d\u52a1\u5668\u547d\u4ee4\u6267\u884c Agent', '\u670d\u52a1\u5668\u547d\u4ee4\u6267\u884c'],
    inputKey: 'agents.testPreset.serverCommand'
  },
  {
    names: ['\u81ea\u52a8\u5de1\u68c0 Agent', '\u81ea\u52a8\u5de1\u68c0'],
    inputKey: 'agents.testPreset.autoInspection'
  }
] as const satisfies ReadonlyArray<{ names: readonly string[]; inputKey: MessageKey }>;

const AGENT_DISPLAY_TEXTS = [
  { value: 'Hermes \u4fee\u590d\u7f16\u6392 Agent', labelKey: 'agents.preset.hermesRemediate.name' },
  { value: 'Hermes \u5ba1\u6279\u5f0f\u4fee\u590d\u5de5\u4f5c\u6d41\u7f16\u6392\u4e13\u5bb6', labelKey: 'agents.preset.hermesRemediate.role' },
  { value: '\u5c06\u5df2\u786e\u8ba4\u7684\u4fee\u590d\u65b9\u6848\u8f6c\u6210\u53d7\u63a7\u5de5\u4f5c\u6d41\u5ba1\u6279\u3001\u4efb\u52a1\u8ffd\u8e2a\u548c\u4fee\u590d\u9a8c\u8bc1', labelKey: 'agents.preset.hermesRemediate.desc' },
  { value: 'Hermes \u590d\u76d8\u8fdb\u5316 Agent', labelKey: 'agents.preset.hermesEvolve.name' },
  { value: 'Hermes \u8fd0\u884c\u590d\u76d8\u4e0e\u8fdb\u5316\u5efa\u8bae\u4e13\u5bb6', labelKey: 'agents.preset.hermesEvolve.role' },
  { value: '\u590d\u76d8 Agent trace\u3001\u5ba1\u6279\u3001\u4efb\u52a1\u548c\u9a8c\u8bc1\u7ed3\u679c\uff0c\u751f\u6210\u53ef\u5ba1\u6279\u7684\u6539\u8fdb\u5efa\u8bae', labelKey: 'agents.preset.hermesEvolve.desc' },
  { value: 'Hermes \u8bca\u65ad\u4fee\u590d Agent', labelKey: 'agents.preset.hermesDiagnose.name' },
  { value: 'Hermes \u8fd0\u7ef4\u8bca\u65ad\u4e0e\u5ba1\u6279\u4fee\u590d\u7f16\u6392\u4e13\u5bb6', labelKey: 'agents.preset.hermesDiagnose.role' },
  { value: '\u901a\u8fc7 Hermes Runtime \u6267\u884c\u53ea\u8bfb\u8bca\u65ad\uff0c\u5e76\u5728\u9700\u8981\u4fee\u590d\u65f6\u63d0\u4ea4\u53d7\u63a7\u5de5\u4f5c\u6d41\u5ba1\u6279', labelKey: 'agents.preset.hermesDiagnose.desc' },
  { value: '\u53d8\u66f4\u6267\u884c Agent', labelKey: 'agents.preset.change.name' },
  { value: '\u53d8\u66f4\u6267\u884c\u4e13\u5bb6', labelKey: 'agents.preset.change.role' },
  { value: '\u6267\u884c\u7cfb\u7edf\u53d8\u66f4\u64cd\u4f5c\uff0c\u9a8c\u8bc1\u64cd\u4f5c\u7ed3\u679c', labelKey: 'agents.preset.change.desc' },
  { value: '\u5408\u89c4\u68c0\u67e5 Agent', labelKey: 'agents.preset.compliance.name' },
  { value: '\u5408\u89c4\u68c0\u67e5\u4e13\u5bb6', labelKey: 'agents.preset.compliance.role' },
  { value: '\u9a8c\u8bc1\u7cfb\u7edf\u914d\u7f6e\u662f\u5426\u7b26\u5408\u5b89\u5168\u57fa\u7ebf\u548c\u5408\u89c4\u8981\u6c42', labelKey: 'agents.preset.compliance.desc' },
  { value: '\u544a\u8b66\u5904\u7406 Agent', labelKey: 'agents.preset.alert.name' },
  { value: '\u544a\u8b66\u5206\u6790\u4e0e\u5904\u7406\u4e13\u5bb6', labelKey: 'agents.preset.alert.role' },
  { value: '\u8d1f\u8d23\u5206\u6790\u544a\u8b66\u4fe1\u606f\uff0c\u8bc4\u4f30\u4e25\u91cd\u7a0b\u5ea6\uff0c\u5e76\u63d0\u4f9b\u5904\u7406\u5efa\u8bae', labelKey: 'agents.preset.alert.desc' },
  { value: '\u547d\u4ee4\u751f\u6210\u4e13\u5bb6', labelKey: 'agents.preset.commandGenerator.name' },
  { value: '\u8fd0\u7ef4\u547d\u4ee4\u751f\u6210\u4e13\u5bb6', labelKey: 'agents.preset.commandGenerator.role' },
  { value: '[COMMAND_GENERATOR] \u6839\u636e\u81ea\u7136\u8bed\u8a00\u9700\u6c42\uff0c\u667a\u80fd\u751f\u6210\u5bf9\u5e94\u7684\u670d\u52a1\u5668\u547d\u4ee4', labelKey: 'agents.preset.commandGenerator.desc' },
  { value: '\u6545\u969c\u8bca\u65ad Agent', labelKey: 'agents.preset.incident.name' },
  { value: '\u6545\u969c\u8bca\u65ad\u4e13\u5bb6', labelKey: 'agents.preset.incident.role' },
  { value: '\u5206\u6790\u7cfb\u7edf\u6545\u969c\uff0c\u8bc6\u522b\u6839\u56e0\uff0c\u5e76\u63d0\u4f9b\u89e3\u51b3\u65b9\u6848', labelKey: 'agents.preset.incident.desc' },
  { value: '\u6587\u6863\u751f\u6210 Agent', labelKey: 'agents.preset.document.name' },
  { value: '\u6587\u6863\u751f\u6210\u4e13\u5bb6', labelKey: 'agents.preset.document.role' },
  { value: '\u6839\u636e\u4efb\u52a1\u6267\u884c\u7ed3\u679c\uff0c\u751f\u6210\u7ed3\u6784\u5316\u7684\u8fd0\u7ef4\u62a5\u544a', labelKey: 'agents.preset.document.desc' },
  { value: '\u65e5\u5fd7\u5206\u6790 Agent', labelKey: 'agents.preset.log.name' },
  { value: '\u65e5\u5fd7\u5206\u6790\u4e13\u5bb6', labelKey: 'agents.preset.log.role' },
  { value: '\u5206\u6790\u7cfb\u7edf\u548c\u5e94\u7528\u65e5\u5fd7\uff0c\u8bc6\u522b\u9519\u8bef\u6a21\u5f0f\u548c\u5f02\u5e38\u4e8b\u4ef6', labelKey: 'agents.preset.log.desc' },
  { value: '\u670d\u52a1\u5668\u547d\u4ee4\u6267\u884c Agent', labelKey: 'agents.preset.serverCommand.name' },
  { value: '\u670d\u52a1\u5668\u64cd\u4f5c\u4e13\u5bb6', labelKey: 'agents.preset.serverCommand.role' },
  { value: '\u5728\u76ee\u6807\u670d\u52a1\u5668\u4e0a\u6267\u884c\u547d\u4ee4\u5e76\u8fd4\u56de\u7ed3\u679c', labelKey: 'agents.preset.serverCommand.desc' },
  { value: '\u7cfb\u7edf\u5de1\u68c0 Agent', labelKey: 'agents.preset.systemInspection.name' },
  { value: '\u7cfb\u7edf\u5065\u5eb7\u68c0\u67e5\u4e13\u5bb6', labelKey: 'agents.preset.systemInspection.role' },
  { value: '\u6267\u884c\u7cfb\u7edf\u5065\u5eb7\u68c0\u67e5\uff0c\u8bc4\u4f30\u5404\u9879\u6307\u6807\u72b6\u6001', labelKey: 'agents.preset.systemInspection.desc' },
  { value: '\u7f51\u7edc\u5de1\u68c0\u4e13\u5bb6', labelKey: 'agents.preset.networkInspection.name' },
  { value: '\u7f51\u7edc\u8bbe\u5907\u5de1\u68c0\u4e0e\u5065\u5eb7\u8bca\u65ad\u4e13\u5bb6', labelKey: 'agents.preset.networkInspection.role' },
  { value: '\u5bf9\u8def\u7531\u5668\u3001\u4ea4\u6362\u673a\u3001\u9632\u706b\u5899\u7b49\u7f51\u7edc\u8bbe\u5907\u6267\u884c\u6807\u51c6\u5316\u6216\u81ea\u5b9a\u4e49\u5de1\u68c0', labelKey: 'agents.preset.networkInspection.desc' },
  { value: '\u81ea\u52a8\u5de1\u68c0 Agent', labelKey: 'agents.preset.autoInspection.name' },
  { value: '\u81ea\u52a8\u5de1\u68c0\u4e13\u5bb6', labelKey: 'agents.preset.autoInspection.role' },
  { value: '\u5bf9\u591a\u53f0\u670d\u52a1\u5668\u6267\u884c\u81ea\u52a8\u5316\u5de1\u68c0\u4efb\u52a1', labelKey: 'agents.preset.autoInspection.desc' }
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>;

function getAgentCategoryLabel(category: string | undefined, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  if (!category) return '-';
  const option = AGENT_CATEGORY_OPTIONS.find((item) => item.value === category);
  return option ? t(option.labelKey) : category;
}

function getAgentDisplayText(value: string | undefined, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  if (!value) return '';
  const option = AGENT_DISPLAY_TEXTS.find((item) => item.value === value);
  return option ? t(option.labelKey) : value;
}

function getAgentTestPresetInput(agentName: string, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const preset = AGENT_TEST_PRESETS.find((item) => item.names.some((name) => name === agentName));
  return preset ? t(preset.inputKey) : t('agents.testPreset.default');
}

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
    
    // Select all enabled servers by default.
    if (servers && servers.length > 0 && selectedServerIds.length === 0) {
      setSelectedServerIds(servers.filter((s) => s.enabled).map((s) => s.id));
    }
    
    setTestInput(getAgentTestPresetInput(agent.name, t));
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
                {getAgentCategoryLabel(cat, t)}
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
                      <h3 className="font-bold text-text-primary tracking-tight group-hover:text-primary transition-colors">{getAgentDisplayText(agent.name, t)}</h3>
                      <p className="text-sm text-text-secondary mt-1">{getAgentDisplayText(agent.role, t)}</p>
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
                        {getAgentCategoryLabel(agent.category, t)}
                      </span>
                    )}
                  </div>
                </div>

                {agent.description && (
                  <p className="text-sm text-text-secondary mb-4 line-clamp-2 leading-relaxed">
                    {getAgentDisplayText(agent.description, t)}
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
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/30 text-2xl">
                  {editingAgent.avatar}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-text-primary">{t('agents.testAgent', { name: getAgentDisplayText(editingAgent.name, t) })}</h2>
                  <p className="text-sm text-text-secondary">{getAgentDisplayText(editingAgent.role, t)}</p>
                </div>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="p-2 hover:bg-background rounded-xl text-text-secondary hover:text-text-primary transition-all"
              >
                ✕
              </button>
            </div>
            
            {/* Scrollable content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Server selection */}
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

            {/* Fixed footer */}
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
                  {getAgentDisplayText(agent.name, t)}
                </h1>
                <p className="text-sm text-text-secondary">{getAgentDisplayText(agent.role, t)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${panelClass} p-6`}>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-sm text-text-tertiary block mb-1">{t('common.category')}</span>
                <span className="text-text-primary">{getAgentCategoryLabel(agent.category, t)}</span>
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
  const { user } = useAuth();
  const canManageRuntime = user?.role === 'admin';
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

  const { data: hermesChannels } = useQuery({
    queryKey: ['hermes-channels'],
    queryFn: async () => {
      const res = await api.get('/api/hermes-channels');
      return res.data.data as HermesChannel[];
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
    channel_id: agent?.channel_id || '',
  });

  const selectedChannel = (hermesChannels || []).find((channel) => channel.id === formData.channel_id) || null;

  const mutation = useMutation({
    mutationFn: async (data: typeof formData & { tags?: string[], runtime_config?: HermesRuntimeConfig | null }) => {
      const payload: Partial<typeof data> = { ...data };
      if (!canManageRuntime) {
        delete payload.runtime;
        delete payload.runtime_config;
        delete payload.autonomy_level;
        delete payload.tool_policy_id;
        delete payload.channel_id;
      }
      if (agent) {
        await api.put(`/api/agents/${agent.id}`, payload);
      } else {
        await api.post('/api/agents', payload);
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
    mutation.mutate({
      ...formData,
      tags,
      runtime_config: canManageRuntime && formData.runtime === 'hermes' && !formData.channel_id
        ? buildRuntimeConfig()
        : undefined
    });
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
      const res = formData.channel_id
        ? await api.post(`/api/hermes-channels/${formData.channel_id}/test`)
        : await api.post('/api/agents/runtime/hermes/test-connection', {
          runtime_config: buildRuntimeConfig()
        });
      const data = res.data.data;
      setConnectionResult({
        success: true,
        message: t('agents.connectionSuccess', { model: data.model, latency: data.latencyMs })
      });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; data?: { error?: string } } }; message?: string };
      setConnectionResult({
        success: false,
        message: err.response?.data?.data?.error || err.response?.data?.error || err.message || t('agents.connectionFailed')
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
      
      setTestResult(res.data.data.output || t('agents.testNoOutput'));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setTestResult(t('agents.testFailed', { error: err.response?.data?.error || err.response?.data?.message || err.message || t('common.unknownError') }));
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
                {AGENT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
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
              {t('agents.fallbackModel')} {t('common.optional')}
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

          {canManageRuntime ? (
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
                    const nextRuntime = e.target.value;
                    setFormData({
                      ...formData,
                      runtime: nextRuntime,
                      channel_id: nextRuntime === 'hermes' ? (formData.channel_id || hermesChannels?.[0]?.id || '') : ''
                    });
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
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">{t('agents.hermesChannel')}</label>
                  <select
                    value={formData.channel_id}
                    onChange={(e) => {
                      setConnectionResult(null);
                      setFormData({ ...formData, channel_id: e.target.value });
                    }}
                    className={inputClass}
                  >
                    <option value="">{t('agents.noHermesChannel')}</option>
                    {(hermesChannels || []).map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedChannel ? (
                  <div className="rounded-xl bg-background border border-border p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-text-tertiary">{t('hermesChannels.model')}</div>
                        <div className="font-medium text-text-primary mt-1">{selectedChannel.model}</div>
                      </div>
                      <div>
                        <div className="text-text-tertiary">{t('hermesChannels.secretRef')}</div>
                        <div className="font-medium text-text-primary mt-1">{selectedChannel.api_key_ref}</div>
                      </div>
                      <div>
                        <div className="text-text-tertiary">{t('common.status')}</div>
                        <div className="font-medium text-text-primary mt-1">{selectedChannel.health_status}</div>
                      </div>
                      <div>
                        <div className="text-text-tertiary">{t('hermesChannels.tools')}</div>
                        <div className="font-medium text-text-primary mt-1">
                          {selectedChannel.tools.filter((tool) => tool.enabled === 1).length}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedChannel.tools.filter((tool) => tool.enabled === 1).slice(0, 10).map((tool) => (
                        <span key={tool.tool_name} className="px-2 py-1 rounded-md bg-surface border border-border text-[11px] text-text-tertiary">
                          {tool.tool_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-300">
                    {t('agents.legacyHermesConfig')}
                  </div>
                )}

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
          ) : (
            <div className={`${softPanelClass} p-4`}>
              <div className="flex items-start gap-3 text-sm text-text-secondary">
                <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-text-primary">{t('agents.runtimeAdminOnly')}</div>
                  <div className="text-xs text-text-tertiary mt-1">{t('agents.runtimeAdminOnlyDesc')}</div>
                </div>
              </div>
            </div>
          )}

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

        {/* Test modal */}
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
