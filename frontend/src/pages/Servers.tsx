import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, Server, Terminal, CheckCircle2,
  AlertCircle, ShieldCheck, Wifi, History, Clock, FolderTree,
  Upload, RefreshCw, ChevronRight, ChevronDown, Cpu,
  HardDrive, MemoryStick, Monitor, FolderPlus, MonitorPlay,
  Bot, Key, Search, Settings,
  Sparkles, X, AlertTriangle, User,
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { ImportExport } from '../components/ImportExport';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale } from '../contexts/LocaleContext';

interface Server {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  use_ssh_key: number;
  ssh_key_id?: string | null;
  description?: string;
  tags?: string[];
  enabled: number;
  last_connected?: string;
  created_at: string;
  os?: string;
  os_type?: 'linux' | 'windows' | 'unknown';
  cpu_cores?: number;
  memory_gb?: number;
  disk_gb?: number;
  ip_address?: string;
  private_ip?: string;
  groups?: Array<{ id: string; name: string }>;
}

interface ServerGroup {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  sort_order: number;
  server_count?: number;
  children_count?: number;
  children?: ServerGroup[];
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;
  aiAnalysis?: string;
}

interface CommandHistoryItem {
  id: string;
  server_id: string;
  command: string;
  stdout: string;
  stderr: string;
  success: number;
  execution_time_ms: number;
  executed_by: string;
  executed_at: string;
}

interface ComplianceCheck {
  id: string;
  server_id: string;
  check_name: string;
  check_results: string;
  status: string;
  started_at: string;
  completed_at: string;
  created_at: string;
}

type AuthCredential = {
  id: string;
  name: string;
  auth_type: 'key' | 'password';
  key_type: string;
  fingerprint: string | null;
  username: string | null;
  description: string | null;
  usage_count: number;
};

const AI_AGENT_MATCHERS = {
  commandGeneration: ['command generation', 'command generator', '\u547d\u4ee4\u751f\u6210'],
  server: ['server', 'command', 'service', '\u670d\u52a1\u5668', '\u547d\u4ee4', '\u670d\u52a1']
};

function matchesAny(value: string | undefined, keywords: string[]) {
  const normalized = value?.toLowerCase() || '';
  return keywords.some(keyword => normalized.includes(keyword.toLowerCase()));
}

export default function Servers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { locale, t } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    port: 22,
    username: '',
    password: '',
    private_key: '',
    use_ssh_key: false,
    ssh_key_id: '',
    description: '',
    tags: '',
    os_type: 'linux' as 'linux' | 'windows',
    vnc_port: 5900,
    vnc_password: ''
  });
  const [command, setCommand] = useState('');
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [complianceResults, setComplianceResults] = useState<Record<string, CommandResult> | null>(null);
  const [isRunningCompliance, setIsRunningCompliance] = useState(false);
  const [activeTab, setActiveTab] = useState<'servers' | 'compliance' | 'command-history' | 'compliance-history'>('servers');
  const [showComplianceOptions, setShowComplianceOptions] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pendingDeleteServer, setPendingDeleteServer] = useState<{ id: string; name: string } | null>(null);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isCollectingMetrics, setIsCollectingMetrics] = useState(false);
  // AI 命令生成相关
  const [isAiCommandModalOpen, setIsAiCommandModalOpen] = useState(false);
  const [aiCommandServer, setAiCommandServer] = useState<Server | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGeneratedCommand, setAiGeneratedCommand] = useState('');
  const [aiCommandExplanation, setAiCommandExplanation] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [selectedAiAgent, setSelectedAiAgent] = useState<{ id: string; name: string } | null>(null);
  const [showAiCommandConfirm, setShowAiCommandConfirm] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState('');

  // ESC key support for modals
  useEscapeKey({ onEscape: () => { setIsModalOpen(false); setSelectedServer(null); resetForm(); }, enabled: isModalOpen });
  useEscapeKey({ onEscape: () => setIsImportModalOpen(false), enabled: isImportModalOpen });
  useEscapeKey({ onEscape: () => { setIsGroupModalOpen(false); setEditingGroup(null); }, enabled: isGroupModalOpen });
  useEscapeKey({ onEscape: () => { setIsAiCommandModalOpen(false); setAiPrompt(''); setAiGeneratedCommand(''); setAiCommandExplanation(''); setAiGenerationError(''); setShowAiCommandConfirm(false); }, enabled: isAiCommandModalOpen });
  useEscapeKey({ onEscape: () => { setIsDeleteConfirmOpen(false); setPendingDeleteServer(null); }, enabled: isDeleteConfirmOpen });

  // 获取 Agent 列表（用于 AI 生成命令）
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await api.get('/api/agents');
      return res.data.data as Array<{ id: string; name: string; enabled: number; category?: string }>;
    },
    enabled: true
  });
  // 认证凭证列表（用于选择已有凭证）
  const { data: sshKeys } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: async () => {
      const res = await api.get('/api/ssh-keys');
      return res.data.data as AuthCredential[];
    },
  });
  const [selectedSshKeyId, setSelectedSshKeyId] = useState<string>('');
  const [sshKeySearchQuery, setSshKeySearchQuery] = useState('');
  const [showSshKeyDropdown, setShowSshKeyDropdown] = useState(false);
  const [groupFormData, setGroupFormData] = useState({ name: '', description: '', parent_id: '' });
  const [editingGroup, setEditingGroup] = useState<ServerGroup | null>(null);
  const [importData, setImportData] = useState('');
  const [importResult, setImportResult] = useState<any>(null);
  const [showGroups, setShowGroups] = useState(false);
  // 标签输入相关
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // 关闭标签建议下拉框（点击外部时）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setTagDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 解析当前已输入的标签
  const parseCurrentTags = useCallback(() => {
    return formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
  }, [formData.tags]);

  // 获取输入框中最后一段文本（用于过滤建议）
  const getLastTagFragment = useCallback(() => {
    const raw = formData.tags;
    const lastCommaIndex = raw.lastIndexOf(',');
    return lastCommaIndex >= 0 ? raw.substring(lastCommaIndex + 1).trim() : (raw || '').trim();
  }, [formData.tags]);

  // 添加标签到输入框
  const addTagToInput = useCallback((tag: string) => {
    const raw = formData.tags;
    const lastCommaIndex = raw.lastIndexOf(',');
    const beforeLast = lastCommaIndex >= 0 ? raw.substring(0, lastCommaIndex + 1) : '';
    // 替换最后一段为选中的标签，并追加逗号和空格
    setFormData({ ...formData, tags: beforeLast + tag + ', ' });
    tagInputRef.current?.focus();
  }, [formData]);

  // 从已选标签中删除
  const removeTag = useCallback((tagToRemove: string) => {
    const current = parseCurrentTags();
    const filtered = current.filter((t: string) => t !== tagToRemove);
    setFormData({ ...formData, tags: filtered.join(', ') });
  }, [formData.tags]);

  const { data: groupsData } = useQuery({
    queryKey: ['server-groups'],
    queryFn: async () => {
      const res = await api.get('/api/server-groups/tree');
      return res.data.data as ServerGroup[];
    },
  });

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await api.get('/api/servers');
      return res.data.data as Server[];
    },
  });

  // 获取所有唯一的标签
  const allTags = Array.from(new Set(
    (Array.isArray(servers) ? servers : [])
      .flatMap((server: Server) => Array.isArray(server.tags) ? server.tags : [])
  )).sort();

  const getCredentialTypeLabel = useCallback((credential: AuthCredential) => {
    return credential.auth_type === 'password' ? t('servers.credential.password') : (credential.key_type || t('servers.credential.privateKey'));
  }, [t]);

  const getCredentialSearchLabel = useCallback((credential: AuthCredential) => {
    return `${credential.name} (${getCredentialTypeLabel(credential)})`;
  }, [getCredentialTypeLabel]);

  const selectedCredential = useMemo(() => {
    if (!selectedSshKeyId || !sshKeys) return null;
    return sshKeys.find((credential) => credential.id === selectedSshKeyId) || null;
  }, [selectedSshKeyId, sshKeys]);

  useEffect(() => {
    if (selectedCredential) {
      setSshKeySearchQuery(getCredentialSearchLabel(selectedCredential));
    }
  }, [getCredentialSearchLabel, selectedCredential]);

  // 过滤认证凭证列表（按名称、类型、用户名或指纹搜索）
  const filteredSshKeys = useMemo(() => {
    if (!sshKeys) return [];
    if (!sshKeySearchQuery) return sshKeys;
    const query = sshKeySearchQuery.toLowerCase();
    return sshKeys.filter((key) => {
      const typeLabel = getCredentialTypeLabel(key);
      return (
        key.name.toLowerCase().includes(query) ||
        key.auth_type.toLowerCase().includes(query) ||
        typeLabel.toLowerCase().includes(query) ||
        (key.key_type || '').toLowerCase().includes(query) ||
        (key.username || '').toLowerCase().includes(query) ||
        (key.description || '').toLowerCase().includes(query) ||
        (key.fingerprint || '').toLowerCase().includes(query)
      );
    });
  }, [getCredentialTypeLabel, sshKeys, sshKeySearchQuery]);

  // 过滤后的标签建议（排除已选的，按输入过滤）
  const filteredTagSuggestions = () => {
    const current = parseCurrentTags();
    const fragment = getLastTagFragment().toLowerCase();
    return allTags.filter((tag: string) => {
      if (current.includes(tag)) return false;
      if (fragment) return tag.toLowerCase().includes(fragment);
      return true;
    });
  };

  // 根据选中的标签或分组筛选服务器
  const safeServers = Array.isArray(servers) ? servers : [];
  const filteredServers = selectedGroupId
    ? safeServers.filter((server: Server) => (server.groups || []).some((g: any) => g.id === selectedGroupId))
    : selectedTag
    ? safeServers.filter((server: Server) => (Array.isArray(server.tags) ? server.tags : []).includes(selectedTag))
    : safeServers;

  const { data: commandHistory, refetch: refetchCommandHistory } = useQuery({
    queryKey: ['commandHistory', selectedServer?.id],
    queryFn: async () => {
      if (!selectedServer) return [];
      const res = await api.get(`/api/servers/${selectedServer.id}/command-history`);
      return res.data.data as CommandHistoryItem[];
    },
    enabled: !!selectedServer && activeTab === 'command-history',
  });

  const { data: complianceHistory, refetch: refetchComplianceHistory } = useQuery({
    queryKey: ['complianceHistory', selectedServer?.id],
    queryFn: async () => {
      if (!selectedServer) return [];
      const res = await api.get(`/api/servers/${selectedServer.id}/compliance-history`);
      return res.data.data as ComplianceCheck[];
    },
    enabled: !!selectedServer && activeTab === 'compliance-history',
  });

  const buildServerPayload = (data: typeof formData, isEdit = false) => {
    const usingSavedCredential = data.use_ssh_key && !!data.ssh_key_id;
    const payload: Record<string, unknown> = {
      ...data,
      tags: data.tags ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : (isEdit ? undefined : []),
      ssh_key_id: usingSavedCredential ? data.ssh_key_id : null,
    };

    if (usingSavedCredential) {
      delete payload.password;
      delete payload.private_key;
      return payload;
    }

    if (data.use_ssh_key) {
      delete payload.password;
      if (isEdit && !data.private_key) {
        delete payload.private_key;
      }
      return payload;
    }

    delete payload.private_key;
    if (isEdit && !data.password) {
      delete payload.password;
    }
    return payload;
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const payload = buildServerPayload(data);
      const res = await api.post('/api/servers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      resetForm();
      setIsModalOpen(false);
      toast.success(t('servers.toast.created'));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || t('servers.toast.createFailed'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const payload = buildServerPayload(data, true);
      const res = await api.put(`/api/servers/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      resetForm();
      setIsModalOpen(false);
      setSelectedServer(null);
      toast.success(t('servers.toast.updated'));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || t('servers.toast.updateFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/servers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setIsDeleteConfirmOpen(false);
      setPendingDeleteServer(null);
      toast.success(t('servers.toast.deleted'));
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || t('servers.toast.deleteFailed'));
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/server-commands/${id}/test`);
      return res.data;
    },
  });

  const executeCommandMutation = useMutation({
    mutationFn: async ({ id, command }: { id: string; command: string }) => {
      const res = await api.post(`/api/server-commands/${id}/exec`, { command });
      return res.data;
    },
    onSuccess: () => {
      refetchCommandHistory();
    },
  });

  const [complianceOptions, setComplianceOptions] = useState({
    useAI: true,
    concurrency: 5
  });
  
  const runComplianceMutation = useMutation({
    mutationFn: async ({ id, options }: { id: string; options?: { useAI?: boolean; concurrency?: number } }) => {
      const res = await api.post(`/api/server-commands/${id}/compliance`, options || {});
      return res.data;
    },
    onSuccess: () => {
      refetchComplianceHistory();
    },
  });

  const collectInfoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/server-management/${id}/collect-info`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const collectAllMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/server-management/collect-all');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const collectMetricsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/api/server-management/${id}/collect-metrics`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const collectAllMetricsMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/server-management/collect-all-metrics');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const importServersMutation = useMutation({
    mutationFn: async (data: { servers: any[]; test_connection: boolean }) => {
      const res = await api.post('/api/server-management/import', data);
      return res.data;
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/api/server-groups', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-groups'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setIsGroupModalOpen(false);
      setGroupFormData({ name: '', description: '', parent_id: '' });
      setEditingGroup(null);
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/api/server-groups/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-groups'] });
      setIsGroupModalOpen(false);
      setGroupFormData({ name: '', description: '', parent_id: '' });
      setEditingGroup(null);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      hostname: '',
      port: 22,
      username: '',
      password: '',
      private_key: '',
      use_ssh_key: false,
      ssh_key_id: '',
      description: '',
      tags: '',
      os_type: 'linux' as 'linux' | 'windows',
      vnc_port: 5900,
      vnc_password: ''
    });
    setSelectedSshKeyId('');
    setSshKeySearchQuery('');
    setShowSshKeyDropdown(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedServer) {
      updateMutation.mutate({ id: selectedServer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (server: Server) => {
    setSelectedServer(server);
    const serverSshKeyId = (server as any).ssh_key_id || '';
    setSelectedSshKeyId(serverSshKeyId);
    
    // 如果有认证凭证 ID，设置搜索框显示名称
    if (serverSshKeyId && sshKeys) {
      const key = sshKeys.find(k => k.id === serverSshKeyId);
      if (key) {
        setSshKeySearchQuery(getCredentialSearchLabel(key));
      }
    } else {
      setSshKeySearchQuery('');
    }
    
    setFormData({
      name: server.name,
      hostname: server.hostname,
      port: server.port,
      username: server.username,
      password: '',
      private_key: '',
      use_ssh_key: !!server.use_ssh_key,
      ssh_key_id: serverSshKeyId,
      description: server.description || '',
      tags: server.tags ? server.tags.join(', ') : '',
      os_type: (server as any).os_type || 'linux',
      vnc_port: (server as any).vnc_port || 5900,
      vnc_password: ''
    });
    setIsModalOpen(true);
  };

  const handleTestConnection = (server: Server) => {
    testConnectionMutation.mutate(server.id, {
      onSuccess: (data) => {
        toast.success(data.data.message);
      },
    });
  };

  const handleExecuteCommand = () => {
    if (!selectedServer || !command) return;
    setIsExecuting(true);
    executeCommandMutation.mutate(
      { id: selectedServer.id, command },
      {
        onSuccess: (data) => {
          setCommandResult(data.data);
        },
        onSettled: () => {
          setIsExecuting(false);
        },
      }
    );
  };

  const handleRunCompliance = (server: Server) => {
    setSelectedServer(server);
    setShowComplianceOptions(true);
  };

  const startComplianceCheck = () => {
    if (!selectedServer) return;
    setShowComplianceOptions(false);
    setIsRunningCompliance(true);
    setActiveTab('compliance');
    runComplianceMutation.mutate(
      { 
        id: selectedServer.id,
        options: complianceOptions
      },
      {
        onSuccess: (data) => {
          setComplianceResults(data.data);
        },
        onSettled: () => {
          setIsRunningCompliance(false);
        },
      }
    );
  };

  const handleCollectInfo = async (server: Server) => {
    setIsCollecting(true);
    try {
      await collectInfoMutation.mutateAsync(server.id);
      toast.success(t('servers.toast.collectInfoSuccess', { name: server.name }));
    } catch {
      toast.error(t('servers.toast.collectFailed'));
    } finally {
      setIsCollecting(false);
    }
  };

  // AI 生成命令
  const handleAiGenerateCommand = async () => {
    if (!aiCommandServer || !aiPrompt.trim()) return;

    const enabledAgent = selectedAiAgent;
    if (!enabledAgent) {
      setAiGenerationError(t('servers.aiCommand.noAgent'));
      return;
    }

    setAiGenerationError('');
    setIsAiGenerating(true);
    try {
      const serverInfo = {
        os_name: aiCommandServer.os || t('common.unknown'),
        os_type: aiCommandServer.os_type || 'linux',
        hostname: aiCommandServer.hostname || '',
        ip_address: aiCommandServer.ip_address || '',
        cpu_cores: aiCommandServer.cpu_cores || '',
        memory_gb: aiCommandServer.memory_gb || '',
        disk_gb: aiCommandServer.disk_gb || ''
      };

      const userInput = [
        t('servers.aiCommand.prompt.serverInfoTitle'),
        t('servers.aiCommand.prompt.osName', { value: serverInfo.os_name }),
        t('servers.aiCommand.prompt.osType', { value: serverInfo.os_type }),
        t('servers.aiCommand.prompt.host', { value: serverInfo.hostname || serverInfo.ip_address }),
        serverInfo.cpu_cores ? t('servers.aiCommand.prompt.cpuCores', { value: serverInfo.cpu_cores }) : '',
        serverInfo.memory_gb ? t('servers.aiCommand.prompt.memoryGb', { value: serverInfo.memory_gb }) : '',
        serverInfo.disk_gb ? t('servers.aiCommand.prompt.diskGb', { value: serverInfo.disk_gb }) : '',
        '',
        t('servers.aiCommand.prompt.userRequest', { value: aiPrompt })
      ].filter(line => line !== '').join('\n');

      const res = await api.post(`/api/agents/${enabledAgent.id}/test`, {
        input: userInput,
        serverIds: [aiCommandServer.id]
      });

      const output = res.data.data.output;
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          setAiGeneratedCommand(result.command);
          setAiCommandExplanation(result.explanation);
        } catch {
          setAiGeneratedCommand(output);
          setAiCommandExplanation(t('servers.aiCommand.defaultExplanation'));
        }
      } else {
        setAiGeneratedCommand(output);
        setAiCommandExplanation(t('servers.aiCommand.defaultExplanation'));
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || t('common.unknownError');
      setAiGenerationError(t('servers.aiCommand.generateFailed', { error: errorMsg }));
    } finally {
      setIsAiGenerating(false);
    }
  };

  // 执行 AI 生成的命令
  const handleExecuteAiCommand = () => {
    if (!aiCommandServer || !aiGeneratedCommand) return;
    setShowAiCommandConfirm(true);
  };

  const confirmExecuteAiCommand = () => {
    setShowAiCommandConfirm(false);
    setIsAiCommandModalOpen(false);
    setAiGeneratedCommand('');
    setAiCommandExplanation('');
    setAiPrompt('');
    setActiveTab('servers');
    setSelectedServer(aiCommandServer);
    setCommand(aiGeneratedCommand);
    setCommandResult(null);

    setIsExecuting(true);
    executeCommandMutation.mutate(
      { id: aiCommandServer!.id, command: aiGeneratedCommand },
      {
        onSuccess: (data) => {
          setCommandResult(data.data);
        },
        onSettled: () => {
          setIsExecuting(false);
        },
      }
    );
  };

  const handleCollectAll = async () => {
    setIsCollecting(true);
    try {
      const result = await collectAllMutation.mutateAsync();
      toast.success(t('servers.toast.collectAllResult', { success: result.data.success, failed: result.data.failed }));
    } catch {
      toast.error(t('servers.toast.collectAllFailed'));
    } finally {
      setIsCollecting(false);
    }
  };

  const handleCollectMetrics = async (server: Server) => {
    setIsCollectingMetrics(true);
    try {
      await collectMetricsMutation.mutateAsync(server.id);
      toast.success(t('servers.toast.collectMetricsSuccess', { name: server.name }));
    } catch {
      toast.error(t('servers.toast.collectFailed'));
    } finally {
      setIsCollectingMetrics(false);
    }
  };

  const handleCollectAllMetrics = async () => {
    setIsCollectingMetrics(true);
    try {
      const result = await collectAllMetricsMutation.mutateAsync();
      toast.success(t('servers.toast.collectMetricsResult', { success: result.data.success, failed: result.data.failed }));
    } catch {
      toast.error(t('servers.toast.collectAllFailed'));
    } finally {
      setIsCollectingMetrics(false);
    }
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, data: groupFormData });
    } else {
      createGroupMutation.mutate(groupFormData);
    }
  };

  const handleImport = async () => {
    try {
      const servers = importData.split('\n').filter(Boolean).map((line) => {
        try {
          const item = JSON.parse(line);
          return {
            name: item.name,
            hostname: item.hostname,
            port: item.port || 22,
            username: item.username,
            password: item.password,
            private_key: item.private_key,
            use_ssh_key: item.use_ssh_key || 0,
            description: item.description || '',
            tags: item.tags ? item.tags.split(',').map((t: string) => t.trim()) : [],
            group_id: item.group_id || undefined
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (servers.length === 0) {
        toast.error(t('servers.import.noValidData'));
        return;
      }

      const result = await importServersMutation.mutateAsync({ servers, test_connection: true });
      setImportResult(result.data);
      toast.success(t('servers.import.successToast', { success: result.data.success, failed: result.data.failed }));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('servers.import.failed'));
    }
  };

  const GroupTree = ({ groups, level = 0 }: { groups: ServerGroup[]; level?: number }) => (
    <div className={level > 0 ? 'ml-4' : ''}>
      {groups.map((group) => (
        <div key={group.id}>
          <div
            className={clsx(
              'flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors text-sm',
              selectedGroupId === group.id
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-background text-text-secondary'
            )}
            onClick={() => setSelectedGroupId(selectedGroupId === group.id ? null : group.id)}
          >
            {group.children && group.children.length > 0 ? (
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 flex-shrink-0" />
            )}
            <FolderTree className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{group.name}</span>
            {group.server_count !== undefined && group.server_count > 0 && (
              <span className="ml-auto text-xs text-text-secondary">({group.server_count})</span>
            )}
          </div>
          {group.children && group.children.length > 0 && (
            <GroupTree groups={group.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );

  const renderTabContent = () => {
    if (activeTab === 'servers') {
      return (
        <>
          {/* 工具栏 */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setShowGroups(!showGroups)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border',
                showGroups
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border bg-surface text-text-secondary hover:text-text-primary'
              )}
            >
              <FolderTree className="w-4 h-4" />
              {t('servers.toolbar.groups')}
            </button>
            <button
              onClick={handleCollectAll}
              disabled={isCollecting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-4 h-4', isCollecting && 'animate-spin')} />
              {t('servers.toolbar.collectAllInfo')}
            </button>
            <button
              onClick={handleCollectAllMetrics}
              disabled={isCollectingMetrics}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-4 h-4', isCollectingMetrics && 'animate-spin')} />
              {t('servers.toolbar.collectAllMetrics')}
            </button>
            <button
              onClick={() => { setIsImportModalOpen(true); setImportResult(null); setImportData(''); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <Upload className="w-4 h-4" />
              {t('servers.toolbar.bulkImport')}
            </button>
            <button
              onClick={() => { setEditingGroup(null); setGroupFormData({ name: '', description: '', parent_id: '' }); setIsGroupModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              {t('servers.toolbar.newGroup')}
            </button>
          </div>

          <div className="flex gap-4">
            {/* 分组侧边栏 */}
            {showGroups && (
              <div className="w-56 flex-shrink-0 bg-surface border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-text-primary">{t('servers.groups.title')}</h3>
                  <button
                    onClick={() => setSelectedGroupId(null)}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    {t('servers.groups.clearFilter')}
                  </button>
                </div>
                {groupsData && groupsData.length > 0 ? (
                  <GroupTree groups={groupsData} />
                ) : (
                  <p className="text-xs text-text-secondary py-4 text-center">{t('servers.groups.empty')}</p>
                )}
              </div>
            )}

            {/* 服务器列表 */}
            <div className="flex-1">
              {/* 标签筛选器 */}
              {allTags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => { setSelectedTag(null); setSelectedGroupId(null); }}
                    className={clsx(
                      'px-3 py-1 rounded-full text-sm transition-colors',
                      !selectedTag && !selectedGroupId
                        ? 'bg-primary text-white'
                        : 'bg-background border border-border text-text-secondary hover:bg-surface'
                    )}
                  >
                    {t('common.all')}
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => { setSelectedTag(selectedTag === tag ? null : tag); setSelectedGroupId(null); }}
                      className={clsx(
                        'px-3 py-1 rounded-full text-sm transition-colors',
                        selectedTag === tag
                          ? 'bg-primary text-white'
                          : 'bg-background border border-border text-text-secondary hover:bg-surface'
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-surface border border-border rounded-lg p-4 animate-pulse">
                      <div className="h-4 bg-border rounded w-1/2 mb-2" />
                      <div className="h-3 bg-border rounded w-3/4" />
                    </div>
                  ))
                ) : filteredServers.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12 text-text-secondary">
                    <Server className="w-12 h-12 mb-4 opacity-50" />
                    <p>
                      {selectedTag
                        ? t('servers.empty.byTag', { tag: selectedTag })
                        : selectedGroupId
                          ? t('servers.empty.byGroup')
                          : t('servers.empty.default')}
                    </p>
                  </div>
                ) : filteredServers.map((server) => (
                  <div key={server.id} className={clsx(
                    'relative bg-surface border rounded-lg p-4 min-w-0 overflow-hidden',
                    server.os_type === 'linux' 
                      ? 'border-yellow-500/30' 
                      : server.os_type === 'windows' 
                        ? 'border-blue-500/30' 
                        : 'border-border'
                  )}>
                    {/* 操作系统左侧标识条 */}
                    <div className={clsx(
                      'absolute left-0 top-0 bottom-0 w-1',
                      server.os_type === 'linux' 
                        ? 'bg-gradient-to-b from-yellow-500 to-orange-500' 
                        : server.os_type === 'windows' 
                          ? 'bg-gradient-to-b from-blue-500 to-cyan-500' 
                          : 'bg-gradient-to-b from-text-tertiary/50 to-text-tertiary/30'
                    )} />
                    
                    <div className="flex items-start justify-between mb-3 min-w-0 pl-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={clsx(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          server.os_type === 'linux' 
                            ? 'bg-yellow-500/10' 
                            : server.os_type === 'windows' 
                              ? 'bg-blue-500/10' 
                              : 'bg-primary/10'
                        )}>
                          <Server className={clsx('w-4 h-4',
                            server.os_type === 'linux' 
                              ? 'text-yellow-500' 
                              : server.os_type === 'windows' 
                                ? 'text-blue-500' 
                                : 'text-primary'
                          )} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-text-primary truncate">{server.name}</h3>
                          <p className="text-xs text-text-secondary truncate">{server.hostname}:{server.port}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {server.os_type === 'windows' && (
                          <button
                            onClick={() => navigate(`/remote-desktop/${server.id}`)}
                            className="p-1 hover:bg-background rounded transition-colors"
                            title={t('servers.actions.remoteDesktop')}
                          >
                            <MonitorPlay className="w-4 h-4 text-text-secondary" />
                          </button>
                        )}
                        <button
                          onClick={() => handleTestConnection(server)}
                          className="p-1 hover:bg-background rounded transition-colors"
                          title={t('servers.actions.testConnection')}
                        >
                          <Wifi className="w-4 h-4 text-text-secondary" />
                        </button>
                        <button
                          onClick={() => handleCollectInfo(server)}
                          disabled={isCollecting}
                          className="p-1 hover:bg-background rounded transition-colors disabled:opacity-50"
                          title={t('servers.actions.collectInfo')}
                        >
                          <RefreshCw className={clsx('w-4 h-4 text-text-secondary', isCollecting && 'animate-spin')} />
                        </button>
                        <button
                          onClick={() => handleCollectMetrics(server)}
                          disabled={isCollectingMetrics}
                          className="p-1 hover:bg-background rounded transition-colors disabled:opacity-50"
                          title={t('servers.actions.collectMetrics')}
                        >
                          <Monitor className={clsx('w-4 h-4 text-text-secondary', isCollectingMetrics && 'animate-spin')} />
                        </button>
                        <button
                          onClick={() => {
                            setPendingDeleteServer({ id: server.id, name: server.name });
                            setIsDeleteConfirmOpen(true);
                          }}
                          className="p-1 hover:bg-background rounded transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-4 h-4 text-status-failed" />
                        </button>
                        <button
                          onClick={() => handleEdit(server)}
                          className="p-1 hover:bg-background rounded transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit className="w-4 h-4 text-text-secondary" />
                        </button>
                      </div>
                    </div>
                    {server.description && (
                      <p className="text-xs text-text-secondary mb-3">{server.description}</p>
                    )}
                    
                    {/* 主机扩展信息 */}
                    {(server.os || server.cpu_cores || server.memory_gb || server.disk_gb) && (
                      <div className="mb-3 p-2 bg-background rounded-lg">
                        {server.os && (
                          <div className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
                            <Monitor className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{server.os}</span>
                          </div>
                        )}
                        {(server.cpu_cores !== undefined || server.memory_gb !== undefined || server.disk_gb !== undefined) && (
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {server.cpu_cores !== undefined && (
                              <div className="flex items-center gap-1.5 text-text-secondary">
                                <Cpu className="w-3 h-3 flex-shrink-0" />
                                <span>{t('servers.cpuCores', { count: server.cpu_cores })}</span>
                              </div>
                            )}
                            {server.memory_gb !== undefined && (
                              <div className="flex items-center gap-1.5 text-text-secondary">
                                <MemoryStick className="w-3 h-3 flex-shrink-0" />
                                <span>{server.memory_gb} GB</span>
                              </div>
                            )}
                            {server.disk_gb !== undefined && (
                              <div className="flex items-center gap-1.5 text-text-secondary">
                                <HardDrive className="w-3 h-3 flex-shrink-0" />
                                <span>{server.disk_gb} GB</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 分组展示 */}
                    {server.groups && server.groups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {server.groups.map((g) => (
                          <span key={g.id} className="px-2 py-0.5 bg-purple-500/10 text-purple-500 text-xs rounded-full flex items-center gap-1">
                            <FolderTree className="w-2.5 h-2.5" />
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 标签展示 */}
                    {server.tags && server.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {server.tags.map((tag: string) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 mb-3">
                      {server.last_connected ? (
                        <span className="flex items-center gap-1 text-xs text-text-secondary">
                          <CheckCircle2 className="w-3 h-3 text-status-success" />
                          {t('servers.lastConnected')}: {new Date(server.last_connected).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-text-secondary">
                          <AlertCircle className="w-3 h-3 text-status-warning" />
                          {t('servers.neverConnected')}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <button
                        onClick={() => {
                          setAiCommandServer(server);
                          setAiPrompt('');
                          setAiGeneratedCommand('');
                          setAiCommandExplanation('');
                          setAiGenerationError('');
                          setShowAiCommandConfirm(false);
                          if (agents) {
                            const cmdAgent = agents.find(a =>
                              a.enabled === 1 && (
                                matchesAny(a.name, AI_AGENT_MATCHERS.commandGeneration) ||
                                matchesAny(a.category, AI_AGENT_MATCHERS.commandGeneration)
                              )
                            );
                            const serverAgent = agents.find(a =>
                              a.enabled === 1 && (
                                matchesAny(a.category, AI_AGENT_MATCHERS.server) ||
                                matchesAny(a.name, AI_AGENT_MATCHERS.server)
                              )
                            );
                            const firstAgent = agents.find(a => a.enabled === 1);
                            setSelectedAiAgent(cmdAgent || serverAgent || firstAgent || null);
                          }
                          setIsAiCommandModalOpen(true);
                        }}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 rounded-lg text-xs font-medium text-purple-300 whitespace-nowrap hover:from-purple-600/30 hover:to-blue-600/30 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>{t('servers.actions.aiExecute')}</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedServer(server);
                          setCommandResult(null);
                        }}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 bg-surface border border-border rounded-lg text-xs text-text-primary whitespace-nowrap hover:bg-background transition-colors"
                      >
                        <Terminal className="w-4 h-4" />
                        <span>{t('servers.actions.executeCommand')}</span>
                      </button>
                      <button
                        onClick={() => handleRunCompliance(server)}
                        className="flex flex-col items-center justify-center gap-1 px-2 py-2.5 bg-surface border border-border rounded-lg text-xs text-text-primary whitespace-nowrap hover:bg-background transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{t('servers.actions.complianceCheck')}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => {
                          setSelectedServer(server);
                          setActiveTab('command-history');
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>{t('servers.tabs.commandHistory')}</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedServer(server);
                          setActiveTab('compliance-history');
                        }}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t('servers.tabs.complianceHistory')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      );
    } else if (activeTab === 'compliance' && selectedServer) {
      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-text-primary">{t('servers.compliance.resultsTitle')}</h2>
              <p className="text-sm text-text-secondary">{selectedServer.name} - {selectedServer.hostname}</p>
            </div>
            {isRunningCompliance && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                {t('servers.compliance.running')}
              </div>
            )}
          </div>

          {/* 合规检查选项 */}
          <div className="mb-6 p-4 bg-background rounded-lg border border-border">
            <h3 className="text-sm font-medium text-text-primary mb-4">{t('servers.compliance.options')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface/50 transition-colors border border-transparent hover:border-border">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={complianceOptions.useAI}
                    onChange={(e) => {
                      setComplianceOptions(prev => ({
                        ...prev,
                        useAI: e.target.checked
                      }));
                    }}
                    disabled={isRunningCompliance}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-surface border-2 border-border rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all cursor-pointer">
                    <div className="w-4 h-4 bg-white rounded-full shadow-md absolute top-1 left-1 peer-checked:translate-x-4 transition-transform"></div>
                  </div>
                </div>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{t('servers.compliance.aiAnalysis')}</span>
                    {complianceOptions.useAI && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{t('servers.compliance.recommended')}</span>
                    )}
                  </div>
                  <span className="text-xs text-text-tertiary mt-0.5">
                    {complianceOptions.useAI 
                      ? t('servers.compliance.aiDesc')
                      : t('servers.compliance.fastDesc')
                    }
                  </span>
                </div>
              </label>
              <div className="flex items-center gap-3 p-2 rounded-lg">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">{t('servers.compliance.concurrency')}</span>
                  <span className="text-xs text-text-secondary mt-0.5">{t('servers.compliance.concurrencyDesc')}</span>
                </div>
                <select
                  value={complianceOptions.concurrency}
                  onChange={(e) => {
                    setComplianceOptions(prev => ({
                      ...prev,
                      concurrency: parseInt(e.target.value)
                    }));
                  }}
                  disabled={isRunningCompliance}
                  className="ml-auto w-28 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary font-medium"
                >
                  <option value={3}>{t('servers.compliance.speed.slow')}</option>
                  <option value={5}>{t('servers.compliance.speed.recommended')}</option>
                  <option value={8}>{t('servers.compliance.speed.fast')}</option>
                  <option value={10}>{t('servers.compliance.speed.fastest')}</option>
                </select>
              </div>
            </div>
          </div>

          {complianceResults ? (
            <div className="space-y-4">
              {Object.entries(complianceResults).map(([checkName, result]) => (
                <div key={checkName} className="bg-background rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-text-primary">
                      {checkName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h4>
                    <span className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      result.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                    )}>
                      {result.success ? t('common.success') : t('common.failed')}
                    </span>
                  </div>
                  
                  {/* AI 分析结果 */}
                  {result.aiAnalysis && (
                    <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 text-primary">🤖</div>
                        <span className="text-sm font-medium text-primary">{t('servers.compliance.aiSuggestions')}</span>
                      </div>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap">{result.aiAnalysis}</p>
                    </div>
                  )}
                  
                  <details className="mt-2">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      {t('servers.compliance.viewRaw')}
                    </summary>
                    <div className="mt-2">
                      <div className="text-sm text-text-secondary mb-1">{t('servers.command.command')}: <code className="font-mono text-xs bg-surface px-1 rounded">{result.command}</code></div>
                      {result.stdout && (
                        <div className="mt-2">
                          <p className="text-xs text-text-secondary mb-1">{t('common.output')}:</p>
                          <pre className="bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-40 overflow-y-auto">
                            {result.stdout}
                          </pre>
                        </div>
                      )}
                      {result.stderr && (
                        <div className="mt-2">
                          <p className="text-xs text-status-warning mb-1">{t('common.error')}:</p>
                          <pre className="bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-40 overflow-y-auto">
                            {result.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-text-secondary">
              <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('servers.compliance.empty')}</p>
            </div>
          )}

          {/* 重新检查按钮 */}
          {complianceResults && (
            <div className="mt-6 pt-6 border-t border-border flex justify-center">
              <button
                onClick={() => handleRunCompliance(selectedServer)}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Settings className="w-4 h-4" />
                {t('servers.compliance.rerun')}
              </button>
            </div>
          )}
        </div>
      );
    } else if (activeTab === 'command-history' && selectedServer) {
      const handleExportCommandHistory = async () => {
        try {
          const response = await api.get(`/api/servers/${selectedServer.id}/command-history/export`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `command-history-${selectedServer.id}-${Date.now()}.json`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          console.error('Export failed:', error);
        }
      };

      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">{t('servers.history.commandTitle', { name: selectedServer.name })}</h2>
            <button
              onClick={handleExportCommandHistory}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span>📥</span>
              {t('servers.history.export')}
            </button>
          </div>
          <div className="space-y-4">
            {commandHistory?.map((item) => (
              <div key={item.id} className="bg-background rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary">
                      {new Date(item.executed_at).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}
                    </span>
                  </div>
                  <span className={clsx(
                    'px-2 py-1 rounded text-xs font-medium',
                    item.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                  )}>
                    {item.success ? t('common.success') : t('common.failed')}
                  </span>
                </div>
                <div className="mb-2">
                  <code className="font-mono text-sm bg-surface px-2 py-1 rounded text-text-primary">
                    {item.command}
                  </code>
                </div>
                {item.stdout && (
                  <details className="mt-2">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      {t('servers.history.outputChars', { count: item.stdout.length })}
                    </summary>
                    <pre className="mt-2 bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-40 overflow-y-auto">
                      {item.stdout}
                    </pre>
                  </details>
                )}
                {item.stderr && (
                  <details className="mt-2">
                    <summary className="text-xs text-status-warning cursor-pointer hover:text-text-primary">
                      {t('servers.history.errorChars', { count: item.stderr.length })}
                    </summary>
                    <pre className="mt-2 bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-40 overflow-y-auto">
                      {item.stderr}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {(!commandHistory || commandHistory.length === 0) && (
              <div className="text-center py-12 text-text-secondary">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('servers.history.noCommands')}</p>
              </div>
            )}
          </div>
        </div>
      );
    } else if (activeTab === 'compliance-history' && selectedServer) {
      const handleExportComplianceHistory = async () => {
        try {
          const response = await api.get(`/api/servers/${selectedServer.id}/compliance-history/export`, {
            responseType: 'blob'
          });
          const url = window.URL.createObjectURL(new Blob([response.data]));
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `compliance-history-${selectedServer.id}-${Date.now()}.json`);
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          console.error('Export failed:', error);
        }
      };

      return (
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-primary">{t('servers.history.complianceTitle', { name: selectedServer.name })}</h2>
            <button
              onClick={handleExportComplianceHistory}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <span>📥</span>
              {t('servers.history.export')}
            </button>
          </div>
          <div className="space-y-4">
            {complianceHistory?.map((check) => (
              <div key={check.id} className="bg-background rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-text-primary">{check.check_name}</h4>
                  <span className={clsx(
                    'px-2 py-1 rounded text-xs font-medium',
                    check.status === 'completed' ? 'bg-status-success/10 text-status-success' : 
                    check.status === 'running' ? 'bg-status-running/10 text-status-running' : 
                    'bg-status-failed/10 text-status-failed'
                  )}>
                    {check.status === 'completed' ? t('status.task.completed') : check.status === 'running' ? t('status.task.running') : t('common.failed')}
                  </span>
                </div>
                <div className="text-xs text-text-secondary space-y-1">
                  <p>{t('servers.history.startedAt')}: {check.started_at ? new Date(check.started_at).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US') : '-'}</p>
                  <p>{t('servers.history.completedAt')}: {check.completed_at ? new Date(check.completed_at).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US') : '-'}</p>
                </div>
                {check.check_results && (
                  <details className="mt-3">
                    <summary className="text-xs text-text-secondary cursor-pointer hover:text-text-primary">
                      {t('servers.history.viewResult')}
                    </summary>
                    <pre className="mt-2 bg-surface p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-60 overflow-y-auto">
                      {check.check_results}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {(!complianceHistory || complianceHistory.length === 0) && (
              <div className="text-center py-12 text-text-secondary">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('servers.history.noCompliance')}</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">{t('servers.title')}</h1>
            <p className="text-text-secondary">{t('servers.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <ImportExport resourceType="servers" onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['servers'] })} />
            <button
              onClick={() => {
                resetForm();
                setSelectedServer(null);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('servers.add')}
            </button>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-text-primary mb-2">{t('servers.guide.title')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-text-secondary">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-gradient-to-b from-yellow-500 to-orange-500 flex-shrink-0" />
                  <span><strong>{t('servers.guide.linuxTitle')}</strong>{t('servers.guide.linuxDesc')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-gradient-to-b from-blue-500 to-cyan-500 flex-shrink-0" />
                  <span><strong>{t('servers.guide.windowsTitle')}</strong>{t('servers.guide.windowsDesc')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3 h-3 flex-shrink-0" />
                  <span><strong>{t('servers.guide.collectTitle')}</strong>{t('servers.guide.collectDesc')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 flex-shrink-0" />
                  <span><strong>{t('servers.guide.commandTitle')}</strong>{t('servers.guide.commandDesc')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 标签页导航 */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => {
              setActiveTab('servers');
              setSelectedServer(null);
            }}
            className={clsx(
              'px-4 py-2 border-b-2 text-sm transition-colors',
              activeTab === 'servers'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            )}
          >
            {t('servers.tabs.list')}
          </button>
          {selectedServer && (
            <>
              <button
                onClick={() => setActiveTab('compliance')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'compliance'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                {t('servers.tabs.compliance')}
              </button>
              <button
                onClick={() => setActiveTab('command-history')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'command-history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                {t('servers.tabs.commandHistory')}
              </button>
              <button
                onClick={() => setActiveTab('compliance-history')}
                className={clsx(
                  'px-4 py-2 border-b-2 text-sm transition-colors',
                  activeTab === 'compliance-history'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                )}
              >
                {t('servers.tabs.complianceHistory')}
              </button>
            </>
          )}
        </div>

        {/* 内容区域 */}
        {renderTabContent()}

        {/* 命令执行模态框 */}
        {selectedServer && (activeTab === 'servers' || activeTab === 'compliance') && commandResult !== null && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">{t('servers.command.resultTitle')}</h3>
              <button
                onClick={() => setCommandResult(null)}
                className="p-1 hover:bg-background rounded transition-colors"
              >
                <Trash2 className="w-4 h-4 text-text-secondary" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-secondary mb-1">{t('servers.command.executedCommand')}:</p>
                <code className="font-mono text-sm bg-background px-2 py-1 rounded text-text-primary">
                  {commandResult.command}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">{t('common.status')}:</span>
                <span className={clsx(
                  'px-2 py-1 rounded text-xs font-medium',
                  commandResult.success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                )}>
                  {commandResult.success ? t('common.success') : t('common.failed')}
                </span>
                <span className="text-xs text-text-secondary ml-4">
                  {t('servers.command.duration', { duration: commandResult.duration })}
                </span>
              </div>
              {commandResult.stdout && (
                <div>
                  <p className="text-xs text-text-secondary mb-1">{t('common.output')}:</p>
                  <pre className="bg-background p-3 rounded text-xs overflow-x-auto text-text-primary font-mono max-h-60 overflow-y-auto">
                    {commandResult.stdout}
                  </pre>
                </div>
              )}
              {commandResult.stderr && (
                <div>
                  <p className="text-xs text-status-warning mb-1">{t('common.error')}:</p>
                  <pre className="bg-status-failed/5 p-3 rounded text-xs overflow-x-auto text-status-failed font-mono max-h-60 overflow-y-auto">
                    {commandResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 快速命令执行区域 */}
        {selectedServer && (activeTab === 'servers' || activeTab === 'compliance') && (
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {t('servers.command.runOnServer', { name: selectedServer.name })}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.command.command')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder={t('servers.command.placeholder')}
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    disabled={isExecuting}
                  />
                  <button
                    onClick={handleExecuteCommand}
                    disabled={!command || isExecuting}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t('servers.command.executing')}
                      </>
                    ) : (
                      <>
                        <Terminal className="w-4 h-4" />
                        {t('servers.command.execute')}
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-text-secondary">{t('servers.command.commonCommands')}:</span>
                {['uname -a', 'df -h', 'free -h', 'uptime', 'whoami', 'ps aux'].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => setCommand(cmd)}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 添加/编辑服务器模态框 */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-text-primary mb-6">
                {selectedServer ? t('servers.modal.editTitle') : t('servers.modal.addTitle')}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.name')} *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('servers.form.namePlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.hostname')} *</label>
                    <input
                      type="text"
                      value={formData.hostname}
                      onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                      placeholder={t('servers.form.hostnamePlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.port')}</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
                      placeholder="22"
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.osType')}</label>
                    <select
                      value={formData.os_type}
                      onChange={(e) => setFormData({ ...formData, os_type: e.target.value as 'linux' | 'windows' })}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    >
                      <option value="linux">Linux</option>
                      <option value="windows">Windows</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.username')} *</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder={t('servers.form.usernamePlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="use_ssh_key"
                    checked={formData.use_ssh_key}
                    onChange={(e) => setFormData({ ...formData, use_ssh_key: e.target.checked })}
                    className="rounded border-border"
                  />
                  <label htmlFor="use_ssh_key" className="text-sm text-text-secondary">{t('servers.form.useCredential')}</label>
                </div>

                {!formData.use_ssh_key ? (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.password')}</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={selectedServer ? t('servers.form.keepUnchanged') : t('servers.form.passwordPlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.credential')}</label>
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-3.5 h-3.5 text-text-tertiary" />
                        <span className="text-xs text-text-tertiary">{t('servers.form.credentialSelectHelp')}</span>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                        <input
                          type="text"
                          value={sshKeySearchQuery}
                          onChange={(e) => setSshKeySearchQuery(e.target.value)}
                          onFocus={() => setShowSshKeyDropdown(true)}
                          onBlur={() => {
                            setTimeout(() => setShowSshKeyDropdown(false), 200);
                          }}
                          placeholder={t('servers.form.credentialSearchPlaceholder')}
                          className="w-full pl-10 pr-10 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary text-sm"
                        />
                        {selectedCredential && (
                          <button
                            type="button"
                            title={t('servers.form.clearCredential')}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSshKeyId('');
                              setSshKeySearchQuery('');
                              setFormData({ ...formData, ssh_key_id: '', private_key: '' });
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-text-primary transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {showSshKeyDropdown && (
                        <div className="mt-1 max-h-56 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg z-10">
                          {filteredSshKeys.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-text-tertiary text-center">
                              {t('servers.form.noCredentialMatch')}
                            </div>
                          ) : (
                            filteredSshKeys.map((credential) => (
                              <button
                                key={credential.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedSshKeyId(credential.id);
                                  setSshKeySearchQuery(getCredentialSearchLabel(credential));
                                  setFormData({
                                    ...formData,
                                    ssh_key_id: credential.id,
                                    username: credential.auth_type === 'password' && credential.username ? credential.username : formData.username,
                                    password: '',
                                    private_key: '',
                                  });
                                  setShowSshKeyDropdown(false);
                                }}
                                className={clsx(
                                  'w-full px-4 py-2.5 text-left hover:bg-primary/5 transition-colors border-b border-border/50 last:border-b-0',
                                  selectedSshKeyId === credential.id && 'bg-primary/10'
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {credential.auth_type === 'password' ? (
                                      <User className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                                    ) : (
                                      <Key className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                                    )}
                                    <span className="text-sm text-text-primary font-medium truncate">{credential.name}</span>
                                  </div>
                                  <span className="text-xs text-text-tertiary flex-shrink-0">{getCredentialTypeLabel(credential)}</span>
                                </div>
                                {credential.auth_type === 'password' && credential.username && (
                                  <div className="text-xs text-text-tertiary mt-0.5">
                                    {t('servers.form.username')}: {credential.username}
                                  </div>
                                )}
                                {credential.fingerprint && (
                                  <div className="text-xs text-text-tertiary mt-0.5 font-mono">
                                    {credential.fingerprint.slice(0, 30)}...
                                  </div>
                                )}
                                {credential.usage_count > 0 && (
                                  <div className="text-xs text-status-success mt-0.5">
                                    {t('servers.form.credentialUsage', { count: credential.usage_count })}
                                  </div>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      {selectedCredential && !showSshKeyDropdown && (
                        <div className="mt-2 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2">
                          <div className="flex items-center gap-1.5 text-xs text-status-success">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t('servers.form.selectedCredential', { name: selectedCredential.name, type: getCredentialTypeLabel(selectedCredential) })}</span>
                          </div>
                          <p className="mt-1 text-xs text-text-tertiary">
                            {t('servers.form.credentialRuntimeHelp')}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => { resetForm(); setIsModalOpen(false); navigate('/ssh-keys'); }}
                          className="text-xs text-primary hover:underline"
                        >
                          {t('servers.form.manageCredentials')}
                        </button>
                      </div>
                    </div>

                    {!selectedCredential && (
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-2">{t('servers.form.manualPrivateKey')}</label>
                        <textarea
                          value={formData.private_key}
                          onChange={(e) => {
                            setSelectedSshKeyId('');
                            setSshKeySearchQuery('');
                            setFormData({ ...formData, ssh_key_id: '', private_key: e.target.value });
                          }}
                          placeholder={selectedServer ? t('servers.form.keepUnchanged') : t('servers.form.privateKeyPlaceholder')}
                          rows={6}
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary font-mono text-sm"
                        />
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('servers.form.privateKeyLegacyHelp')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('servers.form.descriptionPlaceholder')}
                    rows={3}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t('common.tags')}
                  </label>
                  {/* 已选标签展示 */}
                  {parseCurrentTags().length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {parseCurrentTags().map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                    {/* 标签输入框 + 下拉建议 */}
                    <div className="relative">
                      <input
                        ref={tagInputRef}
                        type="text"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        onFocus={() => setTagDropdownOpen(true)}
                        onBlur={() => {
                          // 延迟关闭，让下拉按钮的onClick先触发
                          setTimeout(() => setTagDropdownOpen(false), 200);
                        }}
                        placeholder={t('servers.form.tagsPlaceholder')}
                        className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      />
                      {/* 下拉建议框 */}
                      {tagDropdownOpen && filteredTagSuggestions().length > 0 && (
                        <div
                          ref={tagDropdownRef}
                          className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto animate-fade-in"
                        >
                          <div className="px-3 py-2 text-xs text-text-tertiary border-b border-border">
                            {t('servers.form.selectExistingTags')}
                          </div>
                          {filteredTagSuggestions().map((tag: string) => (
                            <button
                              key={tag}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); addTagToInput(tag); }}
                              className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full bg-primary/50 flex-shrink-0" />
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  {allTags.length === 0 && (
                    <p className="mt-1 text-xs text-text-tertiary">{t('servers.form.tagsEmptyHelp')}</p>
                  )}
                </div>

                {formData.os_type === 'windows' && (
                  <div className="pt-2 border-t border-border">
                    <h4 className="text-sm font-medium text-text-primary mb-3">{t('servers.form.vncConfig')}</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.vncPort')}</label>
                        <input
                          type="number"
                          value={formData.vnc_port}
                          onChange={(e) => setFormData({ ...formData, vnc_port: parseInt(e.target.value) || 5900 })}
                          placeholder="5900"
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.vncPassword')}</label>
                        <input
                          type="password"
                          value={formData.vnc_password}
                          onChange={(e) => setFormData({ ...formData, vnc_password: e.target.value })}
                          placeholder={selectedServer ? t('servers.form.keepUnchanged') : t('servers.form.vncPassword')}
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                      setSelectedServer(null);
                    }}
                    className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedServer ? t('servers.form.saveChanges') : t('servers.add')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 批量导入模态框 */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-text-primary mb-4">{t('servers.import.title')}</h3>
              <p className="text-sm text-text-secondary mb-4">{t('servers.import.desc')}</p>
              <div className="mb-4 p-3 bg-background rounded-lg">
                <p className="text-xs text-text-secondary font-mono mb-2">{t('servers.import.example')}:</p>
                <pre className="text-xs text-text-secondary font-mono overflow-x-auto">{`{"name":"Web-01","hostname":"192.168.1.10","port":22,"username":"root","password":"xxx","use_ssh_key":0,"description":"production server","tags":"prod,web"}`}</pre>
              </div>
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder={t('servers.import.placeholder')}
                rows={8}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary font-mono text-sm"
              />
              {importResult && (
                <div className="mt-4 p-4 bg-background rounded-lg">
                  <h4 className="font-medium text-text-primary mb-2">{t('servers.import.result')}</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <span className="text-2xl font-bold text-status-success">{importResult.success}</span>
                      <p className="text-xs text-text-secondary">{t('common.success')}</p>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-status-failed">{importResult.failed}</span>
                      <p className="text-xs text-text-secondary">{t('common.failed')}</p>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-text-secondary">{importResult.skipped}</span>
                      <p className="text-xs text-text-secondary">{t('servers.import.skipped')}</p>
                    </div>
                  </div>
                  {importResult.details && importResult.details.length > 0 && (
                    <div className="mt-3 max-h-40 overflow-y-auto">
                      {importResult.details.map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1 text-xs">
                          <span>{d.name} ({d.hostname})</span>
                          <span className={d.status === 'success' ? 'text-status-success' : d.status === 'duplicate' ? 'text-text-secondary' : 'text-status-failed'}>
                            {d.status === 'success' ? t('servers.import.detailSuccess') : d.status === 'duplicate' ? t('servers.import.detailSkipped') : `✗ ${d.error}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.close')}
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importData}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  {t('servers.import.import')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 分组管理模态框 */}
        {isGroupModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-xl font-bold text-text-primary mb-6">
                {editingGroup ? t('servers.groups.editTitle') : t('servers.groups.newTitle')}
              </h3>
              <form onSubmit={handleGroupSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.groups.name')} *</label>
                  <input
                    type="text"
                    value={groupFormData.name}
                    onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                    placeholder={t('servers.groups.namePlaceholder')}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.groups.parent')}</label>
                  <select
                    value={groupFormData.parent_id}
                    onChange={(e) => setGroupFormData({ ...groupFormData, parent_id: e.target.value })}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  >
                    <option value="">{t('servers.groups.noParent')}</option>
                    {(groupsData || []).map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.form.description')}</label>
                  <textarea
                    value={groupFormData.description}
                    onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })}
                    placeholder={t('servers.groups.descriptionPlaceholder')}
                    rows={3}
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setIsGroupModalOpen(false); setEditingGroup(null); }}
                    className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {editingGroup ? t('servers.form.saveChanges') : t('servers.groups.create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AI command generation modal */}
        {isAiCommandModalOpen && aiCommandServer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface rounded-xl p-8 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center">
                    <Bot className="w-5 h-5 text-text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{t('servers.aiCommand.title')}</h3>
                    <p className="text-sm text-text-secondary mt-1.5">
                      {aiCommandServer.name} ({aiCommandServer.hostname})
                      {selectedAiAgent && (
                        <span className="ml-2 text-text-tertiary">
                          {t('servers.aiCommand.defaultAgentPrefix')} <span className="font-medium text-text-secondary">{selectedAiAgent.name} Agent</span>
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsAiCommandModalOpen(false);
                    setAiPrompt('');
                    setAiGeneratedCommand('');
                    setAiCommandExplanation('');
                    setAiGenerationError('');
                    setShowAiCommandConfirm(false);
                  }}
                  className="p-2 hover:bg-background rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>

              {/* No Agent hint */}
              {!selectedAiAgent && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-300 font-medium">
                    {t('servers.aiCommand.noAgent')}
                  </p>
                </div>
              )}

              {/* Generation error hint */}
              {aiGenerationError && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-300 font-medium">{aiGenerationError}</p>
                </div>
              )}

              {/* OS information */}
              <div className="mb-6 p-3 bg-background border border-border rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Server className="w-4 h-4 text-text-secondary" />
                    <span className="text-text-secondary">{t('servers.aiCommand.targetOs')}</span>
                    <span className="text-text-primary font-medium">
                      {aiCommandServer?.os || aiCommandServer?.os_type || t('servers.aiCommand.defaultLinux')}
                    </span>
                  </div>
                  {!aiCommandServer?.os && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t('servers.aiCommand.collectInfoHint')}
                    </span>
                  )}
                </div>
              </div>

              {/* Input prompt */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('servers.aiCommand.operationLabel')}</label>
                <div className="relative">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={t('servers.aiCommand.operationPlaceholder')}
                    rows={3}
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:border-purple-500 text-text-primary resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAiGenerateCommand();
                      }
                    }}
                  />
                  <button
                    onClick={handleAiGenerateCommand}
                    disabled={isAiGenerating || !aiPrompt.trim()}
                    className="absolute right-3 bottom-3 px-4 py-1.5 bg-text-primary text-surface rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAiGenerating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        {t('servers.aiCommand.generating')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {t('servers.aiCommand.generate')}
                      </>
                    )}
                  </button>
                </div>
                {/* Quick prompts by OS type */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(aiCommandServer?.os_type === 'windows' ? [
                    t('servers.aiCommand.tips.windows.diskUsage'),
                    t('servers.aiCommand.tips.windows.memoryTop'),
                    t('servers.aiCommand.tips.windows.ports'),
                    t('servers.aiCommand.tips.windows.iis'),
                    t('servers.aiCommand.tips.windows.load'),
                    t('servers.aiCommand.tips.windows.eventLog'),
                    t('servers.aiCommand.tips.windows.loggedInUsers'),
                    t('servers.aiCommand.tips.windows.cleanTemp'),
                    t('servers.aiCommand.tips.windows.services')
                  ] : [
                    t('servers.aiCommand.tips.linux.diskUsage'),
                    t('servers.aiCommand.tips.linux.memoryTop'),
                    t('servers.aiCommand.tips.linux.ports'),
                    t('servers.aiCommand.tips.linux.nginx'),
                    t('servers.aiCommand.tips.linux.load'),
                    t('servers.aiCommand.tips.linux.syslog'),
                    t('servers.aiCommand.tips.linux.loggedInUsers'),
                    t('servers.aiCommand.tips.linux.cleanTemp'),
                    t('servers.aiCommand.tips.linux.docker')
                  ]).map((tip) => (
                    <button
                      key={tip}
                      onClick={() => setAiPrompt(tip)}
                      className="px-4 py-1.5 bg-surface/80 border border-border/50 text-text-primary rounded-full text-sm hover:bg-surface hover:border-purple-500/40 transition-colors"
                    >
                      {tip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成的命令 */}
              {aiGeneratedCommand && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-text-secondary">{t('servers.aiCommand.generatedCommand')}</label>
                    <button
                      onClick={() => navigator.clipboard.writeText(aiGeneratedCommand)}
                      className="text-xs text-text-tertiary hover:text-text-secondary"
                    >
                      {t('servers.aiCommand.copy')}
                    </button>
                  </div>
                  <textarea
                    value={aiGeneratedCommand}
                    onChange={(e) => setAiGeneratedCommand(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-black/80 border border-border rounded-lg font-mono text-sm text-green-400 focus:outline-none focus:border-purple-500 resize-y"
                  />
                  {aiCommandExplanation && (
                    <div className="mt-3 p-3 bg-yellow-500/20 border border-yellow-500/40 rounded-lg">
                      <p className="text-sm text-yellow-300 dark:text-yellow-200 font-medium">
                        <strong>{t('servers.aiCommand.explanationLabel')}</strong>{aiCommandExplanation}
                      </p>
                    </div>
                  )}
                  <div className="mt-3 p-3 bg-red-500/20 border border-red-500/40 rounded-lg">
                    <p className="text-sm text-red-300 dark:text-red-200 font-medium">
                      <strong>{t('servers.aiCommand.warningLabel')}</strong>{t('servers.aiCommand.warning')}
                    </p>
                  </div>
                </div>
              )}

              {/* 按钮组 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsAiCommandModalOpen(false);
                    setAiPrompt('');
                    setAiGeneratedCommand('');
                    setAiCommandExplanation('');
                    setAiGenerationError('');
                    setShowAiCommandConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                {aiGeneratedCommand && (
                  <>
                    <button
                      onClick={() => {
                        setAiGeneratedCommand('');
                        setAiCommandExplanation('');
                        setAiGenerationError('');
                        handleAiGenerateCommand();
                      }}
                      disabled={isAiGenerating}
                      className="flex-1 px-4 py-2 bg-surface border border-border text-text-secondary rounded-lg hover:bg-background transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={clsx('w-4 h-4', isAiGenerating && 'animate-spin')} />
                      {t('servers.aiCommand.regenerate')}
                    </button>
                    <button
                      onClick={handleExecuteAiCommand}
                      className="flex-1 px-4 py-2 bg-text-primary text-surface rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      <Terminal className="w-4 h-4" />
                      {t('servers.aiCommand.confirmAndExecute')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI command execution confirmation */}
        {showAiCommandConfirm && aiCommandServer && aiGeneratedCommand && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
            <div className="bg-surface rounded-xl p-6 w-full max-w-lg mx-4">
              <h3 className="text-lg font-bold text-text-primary mb-4">{t('servers.aiCommand.confirmTitle')}</h3>
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm">
                  <Server className="w-4 h-4 text-text-secondary" />
                  <span className="text-text-secondary">{t('servers.aiCommand.targetServer')}</span>
                  <span className="text-text-primary font-medium">{aiCommandServer.name} ({aiCommandServer.hostname})</span>
                </div>
                <div>
                  <span className="text-sm text-text-secondary">{t('servers.aiCommand.commandToExecute')}</span>
                  <div className="mt-1 bg-black/80 rounded-lg p-3">
                    <code className="text-green-400 font-mono text-sm break-all">{aiGeneratedCommand}</code>
                  </div>
                </div>
                {aiCommandExplanation && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-300">
                      <strong>{t('servers.aiCommand.explanationLabel')}</strong>{aiCommandExplanation}
                    </p>
                  </div>
                )}
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-300 font-medium">
                    {t('servers.aiCommand.executeWarning')}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAiCommandConfirm(false)}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmExecuteAiCommand}
                  className="flex-1 px-4 py-2 bg-text-primary text-surface rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Terminal className="w-4 h-4" />
                  {t('servers.aiCommand.confirmExecute')}
                </button>
              </div>
            </div>
          </div>
        )}
        {isDeleteConfirmOpen && pendingDeleteServer && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => { setIsDeleteConfirmOpen(false); setPendingDeleteServer(null); }}>
            <div className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 backdrop-blur-xl rounded-xl p-6 w-full max-w-md mx-4 border border-red-500/20" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-red-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                {t('servers.delete.title')}
              </h3>
              <p className="text-text-secondary mb-6">
                {t('servers.delete.confirmPrefix')} <span className="text-text-primary font-medium">{pendingDeleteServer.name}</span>{t('servers.delete.confirmSuffix')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setIsDeleteConfirmOpen(false); setPendingDeleteServer(null); }}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(pendingDeleteServer.id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  {t('servers.delete.confirmDelete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Compliance check options modal */}
        {showComplianceOptions && selectedServer && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setShowComplianceOptions(false)}>
            <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{t('servers.compliance.title')}</h3>
                    <p className="text-sm text-text-secondary mt-1">{selectedServer.name} ({selectedServer.hostname})</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowComplianceOptions(false)}
                  className="p-2 hover:bg-background rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-text-secondary" />
                </button>
              </div>

              <div className="space-y-6">
                {/* AI analysis switch */}
                <div className="p-4 bg-background rounded-lg border border-border">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{t('servers.compliance.aiAnalysis')}</span>
                        {complianceOptions.useAI && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">{t('servers.compliance.recommended')}</span>
                        )}
                      </div>
                      <span className="text-xs text-text-tertiary mt-1">
                        {complianceOptions.useAI 
                          ? t('servers.compliance.aiDesc')
                          : t('servers.compliance.fastDesc')
                        }
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={complianceOptions.useAI}
                        onChange={(e) => setComplianceOptions(prev => ({ ...prev, useAI: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-surface border-2 border-border rounded-full peer peer-checked:bg-primary peer-checked:border-primary transition-all">
                        <div className="w-4 h-4 bg-white rounded-full shadow-md absolute top-0.5 left-0.5 peer-checked:translate-x-5 transition-transform"></div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* Concurrency selection */}
                <div className="p-4 bg-background rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-sm font-medium text-text-primary">{t('servers.compliance.concurrency')}</span>
                      <p className="text-xs text-text-tertiary mt-1">{t('servers.compliance.concurrencyDesc')}</p>
                    </div>
                    <span className="text-lg font-bold text-primary">{complianceOptions.concurrency}</span>
                  </div>
                  <div className="flex gap-2">
                    {[3, 5, 8, 10].map(num => (
                      <button
                        key={num}
                        onClick={() => setComplianceOptions(prev => ({ ...prev, concurrency: num }))}
                        className={clsx(
                          'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                          complianceOptions.concurrency === num
                            ? 'bg-primary text-white'
                            : 'bg-surface text-text-secondary hover:text-text-primary border border-border'
                        )}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-text-tertiary">
                    <span>{t('servers.compliance.speedStable')}</span>
                    <span>{t('servers.compliance.recommended')}</span>
                    <span>{t('servers.compliance.speedHeavy')}</span>
                  </div>
                </div>

                {/* Estimated duration hint */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-300">
                    {t('servers.compliance.estimatedPrefix')} <strong>{complianceOptions.useAI ? 15 + (10 - complianceOptions.concurrency) * 2 : 3 + (10 - complianceOptions.concurrency)}</strong> {t('servers.compliance.seconds')}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowComplianceOptions(false)}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={startComplianceCheck}
                  disabled={isRunningCompliance}
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isRunningCompliance ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('servers.compliance.checking')}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      {t('servers.compliance.start')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
