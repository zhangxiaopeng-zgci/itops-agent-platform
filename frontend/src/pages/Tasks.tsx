import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Play, Pause, XCircle, Clock, CheckCircle, XCircle as XIcon, FileText, Activity, List, FileCheck, ExternalLink, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MarkdownOutput from '../components/MarkdownOutput';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

const wsUrl = window.location.origin;

interface Task {
  id: string;
  name: string;
  workflow_id: string;
  status: string;
  start_time: string;
  end_time: string;
  current_node_id: string;
  node_results: any;
  logs: any[];
  created_at: string;
  execution_order?: string[];
  report_id?: string;
  context?: Record<string, unknown>;
}

interface TaskExecutionPreflightSnapshot {
  schemaVersion: 'workflow.executionPreflight.v1';
  decision: 'allow' | 'warn' | 'block';
  mode: 'direct' | 'warning' | 'blocked';
  requiresApproval: boolean;
  reasons: string[];
  actions: string[];
  role: string;
  generatedAt: string;
  summary?: {
    hermesEnhanced?: boolean;
    channelBundles?: {
      count: number;
      ready: number;
      needsReview: number;
      warnings: string[];
      channels?: Array<{
        id: string;
        name: string;
        type: string;
        ready: boolean;
        warnings: string[];
      }>;
    };
    gates?: {
      approvalRequired: boolean;
      approvalCount: number;
      verificationRequired: boolean;
      verificationCount: number;
    };
    mcpServers?: {
      count: number;
      unhealthy: number;
      ids?: string[];
      names?: string[];
    };
  };
}

interface Workflow {
  id: string;
  name: string;
  nodes: any[];
}

interface ToolApproval {
  id: string;
  tool_name: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  risk_level: string;
  reason?: string | null;
  requested_at: string;
  correlation_id?: string | null;
  input?: Record<string, unknown>;
  execution_result?: Record<string, unknown> | null;
}

interface SkillPack {
  id: string;
  name: string;
  category: string;
  version: string;
}

const taskStatusKeys: Record<string, MessageKey> = {
  pending: 'status.task.pending',
  running: 'status.task.running',
  completed: 'status.task.completed',
  failed: 'status.task.failed',
  paused: 'status.task.paused',
  cancelled: 'status.task.cancelled'
};

const nodeStatusKeys: Record<string, MessageKey> = {
  completed: 'status.task.completed',
  running: 'status.task.running',
  failed: 'status.task.failed',
  pending: 'tasks.node.pending'
};

export default function Tasks() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const dateLocale = locale === 'zh-CN' ? zhCN : enUS;
  const browserLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'logs' | 'nodes' | 'related_reports'>('logs');
  const [showReportDetail, setShowReportDetail] = useState<any>(null);

  const { data: tasks, refetch: refetchTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/api/tasks');
      const taskData = res.data.data as Task[];
      // Parse serialized execution fields returned by the backend.
      return taskData.map(task => {
        const parsedTask = { ...task };
        if (task.execution_order && typeof task.execution_order === 'string') {
          try {
            parsedTask.execution_order = JSON.parse(task.execution_order);
          } catch {
            parsedTask.execution_order = undefined;
          }
        }
        
        // Parse node results.
        if (task.node_results && typeof task.node_results === 'string') {
          try {
            parsedTask.node_results = JSON.parse(task.node_results);
          } catch {
            parsedTask.node_results = undefined;
          }
        }
        
        // Parse logs when they are returned as a JSON string.
        if (task.logs && typeof task.logs === 'string') {
          try {
            parsedTask.logs = JSON.parse(task.logs);
          } catch {
            parsedTask.logs = [];
          }
        }
        
        return parsedTask;
      });
    },
  });
  const workflowIdFilter = searchParams.get('workflowId');
  const visibleTasks = workflowIdFilter
    ? tasks?.filter((task) => task.workflow_id === workflowIdFilter)
    : tasks;

  const { data: reports } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await api.get('/api/reports');
      return res.data.data || [];
    },
  });

  const { data: workflows } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => {
      const res = await api.get('/api/workflows');
      return res.data.data as Workflow[];
    },
  });

  const { data: toolApprovals } = useQuery({
    queryKey: ['tool-approvals', 'task-readonly-closure'],
    queryFn: async () => {
      const res = await api.get('/api/tool-approvals', { params: { limit: 200 } });
      return (res.data.data?.approvals || []) as ToolApproval[];
    },
    refetchInterval: 30000,
  });

  const { data: skills } = useQuery({
    queryKey: ['skills', 'task-runbook-skill-map'],
    queryFn: async () => {
      const res = await api.get('/api/skills', { params: { enabled: true } });
      return (res.data.data || []) as SkillPack[];
    },
  });

  const skillNameById = new Map((skills || []).map((skill) => [skill.id, skill.name]));

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        token: token
      }
    });

    const handleConnect = () => {
    };

    const handleDisconnect = () => {
    };

    const handleConnectError = (_error: Error) => {
    };

    const handleTaskStarted = (_data: unknown) => {
      refetchTasks();
    };

    const handleNodeStarted = (data: unknown) => {
      const nodeData = data as { nodeId: string };
      setExecutingNodeId(nodeData.nodeId);
    };

    const handleNodeThinking = (data: any) => {
      if (selectedTask?.id === data.taskId) {
        setTaskLogs((prev) => [
          ...prev,
          { type: 'thinking', content: data.content, timestamp: new Date() },
        ]);
      }
    };

    const handleNodeOutput = (data: any) => {
      if (selectedTask?.id === data.taskId) {
        setTaskLogs((prev) => [
          ...prev,
          { type: 'output', content: data.output, timestamp: new Date() },
        ]);
      }
    };

    const handleNodeCompleted = (data: unknown) => {
      setExecutingNodeId(null);
      refetchTasks();
      const taskData = data as { taskId: string; status: string };
      if (selectedTask?.id === taskData.taskId) {
        setTaskLogs((prev) => [
          ...prev,
          {
            type: 'success',
            content: t('tasks.log.nodeCompleted', { status: t(taskStatusKeys[taskData.status] || 'common.unknown') }),
            timestamp: new Date(),
          },
        ]);
      }
    };

    const handleTaskCompleted = (_data: unknown) => {
      refetchTasks();
    };

    const handleTaskFailed = (_data: unknown) => {
      refetchTasks();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('task:started', handleTaskStarted);
    socket.on('task:node:started', handleNodeStarted);
    socket.on('task:node:thinking', handleNodeThinking);
    socket.on('task:node:output', handleNodeOutput);
    socket.on('task:node:completed', handleNodeCompleted);
    socket.on('task:completed', handleTaskCompleted);
    socket.on('task:failed', handleTaskFailed);

    if (selectedTask) {
      socket.emit('task:subscribe', selectedTask.id);
    }

    return () => {
      if (selectedTask) {
        socket.emit('task:unsubscribe', selectedTask.id);
      }
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('task:started', handleTaskStarted);
      socket.off('task:node:started', handleNodeStarted);
      socket.off('task:node:thinking', handleNodeThinking);
      socket.off('task:node:output', handleNodeOutput);
      socket.off('task:node:completed', handleNodeCompleted);
      socket.off('task:completed', handleTaskCompleted);
      socket.off('task:failed', handleTaskFailed);
      socket.disconnect();
    };
  }, [selectedTask, refetchTasks, token]);

  // Keep selectedTask in a ref to avoid expanding effect dependencies.
  const selectedTaskRef = useRef<Task | null>(selectedTask);
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  // Refresh the selected task when the task list changes.
  useEffect(() => {
    const currentSelectedTask = selectedTaskRef.current;
    if (currentSelectedTask && tasks) {
      const updatedTask = tasks.find(t => t.id === currentSelectedTask.id);
      if (updatedTask) {
        // Avoid redundant updates when no visible execution data changed.
        const hasChanged = 
          updatedTask.status !== currentSelectedTask.status || 
          JSON.stringify(updatedTask.node_results) !== JSON.stringify(currentSelectedTask.node_results);
        
        if (hasChanged) {
          // Parse the updated task before storing it.
          const parsedTask = { ...updatedTask };
          if (updatedTask.execution_order && typeof updatedTask.execution_order === 'string') {
            try {
              parsedTask.execution_order = JSON.parse(updatedTask.execution_order);
            } catch {
              parsedTask.execution_order = undefined;
            }
          }
          
          // Parse node results.
          if (updatedTask.node_results && typeof updatedTask.node_results === 'string') {
            try {
              parsedTask.node_results = JSON.parse(updatedTask.node_results);
            } catch {
              parsedTask.node_results = undefined;
            }
          }
          
          // Parse historical logs. Only apply them after the task finishes to avoid overwriting live logs.
          let parsedLogs: any[] = [];
          if (updatedTask.logs && Array.isArray(updatedTask.logs)) {
            parsedLogs = updatedTask.logs.map((log: any) => ({
              ...log,
              timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
            }));
          } else if (updatedTask.logs && typeof updatedTask.logs === 'string') {
            try {
              const jsonLogs = JSON.parse(updatedTask.logs);
              if (Array.isArray(jsonLogs)) {
                parsedLogs = jsonLogs.map((log: any) => ({
                  ...log,
                  timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
                }));
              }
            } catch {
              // Fall back to an empty log list when parsing fails.
            }
          }
          
          setSelectedTask(parsedTask);
          // Only replace logs after completion; live logs are append-only while running.
          if (updatedTask.status === 'completed' || updatedTask.status === 'failed') {
            setTaskLogs(parsedLogs);
          }
        }
      }
    }
  }, [tasks]);

  useEffect(() => {
    const taskId = searchParams.get('taskId');
    const workflowId = searchParams.get('workflowId');
    if (taskId && tasks && selectedTask?.id !== taskId) {
      const task = tasks.find((item) => item.id === taskId);
      if (task) handleSelectTask(task, false);
      return;
    }

    if (!taskId && workflowId && tasks && selectedTask?.workflow_id !== workflowId) {
      const task = tasks.find((item) => item.workflow_id === workflowId);
      if (task) handleSelectTask(task, false);
    }
  }, [searchParams, tasks, selectedTask?.id, selectedTask?.workflow_id]);

  const setTaskSearchParams = (task: Task) => {
    const next: Record<string, string> = { taskId: task.id };
    const workflowId = searchParams.get('workflowId');
    if (workflowId) next.workflowId = workflowId;
    setSearchParams(next);
  };

  const handleSelectTask = (task: Task, updateUrl = true) => {
    // Parse serialized execution fields.
    const parsedTask = { ...task };
    
    // Parse execution order.
    if (task.execution_order && typeof task.execution_order === 'string') {
      try {
        parsedTask.execution_order = JSON.parse(task.execution_order);
      } catch {
        parsedTask.execution_order = undefined;
      }
    }
    
    // Parse node results.
    if (task.node_results && typeof task.node_results === 'string') {
      try {
        parsedTask.node_results = JSON.parse(task.node_results);
      } catch {
        parsedTask.node_results = undefined;
      }
    }
    
    // Parse historical logs and convert ISO timestamps to Date objects.
    let parsedLogs: any[] = [];
    if (task.logs && Array.isArray(task.logs)) {
      parsedLogs = task.logs.map((log: any) => ({
        ...log,
        timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
      }));
    } else if (task.logs && typeof task.logs === 'string') {
      try {
        const jsonLogs = JSON.parse(task.logs);
        if (Array.isArray(jsonLogs)) {
          parsedLogs = jsonLogs.map((log: any) => ({
            ...log,
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
          }));
        }
      } catch {
        // Fall back to an empty log list when parsing fails.
      }
    }
    
	    setSelectedTask(parsedTask);
	    setTaskLogs(parsedLogs);
    if (updateUrl) {
      setTaskSearchParams(task);
    }
	  };

  const pauseMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await api.put(`/api/tasks/${taskId}/pause`);
    },
    onSuccess: () => refetchTasks(),
  });

  const resumeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await api.put(`/api/tasks/${taskId}/resume`);
    },
    onSuccess: () => refetchTasks(),
  });

  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await api.put(`/api/tasks/${taskId}/cancel`);
    },
    onSuccess: () => refetchTasks(),
  });

  const getTaskWorkflow = (workflowId: string) => {
    return workflows?.find((w) => w.id === workflowId);
  };
  
  const handleDownloadReport = async (reportId: string, format: 'markdown' | 'pdf' | 'word' = 'markdown') => {
    try {
      const response = await api.get(`/api/reports/${reportId}/export?format=${format}`, { responseType: 'blob' });
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${reportId}.${format === 'markdown' ? 'md' : format === 'pdf' ? 'pdf' : 'doc'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="h-full overflow-hidden">
      <div className="p-6 h-full flex gap-6">
        <div className="w-1/3 h-full flex flex-col">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary mb-2">{t('tasks.title')}</h1>
            <p className="text-text-secondary">{t('tasks.subtitle')}</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
            {visibleTasks?.map((task) => (
              <div
                key={task.id}
                onClick={() => handleSelectTask(task)}
                className={clsx(
                  'p-4 rounded-lg border cursor-pointer transition-all',
                  selectedTask?.id === task.id
                    ? 'bg-primary/10 border-primary'
                    : 'bg-surface border-border hover:border-primary/50'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-text-primary">{task.name}</h3>
                  <span
                    className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      task.status === 'completed' && 'bg-status-success/10 text-status-success',
                      task.status === 'running' && 'bg-status-running/10 text-status-running',
                      task.status === 'failed' && 'bg-status-failed/10 text-status-failed',
                      task.status === 'paused' && 'bg-status-paused/10 text-status-paused',
                      task.status === 'pending' && 'bg-status-pending/10 text-status-pending',
                      task.status === 'cancelled' && 'bg-status-pending/10 text-status-pending'
                    )}
                  >
                    {t(taskStatusKeys[task.status] || 'common.unknown')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: dateLocale })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 h-full flex flex-col bg-surface rounded-xl border border-border">
          {selectedTask ? (
            <>
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">{selectedTask.name}</h2>
                    <p className="text-sm text-text-secondary">
                      {t('tasks.workflowLabel', { name: getTaskWorkflow(selectedTask.workflow_id)?.name || t('common.unknown') })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedTask.status === 'running' && (
                      <button
                        onClick={() => pauseMutation.mutate(selectedTask.id)}
                        className="p-2 bg-status-warning/10 text-status-warning rounded-lg hover:bg-status-warning/20"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                    {selectedTask.status === 'paused' && (
                      <button
                        onClick={() => resumeMutation.mutate(selectedTask.id)}
                        className="p-2 bg-status-success/10 text-status-success rounded-lg hover:bg-status-success/20"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {(selectedTask.status === 'running' || selectedTask.status === 'paused') && (
                      <button
                        onClick={() => cancelMutation.mutate(selectedTask.id)}
                        className="p-2 bg-status-failed/10 text-status-failed rounded-lg hover:bg-status-failed/20"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <TaskExecutionPreflightPanel task={selectedTask} preflight={getTaskExecutionPreflight(selectedTask)} />

                <div className="flex gap-2 overflow-x-auto pb-2">
                  {(() => {
                    const workflow = getTaskWorkflow(selectedTask.workflow_id);
                    const nodes = workflow?.nodes || [];
                    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
                    const executionOrder = selectedTask.execution_order;
                    
                    // Sort nodes by execution order when available.
                    let orderedNodes;
                    if (executionOrder && executionOrder.length > 0) {
                      orderedNodes = executionOrder
                        .map(id => nodeMap.get(id))
                        .filter(node => node !== undefined);
                    } else {
                      orderedNodes = nodes;
                    }

                    return orderedNodes.map((node, index) => {
                      const result = selectedTask.node_results?.[node.id];
                      const isRunning = executingNodeId === node.id;
                      const status = getNodeDisplayStatus(result?.status, isRunning);
                      const runbook = getRunbookMetadata(node, result);

                      return (
                        <div key={node.id} className="flex items-center gap-2">
                          <div
                            className={clsx(
                              'px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2',
                              status === 'completed' && 'border-status-success bg-status-success/10',
                              status === 'running' && 'border-status-running bg-status-running/10 animate-pulse',
                              status === 'failed' && 'border-status-failed bg-status-failed/10',
                              status === 'pending' && 'border-status-pending'
                            )}
                          >
                            <span className="text-lg">{node.data?.avatar || '🤖'}</span>
                            <span className="text-sm font-medium text-text-primary whitespace-nowrap">
                              {node.data?.label}
                            </span>
                            {runbook.phase && (
                              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs whitespace-nowrap">
                                {formatRunbookPhase(runbook.phase, t)}
                              </span>
                            )}
                            {runbook.recommendedSkillIds.length > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-500 text-xs whitespace-nowrap">
                                {t('tasks.runbook.skill')}
                              </span>
                            )}
                            {status === 'completed' && (
                              <CheckCircle className="w-4 h-4 text-status-success" />
                            )}
                            {status === 'failed' && <XIcon className="w-4 h-4 text-status-failed" />}
                            {status === 'running' && (
                              <div className="w-4 h-4 border-2 border-status-running border-t-transparent rounded-full animate-spin" />
                            )}
                          </div>
                          {index < orderedNodes.length - 1 && (
                            <span className="text-text-secondary">→</span>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Tab navigation */}
                <div className="flex border-b border-border px-6 pt-4">
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium border-b-2 transition-all',
                      activeTab === 'logs'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <List className="w-4 h-4" />
                      {t('tasks.tabs.logs')}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('nodes')}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                      activeTab === 'nodes'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {t('tasks.tabs.nodes')}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('related_reports')}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                      activeTab === 'related_reports'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4" />
                      {t('tasks.tabs.relatedReports')}
                    </div>
                  </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeTab === 'logs' && (
                    <div className="space-y-2">
                      {taskLogs.length === 0 ? (
                        <div className="text-center py-12 text-text-secondary">
                          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>{t('tasks.empty.logs')}</p>
                        </div>
                      ) : (
                        taskLogs.map((log, index) => (
                          <div
                            key={index}
                            className={clsx(
                              'p-3 rounded-lg text-sm',
                              log.type === 'thinking' && 'bg-blue-500/5 border-l-4 border-blue-500',
                              log.type === 'output' && 'bg-green-500/5 border-l-4 border-green-500',
                              log.type === 'success' && 'bg-green-500/10 border-l-4 border-green-500',
                              log.type === 'error' && 'bg-red-500/10 border-l-4 border-red-500',
                              log.type === 'info' && 'bg-surface border-l-4 border-primary'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-text-secondary">
                                {format(new Date(log.timestamp), 'HH:mm:ss')}
                              </span>
                              {log.type === 'thinking' && (
                                <span className="text-xs text-blue-500">{t('tasks.log.thinking')}</span>
                              )}
                              {log.type === 'output' && (
                                <span className="text-xs text-green-500">{t('common.output')}</span>
                              )}
                            </div>
                            {log.type === 'output' ? (
                              <div className="text-text-primary">
                                <MarkdownOutput content={log.content} />
                              </div>
                            ) : (
                              <p className="text-text-primary whitespace-pre-wrap">{log.content}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'nodes' && (
                    <div className="space-y-4">
                      {(() => {
                        const workflow = getTaskWorkflow(selectedTask.workflow_id);
                        const nodes = workflow?.nodes || [];
                        const nodeMap = new Map(nodes.map((node) => [node.id, node]));
                        const executionOrder = selectedTask.execution_order;
                        
                        let orderedNodes;
                        if (executionOrder && executionOrder.length > 0) {
                          orderedNodes = executionOrder
                            .map(id => nodeMap.get(id))
                            .filter(node => node !== undefined);
                        } else {
                          orderedNodes = nodes;
                        }

                        if (orderedNodes.length === 0) {
                          return (
                            <div className="text-center py-12 text-text-secondary">
                              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                              <p>{t('tasks.empty.nodes')}</p>
                            </div>
                          );
                        }

                        return orderedNodes.map((node, index) => {
                          const result = selectedTask.node_results?.[node.id];
                          const isRunning = executingNodeId === node.id;
                          const status = getNodeDisplayStatus(result?.status, isRunning);
                          const runbook = getRunbookMetadata(node, result);
                          const refs = extractExecutionRefs(node, result);
                          const closure = buildNodeClosure(refs, toolApprovals || [], tasks || [], selectedTask.id);
                          const evidence = getExecutionEvidence(result);

                          return (
                            <div
                              key={node.id}
                              className={clsx(
                                'rounded-xl border-2 overflow-hidden transition-all',
                                status === 'completed' && 'border-status-success/30 bg-status-success/5',
                                status === 'running' && 'border-status-running/30 bg-status-running/5 animate-pulse',
                                status === 'failed' && 'border-status-failed/30 bg-status-failed/5',
                                status === 'pending' && 'border-border bg-background/50'
                              )}
                            >
                              {/* Node header */}
                              <div className="flex items-center justify-between p-4 border-b border-border">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface">
                                    <span className="text-xl">{node.data?.avatar || '🤖'}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-text-primary flex items-center gap-2">
                                      {node.data?.label || t('tasks.node.unknown')}
                                      {status === 'completed' && (
                                        <CheckCircle className="w-4 h-4 text-status-success" />
                                      )}
                                      {status === 'failed' && (
                                        <XIcon className="w-4 h-4 text-status-failed" />
                                      )}
                                      {status === 'running' && (
                                        <div className="w-4 h-4 border-2 border-status-running border-t-transparent rounded-full animate-spin" />
                                      )}
                                    </h4>
                                    <p className="text-sm text-text-secondary">
                                      {t('tasks.node.step', { current: index + 1, total: orderedNodes.length })}
                                    </p>
                                  </div>
                                </div>
                                <span
                                  className={clsx(
                                    'px-3 py-1 rounded-full text-xs font-medium',
                                    status === 'completed' && 'bg-status-success/10 text-status-success',
                                    status === 'running' && 'bg-status-running/10 text-status-running',
                                    status === 'failed' && 'bg-status-failed/10 text-status-failed',
                                    status === 'pending' && 'bg-status-pending/10 text-status-pending'
                                  )}
                                >
                                  {t(nodeStatusKeys[status] || 'common.unknown')}
                                </span>
                              </div>

                              {(runbook.phase || runbook.recommendedSkillIds.length > 0 || runbook.evidenceRequired.length > 0 || runbook.riskGate || runbook.approvalRequired || runbook.verificationRequired) && (
                                <div className="px-4 py-3 border-b border-border bg-surface/40">
                                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                                    {runbook.phase && (
                                      <RunbookMetaItem
                                        label={t('tasks.runbook.phase')}
                                        value={formatRunbookPhase(runbook.phase, t)}
                                      />
                                    )}
                                    {runbook.riskGate && (
                                      <RunbookMetaItem
                                        label={t('tasks.runbook.riskGate')}
                                        value={formatRiskGate(runbook.riskGate, t)}
                                      />
                                    )}
                                    <RunbookMetaItem
                                      label={t('tasks.runbook.approval')}
                                      value={runbook.approvalRequired ? t('tasks.runbook.required') : t('tasks.runbook.notRequired')}
                                      tone={runbook.approvalRequired ? 'warning' : 'normal'}
                                    />
                                    <RunbookMetaItem
                                      label={t('tasks.runbook.verification')}
                                      value={runbook.verificationRequired ? t('tasks.runbook.required') : t('tasks.runbook.notRequired')}
                                      tone={runbook.verificationRequired ? 'success' : 'normal'}
                                    />
                                  </div>

                                  {runbook.recommendedSkillIds.length > 0 && (
                                    <div className="mt-3">
                                      <div className="text-xs text-text-tertiary mb-2">{t('tasks.runbook.recommendedSkills')}</div>
                                      <div className="flex flex-wrap gap-2">
                                        {runbook.recommendedSkillIds.map((skillId) => (
                                          <span
                                            key={skillId}
                                            className="px-2 py-1 rounded-md border border-teal-500/25 bg-teal-500/10 text-xs text-teal-600 dark:text-teal-300"
                                          >
                                            {skillNameById.get(skillId) || skillId}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {runbook.evidenceRequired.length > 0 && (
                                    <div className="mt-3">
                                      <div className="text-xs text-text-tertiary mb-2">{t('tasks.runbook.evidenceRequired')}</div>
                                      <div className="flex flex-wrap gap-2">
                                        {runbook.evidenceRequired.map((item) => (
                                          <span
                                            key={item}
                                            className="px-2 py-1 rounded-md border border-border bg-background text-xs text-text-secondary"
                                          >
                                            {formatEvidenceName(item, t)}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {(runbook.approvalRequired || runbook.verificationRequired || refs.approvalIds.length > 0 || refs.taskIds.length > 0 || refs.correlationIds.length > 0) && (
                                <div className="px-4 py-3 border-b border-border bg-background/40">
                                  <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                      <h5 className="text-sm font-medium text-text-primary">{t('tasks.closure.title')}</h5>
                                      <p className="text-xs text-text-tertiary">{t('tasks.closure.subtitle')}</p>
                                    </div>
                                    {refs.correlationIds.length > 0 && (
                                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-secondary">
                                        {t('tasks.closure.correlation', { id: shortId(refs.correlationIds[0]) })}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                    <ClosurePanel
                                      title={t('tasks.closure.approvals')}
                                      empty={runbook.approvalRequired ? t('tasks.closure.noApprovalLinked') : t('tasks.closure.noApprovals')}
                                      required={runbook.approvalRequired}
                                      requiredLabel={t('tasks.closure.required')}
                                    >
                                      {closure.approvals.map((approval) => (
                                        <button
                                          key={approval.id}
                                          type="button"
                                          onClick={() => navigate(`/tool-approvals?approvalId=${encodeURIComponent(approval.id)}`)}
                                          className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/40 transition-colors"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2">
                                                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                <span className="text-sm font-medium text-text-primary truncate">{approval.tool_name}</span>
                                              </div>
                                              <div className="text-xs text-text-tertiary mt-1 truncate">
                                                {approval.risk_level} · {shortId(approval.id)}
                                              </div>
                                            </div>
                                            <ApprovalStatusBadge status={approval.status} t={t} />
                                          </div>
                                        </button>
                                      ))}
                                    </ClosurePanel>

                                    <ClosurePanel
                                      title={t('tasks.closure.tasks')}
                                      empty={runbook.verificationRequired ? t('tasks.closure.noVerificationTask') : t('tasks.closure.noTasks')}
                                      required={runbook.verificationRequired}
                                      requiredLabel={t('tasks.closure.required')}
                                    >
                                      {closure.tasks.map((task) => (
                                        <button
                                          key={task.id}
                                          type="button"
                                          onClick={() => navigate(`/tasks?taskId=${encodeURIComponent(task.id)}`)}
                                          className="w-full text-left rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/40 transition-colors"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="text-sm font-medium text-text-primary truncate">{task.name}</div>
                                              <div className="text-xs text-text-tertiary mt-1 truncate">{shortId(task.id)}</div>
                                            </div>
                                            <TaskStatusBadge status={task.status} t={t} />
                                          </div>
                                        </button>
                                      ))}
                                    </ClosurePanel>
                                  </div>
                                </div>
                              )}

                              {evidence && (
                                <ExecutionEvidencePanel evidence={evidence} />
                              )}

                              {/* Node result */}
                              {result && (
                                <div className="p-4">
                                  {result.output && (
                                    <div className="mb-3">
                                      <h5 className="text-sm font-medium text-text-secondary mb-2">{t('tasks.node.outputResult')}</h5>
                                      <div className="bg-surface rounded-lg p-3 border border-border">
                                        <MarkdownOutput content={result.output} />
                                      </div>
                                    </div>
                                  )}
                                  {result.error && (
                                    <div>
                                      <h5 className="text-sm font-medium text-status-failed mb-2">{t('tasks.node.errorInfo')}</h5>
                                      <div className="bg-status-failed/5 rounded-lg p-3 border border-status-failed/20">
                                        <p className="text-sm text-status-failed">{result.error}</p>
                                      </div>
                                    </div>
                                  )}
                                  {result.metadata && result.metadata.executionTime && (
                                    <div className="mt-3 pt-3 border-t border-border">
                                      <p className="text-xs text-text-secondary">
                                        {t('tasks.node.executionTime', { time: new Date(result.metadata.executionTime).toLocaleString(browserLocale) })}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                  
                  {activeTab === 'related_reports' && (
                    <div className="space-y-4">
                      {(() => {
                        // Prefer exact report_id matches.
                        let relatedReports: any[] = [];
                        
                        if (selectedTask.report_id) {
                          const exactReport = reports?.find((report: any) => 
                            report.id === selectedTask.report_id
                          );
                          if (exactReport) {
                            relatedReports = [exactReport];
                          }
                        }
                        
                        // Fall back to legacy fuzzy matching when no exact report is linked.
                        if (relatedReports.length === 0) {
                          relatedReports = reports?.filter((report: any) => 
                            report.name?.includes(selectedTask.name) || 
                            report.content?.includes(selectedTask.id) ||
                            report.task_id === selectedTask.id
                          ) || [];
                        }
                        
                        if (relatedReports.length === 0) {
                          return (
                            <div className="text-center py-12 text-text-secondary">
                              <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                              <p className="mb-4">{t('tasks.empty.relatedReports')}</p>
                            </div>
                          );
                        }
                        
                        return relatedReports.map((report: any) => (
                          <div
                            key={report.id}
                            className="bg-surface border border-border rounded-lg p-4 hover:border-primary/50 transition-all cursor-pointer"
                            onClick={() => setShowReportDetail(report)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <FileCheck className="w-4 h-4 text-primary" />
                                  <h4 className="font-medium text-text-primary">{report.name}</h4>
                                </div>
                                <p className="text-sm text-text-secondary">
                                  {t('tasks.report.createdAt', { time: new Date(report.created_at).toLocaleString(browserLocale) })}
                                </p>
                                <p className="text-xs text-text-secondary mt-1">
                                  {t('tasks.report.format', { format: report.format?.toUpperCase() || 'MARKDOWN' })}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadReport(report.id, 'markdown');
                                }}
                                className="text-primary hover:text-primary/80 p-2"
                              >
                                <FileText className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Play className="w-16 h-16 text-text-secondary mx-auto mb-4 opacity-50" />
                <p className="text-text-secondary">{t('tasks.empty.selectTask')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Report detail modal */}
      {showReportDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <FileCheck className="w-6 h-6 text-primary" />
                {showReportDetail.name}
              </h2>
              <button
                onClick={() => setShowReportDetail(null)}
                className="text-text-secondary hover:text-text-primary p-2"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <MarkdownOutput content={showReportDetail.content} />
            </div>
            
            <div className="p-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={() => handleDownloadReport(showReportDetail.id, 'markdown')}
                className="px-4 py-2 bg-surface hover:bg-background text-text-primary rounded-lg flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {t('tasks.report.downloadMarkdown')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getNodeDisplayStatus(rawStatus: string | undefined, isRunning: boolean) {
  if (isRunning) return 'running';
  if (rawStatus === 'success') return 'completed';
  return rawStatus || 'pending';
}

function getRunbookMetadata(node: any, result: any) {
  const metadata = result?.metadata || {};
  return {
    phase: metadata.runbookPhase || node.data?.runbookPhase || null,
    evidenceRequired: normalizeStringList(metadata.evidenceRequired || node.data?.evidenceRequired),
    riskGate: metadata.riskGate || node.data?.riskGate || null,
    approvalRequired: Boolean(metadata.approvalRequired ?? node.data?.approvalRequired),
    verificationRequired: Boolean(metadata.verificationRequired ?? node.data?.verificationRequired),
    recommendedSkillIds: normalizeRecommendedSkillIds(metadata.recommendedSkillIds || node.data?.recommendedSkillIds || node.data?.recommendedSkillId)
  };
}

function getTaskExecutionPreflight(task: Task): TaskExecutionPreflightSnapshot | null {
  const preflight = asRecord(task.context?.workflowExecutionPreflight);
  if (preflight.schemaVersion !== 'workflow.executionPreflight.v1') {
    return null;
  }

  return {
    schemaVersion: 'workflow.executionPreflight.v1',
    decision: preflight.decision === 'block' ? 'block' : preflight.decision === 'warn' ? 'warn' : 'allow',
    mode: preflight.mode === 'blocked' ? 'blocked' : preflight.mode === 'warning' ? 'warning' : 'direct',
    requiresApproval: Boolean(preflight.requiresApproval),
    reasons: normalizeStringList(preflight.reasons),
    actions: normalizeStringList(preflight.actions),
    role: readString(preflight.role) || '-',
    generatedAt: readString(preflight.generatedAt) || '',
    summary: asRecord(preflight.summary) as TaskExecutionPreflightSnapshot['summary']
  };
}

function TaskExecutionPreflightPanel({ task, preflight }: { task: Task; preflight: TaskExecutionPreflightSnapshot | null }) {
  const { locale, t } = useLocale();
  const navigate = useNavigate();
  const browserLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  if (!preflight) return null;

  const bundles = preflight.summary?.channelBundles;
  const gates = preflight.summary?.gates;
  const mcpServers = preflight.summary?.mcpServers;
  const decisionTone = preflight.decision === 'block'
    ? 'warning'
    : preflight.decision === 'warn'
      ? 'warning'
      : 'success';

  return (
    <div className="mb-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className={clsx(
              'w-4 h-4',
              preflight.decision === 'allow' ? 'text-status-success' : 'text-amber-500'
            )} />
            <h3 className="text-sm font-semibold text-text-primary">{t('tasks.preflight.title')}</h3>
          </div>
          <p className="mt-1 text-xs text-text-tertiary">{t('tasks.preflight.subtitle')}</p>
        </div>
        {preflight.generatedAt && (
          <span className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary">
            {new Date(preflight.generatedAt).toLocaleString(browserLocale)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <RunbookMetaItem
          label={t('tasks.preflight.decision')}
          value={formatPreflightDecision(preflight.decision, t)}
          tone={decisionTone}
        />
        <RunbookMetaItem label={t('tasks.preflight.role')} value={preflight.role} />
        <RunbookMetaItem label={t('tasks.preflight.approval')} value={preflight.requiresApproval ? t('common.yes') : t('common.no')} tone={preflight.requiresApproval ? 'warning' : 'normal'} />
        <RunbookMetaItem
          label={t('tasks.preflight.bundles')}
          value={bundles ? `${bundles.ready}/${bundles.count}` : '-'}
          tone={bundles && bundles.needsReview > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <EvidenceList
          label={t('tasks.preflight.reasons')}
          values={preflight.reasons.map((reason) => formatPreflightReason(reason, t))}
        />
        <PreflightLinkList
          label={t('tasks.preflight.actions')}
          items={preflight.actions.map((action) => buildPreflightActionLink(action, task, t))}
          onNavigate={navigate}
        />
        <EvidenceList
          label={t('tasks.preflight.runtime')}
          values={[
            gates ? `${t('tasks.preflight.gates')}: ${gates.approvalCount}/${gates.verificationCount}` : '',
            mcpServers ? `MCP: ${mcpServers.unhealthy}/${mcpServers.count}` : '',
            bundles && bundles.warnings.length > 0 ? `${t('tasks.preflight.bundleWarnings')}: ${bundles.warnings.length}` : ''
          ]}
        />
      </div>
      {preflight.reasons.length > 0 && (
        <div className="mt-3">
          <PreflightLinkList
            label={t('tasks.preflight.ownerLinks')}
            items={preflight.reasons.map((reason) => buildPreflightReasonLink(reason, task, t))}
            onNavigate={navigate}
          />
        </div>
      )}
    </div>
  );
}

function formatPreflightDecision(decision: TaskExecutionPreflightSnapshot['decision'], t: (key: MessageKey) => string) {
  const keys: Record<TaskExecutionPreflightSnapshot['decision'], MessageKey> = {
    allow: 'tasks.preflight.decision.allow',
    warn: 'tasks.preflight.decision.warn',
    block: 'tasks.preflight.decision.block'
  };
  return t(keys[decision]);
}

function formatPreflightReason(reason: string, t: (key: MessageKey) => string) {
  const labels: Record<string, MessageKey> = {
    role_viewer_cannot_execute: 'tasks.preflight.reason.role_viewer_cannot_execute',
    capability_bundle_needs_review: 'tasks.preflight.reason.capability_bundle_needs_review',
    capability_bundle_policy_risk: 'tasks.preflight.reason.capability_bundle_policy_risk',
    mcp_server_unhealthy: 'tasks.preflight.reason.mcp_server_unhealthy',
    workflow_requires_approval: 'tasks.preflight.reason.workflow_requires_approval',
    high_risk_tools_require_approval: 'tasks.preflight.reason.high_risk_tools_require_approval',
    workflow_requires_verification: 'tasks.preflight.reason.workflow_requires_verification',
    recent_workflow_failures: 'tasks.preflight.reason.recent_workflow_failures'
  };
  return labels[reason] ? t(labels[reason]) : reason;
}

function formatPreflightAction(action: string, t: (key: MessageKey) => string) {
  const labels: Record<string, MessageKey> = {
    switch_operator_or_admin: 'tasks.preflight.action.switch_operator_or_admin',
    review_capability_bundle: 'tasks.preflight.action.review_capability_bundle',
    review_channel_policy: 'tasks.preflight.action.review_channel_policy',
    check_mcp_server_health: 'tasks.preflight.action.check_mcp_server_health',
    prepare_tool_approval: 'tasks.preflight.action.prepare_tool_approval',
    prepare_verification_plan: 'tasks.preflight.action.prepare_verification_plan',
    review_recent_failures: 'tasks.preflight.action.review_recent_failures'
  };
  return labels[action] ? t(labels[action]) : action;
}

interface PreflightLinkItem {
  id: string;
  text: string;
  href: string;
  target: string;
}

function PreflightLinkList({
  label,
  items,
  onNavigate
}: {
  label: string;
  items: PreflightLinkItem[];
  onNavigate: (path: string) => void;
}) {
  const { t } = useLocale();
  const normalized = dedupePreflightLinks(items).slice(0, 8);
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary mb-2">{label}</div>
      <div className="space-y-2">
        {normalized.length === 0 && <span className="text-xs text-text-tertiary">{t('tasks.evidence.empty')}</span>}
        {normalized.map((item) => (
          <div key={item.id} className="rounded-md border border-border bg-surface px-2 py-2">
            <div className="text-xs text-text-secondary">{item.text}</div>
            <button
              type="button"
              onClick={() => onNavigate(item.href)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t('tasks.preflight.openTarget', { target: item.target })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type TaskTranslator = (key: MessageKey, params?: Record<string, string | number>) => string;

function buildPreflightReasonLink(reason: string, task: Task, t: TaskTranslator): PreflightLinkItem {
  const target = getPreflightReasonTarget(reason, task, t);
  return {
    id: `reason:${reason}:${target.href}`,
    text: formatPreflightReason(reason, t),
    ...target
  };
}

function buildPreflightActionLink(action: string, task: Task, t: TaskTranslator): PreflightLinkItem {
  const target = getPreflightActionTarget(action, task, t);
  return {
    id: `action:${action}:${target.href}`,
    text: formatPreflightAction(action, t),
    ...target
  };
}

function getPreflightReasonTarget(reason: string, task: Task, t: (key: MessageKey) => string): { href: string; target: string } {
  const preflight = getTaskExecutionPreflight(task);
  if (['capability_bundle_needs_review', 'capability_bundle_policy_risk', 'mcp_server_unhealthy'].includes(reason)) {
    return { href: buildHermesChannelHref(preflight, reason === 'mcp_server_unhealthy' ? 'mcp' : 'bundle'), target: t('tasks.preflight.target.channels') };
  }
  if (['workflow_requires_approval', 'workflow_requires_verification', 'high_risk_tools_require_approval'].includes(reason)) {
    return { href: `/workflows/${encodeURIComponent(task.workflow_id)}?focus=gates`, target: t('tasks.preflight.target.workflow') };
  }
  if (reason === 'recent_workflow_failures') {
    return { href: `/tasks?workflowId=${encodeURIComponent(task.workflow_id)}`, target: t('tasks.preflight.target.tasks') };
  }
  if (reason === 'role_viewer_cannot_execute') {
    return { href: '/users', target: t('tasks.preflight.target.users') };
  }
  return { href: '/execution-center', target: t('tasks.preflight.target.executionCenter') };
}

function getPreflightActionTarget(action: string, task: Task, t: (key: MessageKey) => string): { href: string; target: string } {
  const preflight = getTaskExecutionPreflight(task);
  if (['review_capability_bundle', 'review_channel_policy', 'check_mcp_server_health'].includes(action)) {
    return { href: buildHermesChannelHref(preflight, action === 'check_mcp_server_health' ? 'mcp' : 'bundle'), target: t('tasks.preflight.target.channels') };
  }
  if (action === 'prepare_tool_approval') {
    return { href: buildToolApprovalHref(task), target: t('tasks.preflight.target.approvals') };
  }
  if (action === 'prepare_verification_plan') {
    return { href: `/workflows/${encodeURIComponent(task.workflow_id)}?focus=gates`, target: t('tasks.preflight.target.workflow') };
  }
  if (action === 'review_recent_failures') {
    return { href: `/tasks?workflowId=${encodeURIComponent(task.workflow_id)}`, target: t('tasks.preflight.target.tasks') };
  }
  if (action === 'switch_operator_or_admin') {
    return { href: '/users', target: t('tasks.preflight.target.users') };
  }
  return { href: '/execution-center', target: t('tasks.preflight.target.executionCenter') };
}

function buildHermesChannelHref(preflight: TaskExecutionPreflightSnapshot | null, focus: 'bundle' | 'mcp') {
  const params = new URLSearchParams();
  params.set('focus', focus);
  const channelId = preflight?.summary?.channelBundles?.channels?.[0]?.id;
  const mcpId = preflight?.summary?.mcpServers?.ids?.[0];
  if (channelId) params.set('channelId', channelId);
  if (focus === 'mcp' && mcpId) params.set('mcpId', mcpId);
  return `/hermes-channels?${params.toString()}`;
}

function buildToolApprovalHref(task: Task) {
  const params = new URLSearchParams();
  params.set('taskId', task.id);
  const correlationId = readString(task.context?.correlationId);
  if (correlationId) params.set('correlationId', correlationId);
  return `/tool-approvals?${params.toString()}`;
}

function dedupePreflightLinks(items: PreflightLinkItem[]): PreflightLinkItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.text}:${item.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRecommendedSkillIds(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return normalizeStringList(value);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function formatRunbookPhase(phase: string, t: (key: MessageKey) => string) {
  const phaseKeys: Record<string, MessageKey> = {
    diagnose: 'tasks.runbook.phase.diagnose',
    evidence: 'tasks.runbook.phase.evidence',
    approval_plan: 'tasks.runbook.phase.approvalPlan',
    review: 'tasks.runbook.phase.review',
    evolve: 'tasks.runbook.phase.evolve',
    inspect: 'tasks.runbook.phase.inspect',
    report: 'tasks.runbook.phase.report'
  };
  return t(phaseKeys[phase] || 'tasks.runbook.phase.unknown');
}

function formatRiskGate(riskGate: string, t: (key: MessageKey) => string) {
  const riskGateKeys: Record<string, MessageKey> = {
    read_only: 'tasks.runbook.risk.readOnly',
    approval_required: 'tasks.runbook.risk.approvalRequired',
    review_required: 'tasks.runbook.risk.reviewRequired'
  };
  return t(riskGateKeys[riskGate] || 'tasks.runbook.risk.unknown');
}

function formatEvidenceName(evidence: string, t: (key: MessageKey) => string) {
  const evidenceKeys: Record<string, MessageKey> = {
    alert: 'tasks.runbook.evidence.alert',
    metrics: 'tasks.runbook.evidence.metrics',
    recent_changes: 'tasks.runbook.evidence.recentChanges',
    logs: 'tasks.runbook.evidence.logs',
    server_metrics: 'tasks.runbook.evidence.serverMetrics',
    process_state: 'tasks.runbook.evidence.processState',
    diagnosis: 'tasks.runbook.evidence.diagnosis',
    log_evidence: 'tasks.runbook.evidence.logEvidence',
    server_evidence: 'tasks.runbook.evidence.serverEvidence',
    remediation_plan: 'tasks.runbook.evidence.remediationPlan',
    verification_result: 'tasks.runbook.evidence.verificationResult',
    symptom: 'tasks.runbook.evidence.symptom',
    server_state: 'tasks.runbook.evidence.serverState',
    rca: 'tasks.runbook.evidence.rca',
    command_evidence: 'tasks.runbook.evidence.commandEvidence',
    repair_plan: 'tasks.runbook.evidence.repairPlan',
    task_result: 'tasks.runbook.evidence.taskResult',
    service_state: 'tasks.runbook.evidence.serviceState',
    inspection_evidence: 'tasks.runbook.evidence.inspectionEvidence',
    inspection_report: 'tasks.runbook.evidence.inspectionReport'
  };
  return evidenceKeys[evidence] ? t(evidenceKeys[evidence]) : evidence;
}

interface ExecutionRefs {
  approvalIds: string[];
  taskIds: string[];
  correlationIds: string[];
}

function ExecutionEvidencePanel({ evidence }: { evidence: Record<string, unknown> }) {
  const { t } = useLocale();
  const context = asRecord(evidence.context);
  const evidenceBody = asRecord(evidence.evidence);
  const observedRefs = asRecord(evidenceBody.observedRefs);
  const required = normalizeStringList(evidenceBody.required);
  const toolCalls = normalizeStringList(evidenceBody.toolCalls);
  const releaseOverlayVersionIds = normalizeStringList(evidenceBody.releaseOverlayVersionIds);
  const skillIds = normalizeStringList(evidence.skillIds);
  const mcpServerIds = normalizeStringList(evidence.mcpServerIds);
  const approvalId = readString(evidence.approvalId);
  const taskId = readString(evidence.taskId);
  const traceId = readString(evidence.traceId);
  const correlationId = readString(evidence.correlationId);
  const riskLevel = readString(evidence.riskLevel);
  const runtime = readString(evidence.runtime);
  const verificationResult = readString(evidence.verificationResult);
  const plannedActions = normalizeStringList(evidence.plannedActions);
  const traceEventCount = typeof evidenceBody.traceEventCount === 'number' ? evidenceBody.traceEventCount : 0;

  return (
    <div className="px-4 py-3 border-b border-border bg-surface/30">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h5 className="text-sm font-medium text-text-primary">{t('tasks.evidence.title')}</h5>
          <p className="text-xs text-text-tertiary">{t('tasks.evidence.subtitle')}</p>
        </div>
        {traceId && (
          <span className="inline-flex px-2.5 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-xs text-primary">
            trace {shortId(traceId)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <RunbookMetaItem label={t('tasks.evidence.status')} value={readString(evidence.status) || '-'} />
        <RunbookMetaItem label={t('tasks.evidence.riskLevel')} value={riskLevel || '-'} tone={riskLevel?.includes('approval') ? 'warning' : 'normal'} />
        <RunbookMetaItem label={t('common.runtime')} value={runtime || '-'} />
        <RunbookMetaItem label={t('tasks.evidence.traceEvents')} value={String(traceEventCount)} />
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <EvidenceList label={t('tasks.evidence.refs')} values={[
          approvalId ? `approval ${shortId(approvalId)}` : '',
          taskId ? `task ${shortId(taskId)}` : '',
          correlationId ? `corr ${shortId(correlationId)}` : '',
          ...normalizeStringList(observedRefs.approvalIds).map(id => `approval ${shortId(id)}`),
          ...normalizeStringList(observedRefs.taskIds).map(id => `task ${shortId(id)}`)
        ]} />
        <EvidenceList label={t('tasks.evidence.required')} values={required.map(item => formatEvidenceName(item, t))} />
        <EvidenceList label={t('tasks.evidence.tools')} values={toolCalls} />
      </div>

      {(plannedActions.length > 0 || verificationResult || skillIds.length > 0 || mcpServerIds.length > 0 || releaseOverlayVersionIds.length > 0) && (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <EvidenceList label={t('tasks.evidence.plannedActions')} values={plannedActions} />
          <EvidenceList
            label={t('tasks.evidence.capabilities')}
            values={[
              ...skillIds.map(id => `skill:${id}`),
              ...mcpServerIds.map(id => `mcp:${id}`),
              ...releaseOverlayVersionIds.map(id => `release:${shortId(id)}`),
              verificationResult ? `${t('tasks.evidence.verification')}: ${verificationResult}` : ''
            ]}
          />
        </div>
      )}

      {readString(evidence.hypothesis) && (
        <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
          <div className="text-xs text-text-tertiary mb-1">{t('tasks.evidence.hypothesis')}</div>
          <div className="text-sm text-text-secondary">{readString(evidence.hypothesis)}</div>
        </div>
      )}

      <div className="mt-3 text-xs text-text-tertiary">
        {t('tasks.evidence.context')}: {normalizeStringList(context.keys).slice(0, 12).join(', ') || '-'}
      </div>
    </div>
  );
}

function EvidenceList({ label, values }: { label: string; values: string[] }) {
  const { t } = useLocale();
  const normalized = Array.from(new Set(values.filter(Boolean))).slice(0, 10);
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {normalized.length === 0 && <span className="text-xs text-text-tertiary">{t('tasks.evidence.empty')}</span>}
        {normalized.map((value) => (
          <span key={value} className="max-w-full truncate rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function extractExecutionRefs(node: any, result: any): ExecutionRefs {
  const refs = {
    approvalIds: new Set<string>(),
    taskIds: new Set<string>(),
    correlationIds: new Set<string>()
  };

  collectExecutionRefs(node?.data, refs);
  collectExecutionRefs(result?.metadata, refs);
  collectExecutionRefs(result?.output, refs);
  collectExecutionRefs(result?.error, refs);
  collectExecutionRefs(result?.metadata?.trace, refs);

  return {
    approvalIds: Array.from(refs.approvalIds),
    taskIds: Array.from(refs.taskIds),
    correlationIds: Array.from(refs.correlationIds)
  };
}

function getExecutionEvidence(result: any): Record<string, unknown> | null {
  const evidence = result?.metadata?.executionEvidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return null;
  }
  return evidence as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function collectExecutionRefs(
  value: unknown,
  refs: { approvalIds: Set<string>; taskIds: Set<string>; correlationIds: Set<string> }
) {
  if (!value) return;

  if (typeof value === 'string') {
    try {
      collectExecutionRefs(JSON.parse(value), refs);
    } catch {
      collectLooseRefs(value, refs);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectExecutionRefs(item, refs));
    return;
  }

  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  addRef(record.approvalId, refs.approvalIds);
  addRef(record.approval_id, refs.approvalIds);
  addRef(record.taskId, refs.taskIds);
  addRef(record.task_id, refs.taskIds);
  addRef(record.correlationId, refs.correlationIds);
  addRef(record.correlation_id, refs.correlationIds);

  Object.values(record).forEach((item) => collectExecutionRefs(item, refs));
}

function collectLooseRefs(
  text: string,
  refs: { approvalIds: Set<string>; taskIds: Set<string>; correlationIds: Set<string> }
) {
  const patterns: Array<[RegExp, Set<string>]> = [
    [/(?:approvalId|approval_id|approval)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.approvalIds],
    [/(?:taskId|task_id|task)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.taskIds],
    [/(?:correlationId|correlation_id|corr)\s*[:=]\s*["']?([a-zA-Z0-9._:-]{8,128})/g, refs.correlationIds]
  ];

  patterns.forEach(([pattern, target]) => {
    Array.from(text.matchAll(pattern)).forEach((match) => {
      if (match[1]) target.add(match[1]);
    });
  });
}

function addRef(value: unknown, target: Set<string>) {
  if (typeof value === 'string' && value.length >= 8) {
    target.add(value);
  }
}

function buildNodeClosure(refs: ExecutionRefs, approvals: ToolApproval[], tasks: Task[], currentTaskId: string) {
  const taskIds = new Set(refs.taskIds.filter((id) => id !== currentTaskId));
  const correlationIds = new Set(refs.correlationIds);
  const approvalIds = new Set(refs.approvalIds);

  const relatedApprovals = approvals.filter((approval) => (
    approvalIds.has(approval.id) ||
    (approval.correlation_id ? correlationIds.has(approval.correlation_id) : false) ||
    taskIds.has(findStringField(approval.input, 'taskId') || '') ||
    taskIds.has(findStringField(approval.execution_result, 'taskId') || '')
  ));

  relatedApprovals.forEach((approval) => {
    const inputTaskId = findStringField(approval.input, 'taskId');
    const resultTaskId = findStringField(approval.execution_result, 'taskId');
    if (inputTaskId && inputTaskId !== currentTaskId) taskIds.add(inputTaskId);
    if (resultTaskId && resultTaskId !== currentTaskId) taskIds.add(resultTaskId);
  });

  const relatedTasks = tasks.filter((task) => taskIds.has(task.id));
  return {
    approvals: dedupeById(relatedApprovals),
    tasks: dedupeById(relatedTasks)
  };
}

function findStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringField(item, key);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === 'string' && direct.length > 0) return direct;

  for (const child of Object.values(record)) {
    const found = findStringField(child, key);
    if (found) return found;
  }
  return null;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function ClosurePanel({
  title,
  empty,
  required,
  requiredLabel,
  children
}: {
  title: string;
  empty: string;
  required: boolean;
  requiredLabel: string;
  children: ReactNode;
}) {
  const hasChildren = Boolean(children) && (!Array.isArray(children) || children.length > 0);
  return (
    <div className="rounded-lg border border-border bg-background p-3 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h6 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{title}</h6>
        {required && <span className="text-[11px] text-amber-500">{requiredLabel}</span>}
      </div>
      {hasChildren ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <div className="text-sm text-text-tertiary">{empty}</div>
      )}
    </div>
  );
}

function ApprovalStatusBadge({ status, t }: { status: ToolApproval['status']; t: (key: MessageKey) => string }) {
  const statusKeys: Record<ToolApproval['status'], MessageKey> = {
    pending: 'toolApprovals.status.pending',
    approved: 'toolApprovals.status.approved',
    rejected: 'toolApprovals.status.rejected',
    executed: 'toolApprovals.status.executed',
    failed: 'toolApprovals.status.failed'
  };
  return (
    <span className={clsx(
      'px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap',
      status === 'pending' && 'bg-amber-500/10 text-amber-500',
      status === 'approved' && 'bg-blue-500/10 text-blue-500',
      status === 'executed' && 'bg-status-success/10 text-status-success',
      status === 'failed' && 'bg-status-failed/10 text-status-failed',
      status === 'rejected' && 'bg-text-tertiary/10 text-text-tertiary'
    )}>
      {t(statusKeys[status])}
    </span>
  );
}

function TaskStatusBadge({ status, t }: { status: string; t: (key: MessageKey) => string }) {
  return (
    <span className={clsx(
      'px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap',
      status === 'completed' && 'bg-status-success/10 text-status-success',
      status === 'running' && 'bg-status-running/10 text-status-running',
      status === 'failed' && 'bg-status-failed/10 text-status-failed',
      status === 'paused' && 'bg-status-paused/10 text-status-paused',
      (status === 'pending' || status === 'cancelled') && 'bg-status-pending/10 text-status-pending'
    )}>
      {t(taskStatusKeys[status] || 'common.unknown')}
    </span>
  );
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function RunbookMetaItem({
  label,
  value,
  tone = 'normal'
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warning' | 'success';
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 min-w-0">
      <div className="text-xs text-text-tertiary truncate">{label}</div>
      <div
        className={clsx(
          'mt-1 text-sm font-medium truncate',
          tone === 'normal' && 'text-text-primary',
          tone === 'warning' && 'text-amber-500',
          tone === 'success' && 'text-status-success'
        )}
      >
        {value}
      </div>
    </div>
  );
}
