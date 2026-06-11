import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, CheckCircle2, AlertCircle, Loader2, GripVertical, Power, Zap, Bot, ArrowRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useLocale } from '../contexts/LocaleContext';

interface AIModel {
  id: string;
  name: string;
  provider_type: 'volcengine' | 'openai' | 'aliyun' | 'deepseek' | 'zhipu' | 'local';
  api_key?: string;
  api_base?: string;
  model_id: string;
  enabled: number;
  sort_order: number;
  is_default: number;
  tags?: string[];
  last_test_status?: string;
  last_test_time?: string;
  created_at: string;
  updated_at: string;
}

interface ProviderPreset {
  value: 'volcengine' | 'openai' | 'aliyun' | 'deepseek' | 'zhipu' | 'local';
  label: string;
  icon: string;
  color: string;
  defaultBase: string;
  defaultModels: string[];
  needApiKey: boolean;
  description?: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    value: 'volcengine',
    label: 'Volcengine (Ark)',
    icon: '🔥',
    color: 'blue',
    defaultBase: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModels: ['doubao-1-5-lite-32k-250115', 'doubao-1-5-pro-32k-250115', 'deepseek-v3-250324'],
    needApiKey: true,
    description: 'Supports Doubao, DeepSeek, and other models',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    icon: '🐳',
    color: 'cyan',
    defaultBase: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
    needApiKey: true,
    description: 'Official DeepSeek API',
  },
  {
    value: 'aliyun',
    label: 'Alibaba Cloud (Bailian)',
    icon: '☁️',
    color: 'orange',
    defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    needApiKey: true,
    description: 'Qwen model family',
  },
  {
    value: 'zhipu',
    label: 'Zhipu AI',
    icon: '🧠',
    color: 'purple',
    defaultBase: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModels: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-3-turbo'],
    needApiKey: true,
    description: 'GLM model family',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    color: 'green',
    defaultBase: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    needApiKey: true,
    description: 'Official OpenAI API',
  },
  {
    value: 'local',
    label: 'Local AI (Ollama/LM Studio)',
    icon: '💻',
    color: 'slate',
    defaultBase: 'http://host.docker.internal:11434/v1',
    defaultModels: ['qwen2.5:7b', 'llama3.1:8b', 'codellama:7b'],
    needApiKey: false,
    description: 'Locally deployed open-source models',
  },
];

export default function AIModels() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { locale, t } = useLocale();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [draggedModel, setDraggedModel] = useState<string | null>(null);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [addStep, setAddStep] = useState<'select' | 'form'>('select');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    provider_type: 'volcengine' as 'volcengine' | 'openai' | 'aliyun' | 'deepseek' | 'zhipu' | 'local',
    model_id: '',
    api_key: '',
    api_base: '',
    tags: ''
  });

  const { data: modelsData } = useQuery({
    queryKey: ['aiModels'],
    queryFn: async () => {
      const res = await api.get('/api/ai-models');
      return res.data.data as AIModel[];
    }
  });

  const createModelMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/api/ai-models', {
        name: data.name,
        provider_type: data.provider_type,
        model_id: data.model_id,
        api_key: data.api_key || null,
        api_base: data.api_base || null,
        use_global_config: false,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(t => t) : []
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
      setShowAddModal(false);
      resetForm();
      setAddStep('select');
    }
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: {
      name?: string;
      provider_type?: 'volcengine' | 'openai' | 'aliyun' | 'deepseek' | 'zhipu' | 'local';
      model_id?: string;
      api_key?: string | null;
      api_base?: string | null;
      enabled?: number;
      is_default?: number;
      tags?: string[];
    }}) => {
      const res = await api.put(`/api/ai-models/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
      setEditingModel(null);
      resetForm();
      setAddStep('select');
    }
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/api/ai-models/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
      toast.success(t('aiModels.toast.deleteSuccess'));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || t('aiModels.toast.deleteFailed');
      toast.error(message);
    }
  });

  const toggleModelMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await api.put(`/api/ai-models/${id}`, { enabled: enabled ? 1 : 0 });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
    }
  });

  const setDefaultModelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/api/ai-models/${id}`, { is_default: 1 });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
    }
  });

  const reorderMutation = useMutation({
    mutationFn: async (modelIds: string[]) => {
      const res = await api.put('/api/ai-models/reorder', { modelIds });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
    }
  });

  const testModelMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingModel(id);
      const res = await api.post(`/api/ai-models/${id}/test`);
      return res.data;
    },
    onSuccess: (data, id) => {
      setTestingModel(null);
      setTestResults(prev => ({
        ...prev,
        [id]: {
          success: data.success,
          message: data.data?.message || ''
        }
      }));
      queryClient.invalidateQueries({ queryKey: ['aiModels'] });
    },
    onError: (_err, id) => {
      setTestingModel(null);
      setTestResults(prev => ({
        ...prev,
        [id]: {
          success: false,
          message: t('aiModels.testFailed')
        }
      }));
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      provider_type: 'volcengine',
      model_id: '',
      api_key: '',
      api_base: '',
      tags: ''
    });
  };

  const handleAddModel = () => {
    resetForm();
    setAddStep('select');
    setShowAddModal(true);
  };

  const handleEditModel = (model: AIModel) => {
    setEditingModel(model);
    setFormData({
      name: model.name,
      provider_type: model.provider_type,
      model_id: model.model_id,
      api_key: model.api_key || '',
      api_base: model.api_base || '',
      tags: model.tags ? model.tags.join(', ') : ''
    });
    setAddStep('form');
    setShowAddModal(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.model_id) {
      alert(t('aiModels.validation.required'));
      return;
    }

    if (editingModel) {
      updateModelMutation.mutate({
        id: editingModel.id,
        data: {
          name: formData.name,
          provider_type: formData.provider_type,
          model_id: formData.model_id,
          api_key: formData.api_key || null,
          api_base: formData.api_base || null,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(t => t) : []
        }
      });
    } else {
      createModelMutation.mutate(formData);
    }
  };

  const handleProviderSelect = (provider: ProviderPreset) => {
    setFormData({
      ...formData,
      provider_type: provider.value,
      api_base: provider.defaultBase,
      model_id: provider.defaultModels[0] || '',
      name: provider.label
    });
    setAddStep('form');
    setShowProviderDropdown(false);
  };

  const handleDragStart = (modelId: string) => {
    setDraggedModel(modelId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetModelId: string) => {
    if (!draggedModel || draggedModel === targetModelId) return;

    const models = modelsData || [];
    const newOrder = [...models];
    const dragIndex = newOrder.findIndex(m => m.id === draggedModel);
    const dropIndex = newOrder.findIndex(m => m.id === targetModelId);

    if (dragIndex === -1 || dropIndex === -1) return;

    const [dragged] = newOrder.splice(dragIndex, 1);
    newOrder.splice(dropIndex, 0, dragged);

    const modelIds = newOrder.map(m => m.id);
    reorderMutation.mutate(modelIds);
    setDraggedModel(null);
  };

  const getProviderLabel = (type: string) => {
    switch (type) {
      case 'volcengine':
        return 'Volcengine';
      case 'deepseek':
        return 'DeepSeek';
      case 'aliyun':
        return 'Alibaba Cloud';
      case 'zhipu':
        return 'Zhipu AI';
      case 'openai':
        return 'OpenAI';
      case 'local':
        return 'Local AI';
      default:
        return type;
    }
  };

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'volcengine':
        return 'bg-blue-500/10 text-blue-400';
      case 'deepseek':
        return 'bg-cyan-500/10 text-cyan-400';
      case 'aliyun':
        return 'bg-orange-500/10 text-orange-400';
      case 'zhipu':
        return 'bg-purple-500/10 text-purple-400';
      case 'openai':
        return 'bg-green-500/10 text-green-400';
      case 'local':
        return 'bg-slate-500/10 text-slate-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  const getProviderPreset = (type: 'volcengine' | 'openai' | 'aliyun' | 'deepseek' | 'zhipu' | 'local') => {
    return PROVIDER_PRESETS.find(p => p.value === type);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">{t('aiModels.title')}</h1>
            <p className="text-text-secondary">{t('aiModels.subtitle')}</p>
          </div>
          <button
            onClick={handleAddModel}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {t('aiModels.add')}
          </button>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          {modelsData && modelsData.length > 0 ? (
            <div className="divide-y divide-border">
              {modelsData.map((model) => (
                <div
                  key={model.id}
                  draggable
                  onDragStart={() => handleDragStart(model.id)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(model.id)}
                  className={clsx(
                    'p-4 transition-all cursor-move',
                    model.enabled ? 'bg-surface' : 'bg-surface/50 opacity-60'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <GripVertical className="w-5 h-5 text-text-secondary mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-text-primary">{model.name}</h3>
                        {model.is_default === 1 && (
                          <span className="px-2 py-0.5 rounded text-xs bg-primary/20 text-primary">{t('aiModels.default')}</span>
                        )}
                        {model.enabled === 1 ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-status-success/10 text-status-success">{t('status.enabled')}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-status-failed/10 text-status-failed">{t('status.disabled')}</span>
                        )}
                        <span className={clsx('px-2 py-0.5 rounded text-xs', getProviderColor(model.provider_type))}>
                          {getProviderLabel(model.provider_type)}
                        </span>
                      </div>
                      <div className="text-sm text-text-secondary">
                        <span>{t('aiModels.modelId')}: {model.model_id}</span>
                        {model.tags && model.tags.length > 0 && (
                          <span className="ml-4">
                            {t('common.tags')}: {model.tags.join(', ')}
                          </span>
                        )}
                      </div>
                      {model.last_test_time && (
                        <div className="text-xs text-text-tertiary mt-1">
                          {t('aiModels.lastTest')}: {new Date(model.last_test_time).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')} - {model.last_test_status === 'success' ? t('common.success') : t('common.failed')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => testModelMutation.mutate(model.id)}
                        disabled={testingModel === model.id}
                        className="px-3 py-1.5 rounded-lg hover:bg-background transition-colors flex items-center gap-1.5 text-sm"
                        title={t('aiModels.testConnectivity')}
                      >
                        {testingModel === model.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        ) : (
                          <Zap className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="text-text-secondary">{t('common.test')}</span>
                      </button>
                      <button
                        onClick={() => toggleModelMutation.mutate({ id: model.id, enabled: model.enabled === 0 })}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm',
                          model.enabled === 1 
                            ? 'bg-status-success/10 text-status-success hover:bg-status-success/20' 
                            : 'bg-status-failed/10 text-status-failed hover:bg-status-failed/20'
                        )}
                        title={model.enabled === 1 ? t('status.disabled') : t('status.enabled')}
                      >
                        <Power className="w-4 h-4" />
                        <span>{model.enabled === 1 ? t('status.disabled') : t('status.enabled')}</span>
                      </button>
                      {model.is_default !== 1 && (
                        <button
                          onClick={() => setDefaultModelMutation.mutate(model.id)}
                          className="px-3 py-1.5 rounded-lg hover:bg-background transition-colors flex items-center gap-1.5 text-sm"
                          title={t('aiModels.setDefault')}
                        >
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                          <span className="text-text-secondary">{t('aiModels.default')}</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleEditModel(model)}
                        className="px-3 py-1.5 rounded-lg hover:bg-background transition-colors flex items-center gap-1.5 text-sm"
                        title={t('common.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="text-text-secondary">{t('common.edit')}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t('aiModels.deleteConfirm'))) {
                            deleteModelMutation.mutate(model.id);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg hover:bg-status-failed/10 transition-colors flex items-center gap-1.5 text-sm"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4 text-status-failed" />
                        <span className="text-status-failed">{t('common.delete')}</span>
                      </button>
                    </div>
                  </div>
                  {testResults[model.id] && (
                    <div className={clsx(
                      'mt-3 p-2 rounded text-sm flex items-center gap-2',
                      testResults[model.id].success ? 'bg-status-success/10 text-status-success' : 'bg-status-failed/10 text-status-failed'
                    )}>
                      {testResults[model.id].success ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      {testResults[model.id].message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 mx-auto text-text-secondary mb-4" />
              <p className="text-text-secondary mb-2">{t('aiModels.empty.title')}</p>
              <p className="text-sm text-text-tertiary mb-4">{t('aiModels.empty.desc')}</p>
              <button
                onClick={handleAddModel}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all"
              >
                {t('aiModels.empty.action')}
              </button>
            </div>
          )}
        </div>

        {/* 添加/编辑模型弹窗 */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              {addStep === 'select' ? (
                <>
                  <h4 className="font-medium text-text-primary mb-2">{t('aiModels.selectProvider')}</h4>
                  <p className="text-sm text-text-secondary mb-6">{t('aiModels.selectProviderDesc')}</p>
                  
                  <div className="space-y-3">
                    {PROVIDER_PRESETS.map((provider) => (
                      <button
                        key={provider.value}
                        onClick={() => handleProviderSelect(provider)}
                        className="w-full flex items-center gap-4 p-4 bg-background border border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                      >
                        <span className="text-2xl">{provider.icon}</span>
                        <div className="flex-1">
                          <p className="font-medium text-text-primary">{provider.label}</p>
                          <p className="text-xs text-text-tertiary mt-1">
                            {provider.needApiKey ? t('aiModels.needApiKey') : t('aiModels.noApiKey')} · {t('aiModels.defaultModels')}: {provider.defaultModels.join(', ')}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-text-secondary" />
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-end mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        setAddStep('select');
                      }}
                      className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-medium text-text-primary mb-4">
                    {editingModel ? t('aiModels.editTitle') : t('aiModels.configTitle')}
                  </h4>
                  
                  <div className="space-y-4">
                    {/* 平台选择 */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-text-secondary mb-2">{t('aiModels.provider')} *</label>
                      <button
                        onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-background border border-border rounded-lg text-text-primary hover:border-primary/50 transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <span>{getProviderPreset(formData.provider_type)?.icon}</span>
                          <span>{getProviderLabel(formData.provider_type)}</span>
                        </span>
                        <ChevronDown className="w-4 h-4 text-text-secondary" />
                      </button>
                      
                      {showProviderDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-10">
                          {PROVIDER_PRESETS.map((provider) => (
                            <button
                              key={provider.value}
                              onClick={() => handleProviderSelect(provider)}
                              className={clsx(
                                'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-all',
                                formData.provider_type === provider.value && 'bg-primary/10'
                              )}
                            >
                              <span>{provider.icon}</span>
                              <span className="text-text-primary">{provider.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 显示名称 */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">{t('aiModels.displayName')} *</label>
                      <input
                        type="text"
                        placeholder={t('aiModels.displayNamePlaceholder')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* 模型 ID */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">{t('aiModels.modelId')} *</label>
                      <input
                        type="text"
                        placeholder={t('aiModels.modelIdPlaceholder')}
                        value={formData.model_id}
                        onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                        className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      />
                      {/* 快速选择常用模型 */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {getProviderPreset(formData.provider_type)?.defaultModels.map((model) => (
                          <button
                            key={model}
                            onClick={() => setFormData({ ...formData, model_id: model })}
                            className={clsx(
                              'px-2 py-1 rounded text-xs transition-all',
                              formData.model_id === model
                                ? 'bg-primary/20 text-primary border border-primary/50'
                                : 'bg-background border border-border text-text-secondary hover:border-primary/30'
                            )}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* API Key */}
                    {getProviderPreset(formData.provider_type)?.needApiKey && (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">API Key *</label>
                        <input
                          type="password"
                          placeholder="sk-xxxxxxxxxxxx"
                          value={formData.api_key}
                          onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                          className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                      </div>
                    )}

                    {/* API Base URL */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">{t('aiModels.apiBase')}</label>
                      <input
                        type="text"
                        placeholder={getProviderPreset(formData.provider_type)?.defaultBase}
                        value={formData.api_base}
                        onChange={(e) => setFormData({ ...formData, api_base: e.target.value })}
                        className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      />
                      <p className="text-xs text-text-tertiary mt-1">
                        {t('aiModels.defaultApiBase')}: {getProviderPreset(formData.provider_type)?.defaultBase}
                      </p>
                    </div>

                    {/* 标签 */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">{t('aiModels.tagsLabel')}</label>
                      <input
                        type="text"
                        placeholder={t('aiModels.tagsPlaceholder')}
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
                    <button
                      onClick={() => {
                        setShowAddModal(false);
                        setEditingModel(null);
                        setAddStep('select');
                        resetForm();
                      }}
                      className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-all"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={createModelMutation.isPending || updateModelMutation.isPending}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {(createModelMutation.isPending || updateModelMutation.isPending) && (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      )}
                      {editingModel ? t('common.save') : t('aiModels.addAndTest')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
