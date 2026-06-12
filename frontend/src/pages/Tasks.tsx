import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Play, Pause, XCircle, Clock, CheckCircle, XCircle as XIcon, FileText, Activity, List, FileCheck } from 'lucide-react';
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
}

interface Workflow {
  id: string;
  name: string;
  nodes: any[];
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
    if (!taskId || !tasks || selectedTask?.id === taskId) {
      return;
    }

    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      handleSelectTask(task, false);
    }
  }, [searchParams, tasks, selectedTask?.id]);

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
      setSearchParams({ taskId: task.id });
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
            {tasks?.map((task) => (
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
                      const status = result?.status || (isRunning ? 'running' : 'pending');

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
                          const status = result?.status || (isRunning ? 'running' : 'pending');

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
