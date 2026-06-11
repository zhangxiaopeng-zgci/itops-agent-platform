import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Database, Shield, Loader2, CheckCircle2, AlertCircle, Sun, Moon, Lock, BookOpen, Upload, FileText, Globe, Wifi, Brain, Palette, Monitor, Languages } from 'lucide-react';
import clsx from 'clsx';
import { BackgroundStyle, ThemeMode, useTheme } from '../contexts/ThemeContext';
import { Locale, useLocale, type MessageKey } from '../contexts/LocaleContext';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword, getPasswordStrength } from '../utils/passwordValidator';
import AIModels from './AIModels';

interface Backup {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
}

export default function Settings() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('models');
  const queryClient = useQueryClient();
  const { theme, themeMode, backgroundStyle, setThemeMode, setBackgroundStyle } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const { user, login, updateUser } = useAuth();
  const navigate = useNavigate();

  // 创建备份 mutation
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/backups/create');
      return res.data;
    },
    onSuccess: () => {
      alert(t('settings.database.backup.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['backupHistory'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.response?.data?.message || t('settings.database.backup.createFailed'));
    }
  });

  // 备份历史查询
  const { data: backupHistoryData } = useQuery({
    queryKey: ['backupHistory'],
    queryFn: async () => {
      const res = await api.get('/api/backups/history');
      return res.data.data;
    }
  });
  const backupHistory = (backupHistoryData || []) as Backup[];

  // 恢复备份 mutation
  const restoreBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await api.post(`/api/backups/restore/${backupId}`);
      return res.data;
    },
    onSuccess: () => {
      alert(t('settings.database.backup.restoreSuccess'));
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.response?.data?.message || t('settings.database.backup.restoreFailed'));
    }
  });

  // 删除备份 mutation
  const deleteBackupMutation = useMutation({
    mutationFn: async (backupId: string) => {
      const res = await api.delete(`/api/backups/${backupId}`);
      return res.data;
    },
    onSuccess: () => {
      alert(t('settings.database.backup.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['backupHistory'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.response?.data?.message || t('settings.database.backup.deleteFailed'));
    }
  });

  // 上传备份 mutation
  const uploadBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('backup', file);
      const res = await api.post('/api/backups/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      alert(t('settings.database.backup.uploadSuccess'));
      queryClient.invalidateQueries({ queryKey: ['backupHistory'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.response?.data?.message || t('settings.database.backup.uploadFailed'));
    }
  });
  
  // 密码修改状态
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState('');
  
  // 通知配置本地状态
  const [notificationConfig, setNotificationConfig] = useState({
    webhook_enabled: true,
    email_enabled: false,
    wechat_enabled: false,
    dingtalk_enabled: false,
    email_config: {},
    wechat_config: {},
    dingtalk_config: {},
    alert_notification: {
      critical: true,
      warning: true,
      info: false
    },
    task_notification: {
      success: true,
      failed: true,
      running: false
    }
  });

  // QAnything 配置查询
  useQuery({
    queryKey: ['qanythingConfig'],
    queryFn: async () => {
      const res = await api.get('/api/knowledge/qanything/config');
      if (res.data.data) {
        // 保留前端已有的真实 apiKey，防止被后端脱敏值覆盖
        const backendData = res.data.data;
        if (backendData.apiKey && backendData.apiKey.includes('****')) {
          backendData.apiKey = qanythingConfig.apiKey;
        }
        setQanythingConfig(backendData);
      }
      return res.data.data;
    },
  });

  // QAnything 配置保存
  const qanythingConfigMutation = useMutation({
    mutationFn: async (config: any) => {
      const res = await api.post('/api/knowledge/qanything/config', config);
      return res.data;
    },
    onMutate: () => {
      setQanythingSaveStatus('saving');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qanythingConfig'] });
      setQanythingSaveStatus('saved');
      setQanythingTestMessage(t('settings.common.saved'));
      setQanythingTestStatus('success');
      setTimeout(() => setQanythingSaveStatus('idle'), 2000);
      setTimeout(() => setQanythingTestStatus('idle'), 3000);
    },
    onError: (err: any) => {
      setQanythingSaveStatus('error');
      setQanythingTestMessage(err.response?.data?.error || t('settings.common.saveFailed'));
      setQanythingTestStatus('error');
      setTimeout(() => setQanythingSaveStatus('idle'), 3000);
      setTimeout(() => setQanythingTestStatus('idle'), 5000);
    },
  });

  // QAnything 连接测试
  const qanythingTestMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/knowledge/qanything/test');
      return res.data;
    },
    onMutate: () => {
      setQanythingTestStatus('testing');
      setQanythingTestMessage('');
    },
    onSuccess: (data) => {
      setQanythingTestStatus(data.success ? 'success' : 'error');
      setQanythingTestMessage(data.message);
    },
    onError: (err: any) => {
      setQanythingTestStatus('error');
      setQanythingTestMessage(err.response?.data?.error || err.response?.data?.message || t('settings.qanything.connectionFailed'));
    },
  });

  const handleTestQAnythingConnection = () => {
    if (!qanythingConfig.apiBase.trim()) {
      setQanythingTestStatus('error');
      setQanythingTestMessage(t('settings.qanything.error.apiBaseRequired'));
      setTimeout(() => setQanythingTestStatus('idle'), 3000);
      return;
    }
    qanythingTestMutation.mutate();
  };

  const handleUploadDocuments = () => {
    if (!qanythingConfig.enabled) {
      setUploadStatus('error');
      setUploadMessage(t('settings.qanything.error.enableFirst'));
      setTimeout(() => setUploadStatus('idle'), 5000);
      return;
    }
    if (uploadFiles.length === 0) {
      setUploadStatus('error');
      setUploadMessage(t('settings.qanything.error.selectFiles'));
      setTimeout(() => setUploadStatus('idle'), 3000);
      return;
    }
    uploadMutation.mutate(uploadFiles);
  };

  // 文档上传
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      const res = await api.post('/api/knowledge/qanything/upload-batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onMutate: () => {
      setUploadStatus('uploading');
      setUploadMessage('');
    },
    onSuccess: (data) => {
      setUploadStatus('success');
      setUploadMessage(t('settings.qanything.uploadResult', {
        success: data.summary?.success || 0,
        failed: data.summary?.failed || 0,
      }));
      setUploadFiles([]);
      setTimeout(() => setUploadStatus('idle'), 5000);
    },
    onError: (err: any) => {
      setUploadStatus('error');
      setUploadMessage(err.response?.data?.error || t('settings.qanything.uploadFailed'));
      setTimeout(() => setUploadStatus('idle'), 5000);
    },
  });
  const [notificationSaveStatus, setNotificationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // QAnything 配置本地状态
  const [qanythingConfig, setQanythingConfig] = useState({
    enabled: false,
    apiBase: '',
    apiKey: '',
    kbId: '',
    mode: 'cloud' as 'cloud' | 'local',
    topK: 5,
  });
  const [qanythingSaveStatus, setQanythingSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [qanythingTestStatus, setQanythingTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [qanythingTestMessage, setQanythingTestMessage] = useState('');

  // 文档上传状态
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // 如果是强制修改密码，自动切换到安全设置标签
  useEffect(() => {
    if (searchParams.get('changePassword') === 'true') {
      setActiveTab('security');
    }
  }, [searchParams]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setUploadFiles((prev) => [...prev, ...Array.from(files)]);
    }
  };

  const removeFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveQAnythingConfig = () => {
    if (qanythingConfig.enabled) {
      if (!qanythingConfig.apiBase.trim()) {
        setQanythingSaveStatus('error');
        setQanythingTestMessage(t('settings.qanything.error.apiBaseEmpty'));
        setQanythingTestStatus('error');
        setTimeout(() => setQanythingSaveStatus('idle'), 3000);
        setTimeout(() => setQanythingTestStatus('idle'), 3000);
        return;
      }
      if (!qanythingConfig.kbId.trim()) {
        setQanythingSaveStatus('error');
        setQanythingTestMessage(t('settings.qanything.error.kbIdEmpty'));
        setQanythingTestStatus('error');
        setTimeout(() => setQanythingSaveStatus('idle'), 3000);
        setTimeout(() => setQanythingTestStatus('idle'), 3000);
        return;
      }
      // 云端模式要求 API Key，本地模式可不填
      if (qanythingConfig.mode === 'cloud' && !qanythingConfig.apiKey.trim()) {
        setQanythingSaveStatus('error');
        setQanythingTestMessage(t('settings.qanything.error.apiKeyEmpty'));
        setQanythingTestStatus('error');
        setTimeout(() => setQanythingSaveStatus('idle'), 3000);
        setTimeout(() => setQanythingTestStatus('idle'), 3000);
        return;
      }
    }
    qanythingConfigMutation.mutate(qanythingConfig);
  };

  // 密码修改处理
  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordStatus('saving');
    
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.security.password.mismatch'));
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 3000);
      return;
    }
    
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      setPasswordError(t('settings.security.password.invalid'));
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 3000);
      return;
    }
    
    try {
      const response = await api.post('/api/auth/change-password', {
        currentPassword,
        newPassword
      });
      
      if (response.data.success) {
        setPasswordStatus('saved');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        
        if (user) {
          const updatedUser = { ...user, passwordMustChange: false };
          updateUser(updatedUser);
        }
        
        // 清除 URL 中的 changePassword 参数
        navigate('/settings', { replace: true });
        
        setTimeout(() => setPasswordStatus('idle'), 3000);
      } else {
        setPasswordError(response.data.error || response.data.message || t('settings.security.password.changeFailed'));
        setPasswordStatus('error');
        setTimeout(() => setPasswordStatus('idle'), 3000);
      }
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || err.response?.data?.message || t('settings.security.password.changeFailed'));
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 3000);
    }
  };

  useQuery({
    queryKey: ['notificationConfig'],
    queryFn: async () => {
      const res = await api.get('/api/notification-config');
      if (res.data.data) {
        setNotificationConfig(res.data.data);
      }
      return res.data.data;
    },
  });

  const notificationConfigMutation = useMutation({
    mutationFn: async (config: any) => {
      const res = await api.put('/api/notification-config', config);
      return res.data;
    },
    onMutate: () => {
      setNotificationSaveStatus('saving');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationConfig'] });
      setNotificationSaveStatus('saved');
      setTimeout(() => setNotificationSaveStatus('idle'), 2000);
    },
    onError: () => {
      setNotificationSaveStatus('error');
      setTimeout(() => setNotificationSaveStatus('idle'), 3000);
    },
  });

  const tabs = [
    { id: 'models', name: t('settings.tabs.models'), icon: Brain },
    { id: 'qanything', name: t('settings.tabs.qanything'), icon: BookOpen },
    { id: 'notifications', name: t('settings.tabs.notifications'), icon: Bell },
    { id: 'database', name: t('settings.tabs.database'), icon: Database },
    { id: 'security', name: t('settings.tabs.security'), icon: Shield },
    { id: 'appearance', name: t('settings.tabs.appearance'), icon: Palette },
  ];
  const themeOptions: Array<{ id: ThemeMode; name: string; description: string; icon: typeof Monitor }> = [
    { id: 'system', name: t('settings.theme.system'), description: t('settings.theme.systemDesc'), icon: Monitor },
    { id: 'dark', name: t('settings.theme.dark'), description: t('settings.theme.darkDesc'), icon: Moon },
    { id: 'light', name: t('settings.theme.light'), description: t('settings.theme.lightDesc'), icon: Sun },
  ];
  const backgroundOptions: Array<{ id: BackgroundStyle; name: string; description: string; swatches: string[] }> = [
    {
      id: 'carbon',
      name: t('settings.background.carbon'),
      description: t('settings.background.carbonDesc'),
      swatches: ['#111312', '#1b1f1d', '#4f766b']
    },
    {
      id: 'slate',
      name: t('settings.background.slate'),
      description: t('settings.background.slateDesc'),
      swatches: ['#101418', '#1a2027', '#587083']
    },
    {
      id: 'moss',
      name: t('settings.background.moss'),
      description: t('settings.background.mossDesc'),
      swatches: ['#11140f', '#1b2118', '#62745a']
    }
  ];
  const languageOptions: Array<{ id: Locale; name: string; description: string }> = [
    { id: 'zh-CN', name: t('common.chinese'), description: t('settings.language.zhDesc') },
    { id: 'en-US', name: t('common.english'), description: t('settings.language.enDesc') },
  ];
  const passwordRequirementLabel = (key: string) => {
    const labels: Record<string, string> = {
      minLength: t('settings.security.password.requirement.minLength'),
      uppercase: t('settings.security.password.requirement.uppercase'),
      lowercase: t('settings.security.password.requirement.lowercase'),
      number: t('settings.security.password.requirement.number'),
      special: t('settings.security.password.requirement.special'),
    };
    return labels[key] || key;
  };
  const passwordStrengthLabel = (password: string) => t(`settings.security.password.strength.${getPasswordStrength(password).level}` as MessageKey);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">{t('settings.title')}</h1>
          <p className="text-text-secondary">{t('settings.subtitle')}</p>
        </div>

        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="flex">
            <div className="w-64 border-r border-border p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                        activeTab === tab.id
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-background'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {tab.name}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex-1 p-6">
              {activeTab === 'models' && <AIModels />}

              {activeTab === 'qanything' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      {t('settings.qanything.title')}
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                      {t('settings.qanything.subtitle')}
                    </p>
                  </div>

                  {/* 知识库连接配置 */}
                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      {t('settings.qanything.connection')}
                    </h4>
                    
                    <div className="space-y-4">
                      {/* 启用开关 */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{t('settings.qanything.enabled')}</p>
                          <p className="text-xs text-text-secondary">{t('settings.qanything.enabledDesc')}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={qanythingConfig.enabled}
                            onChange={(e) => setQanythingConfig({...qanythingConfig, enabled: e.target.checked})}
                          />
                          <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                        </label>
                      </div>

                      {/* 部署模式 */}
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.qanything.mode')}</label>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setQanythingConfig({...qanythingConfig, mode: 'cloud'})}
                            className={clsx(
                              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                              qanythingConfig.mode === 'cloud'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface text-text-secondary border-border hover:border-primary/50'
                            )}
                          >
                            {t('settings.qanything.mode.cloud')}
                          </button>
                          <button
                            onClick={() => setQanythingConfig({...qanythingConfig, mode: 'local'})}
                            className={clsx(
                              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border',
                              qanythingConfig.mode === 'local'
                                ? 'bg-primary text-white border-primary'
                                : 'bg-surface text-text-secondary border-border hover:border-primary/50'
                            )}
                          >
                            {t('settings.qanything.mode.local')}
                          </button>
                        </div>
                        <p className="text-xs text-text-secondary mt-2">
                          {qanythingConfig.mode === 'cloud' 
                            ? t('settings.qanything.mode.cloudDesc')
                            : t('settings.qanything.mode.localDesc')}
                        </p>
                      </div>

                      {/* API 地址 */}
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.qanything.apiBase')}</label>
                        <input
                          type="text"
                          placeholder={qanythingConfig.mode === 'cloud' ? 'https://openapi.youdao.com/q_anything/api' : 'http://localhost:8777'}
                          value={qanythingConfig.apiBase}
                          onChange={(e) => setQanythingConfig({...qanythingConfig, apiBase: e.target.value})}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                        <p className="text-xs text-text-secondary mt-1">
                          {qanythingConfig.mode === 'cloud' 
                            ? t('settings.qanything.apiBase.cloudHelp')
                            : t('settings.qanything.apiBase.localHelp')}
                        </p>
                      </div>

                      {/* API 密钥 */}
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                          {qanythingConfig.mode === 'cloud' ? t('settings.qanything.adminSecret') : 'API Key'}
                        </label>
                        <input
                          type="password"
                          placeholder={qanythingConfig.mode === 'cloud' ? t('settings.qanything.adminSecretPlaceholder') : t('settings.qanything.apiKeyPlaceholder')}
                          value={qanythingConfig.apiKey}
                          onChange={(e) => setQanythingConfig({...qanythingConfig, apiKey: e.target.value})}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                      </div>

                      {/* 知识库 ID */}
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.qanything.kbId')}</label>
                        <input
                          type="text"
                          placeholder="KBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx_xxxxxx"
                          value={qanythingConfig.kbId}
                          onChange={(e) => setQanythingConfig({...qanythingConfig, kbId: e.target.value})}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                        <p className="text-xs text-text-secondary mt-1">
                          {t('settings.qanything.kbIdHelp')}
                        </p>
                      </div>

                      {/* 检索数量 */}
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                          {t('settings.qanything.topK')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={qanythingConfig.topK}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 5;
                            setQanythingConfig({...qanythingConfig, topK: Math.max(1, Math.min(20, val))});
                          }}
                          className="w-32 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                        <span className="text-xs text-text-secondary ml-2">{t('settings.qanything.topKHelp')}</span>
                      </div>

                      {/* 测试连接 */}
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={handleTestQAnythingConnection}
                          disabled={qanythingTestStatus === 'testing'}
                          className="px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-surface/80 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                          {qanythingTestStatus === 'testing' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wifi className="w-4 h-4" />
                          )}
                          {t('settings.qanything.testConnection')}
                        </button>
                        
                        {qanythingTestStatus === 'success' && (
                          <span className="text-sm text-status-success flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            {qanythingTestMessage}
                          </span>
                        )}
                        {qanythingTestStatus === 'error' && (
                          <span className="text-sm text-status-failed flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {qanythingTestMessage}
                          </span>
                        )}
                      </div>

                      {/* 保存配置 */}
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="flex items-center gap-2">
                          {qanythingSaveStatus === 'saving' && (
                            <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                          )}
                          {qanythingSaveStatus === 'saved' && (
                            <p className="text-xs text-status-success flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {t('settings.common.saved')}
                            </p>
                          )}
                          {qanythingSaveStatus === 'error' && (
                            <p className="text-xs text-status-failed flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {t('settings.common.saveFailed')}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleSaveQAnythingConfig}
                          disabled={qanythingSaveStatus === 'saving'}
                          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {qanythingSaveStatus === 'saving' && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          {t('settings.qanything.saveConfig')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 文档上传 */}
                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      {t('settings.qanything.uploadTitle')}
                    </h4>
                    
                    <div className="space-y-4">
                      <div 
                        className={clsx(
                          'border-2 border-dashed rounded-lg p-8 text-center transition-all',
                          isDragOver ? 'border-primary bg-primary/5' : 'border-border'
                        )}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <FileText className="w-12 h-12 mx-auto text-text-secondary mb-3" />
                        <p className="text-sm text-text-primary mb-1">{t('settings.qanything.dropHint')}</p>
                        <p className="text-xs text-text-secondary">{t('settings.qanything.supportedFiles')}</p>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.txt,.csv,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const files = e.target.files;
                            if (files) {
                              setUploadFiles((prev) => [...prev, ...Array.from(files)]);
                              e.target.value = '';
                            }
                          }}
                          className="hidden"
                          id="file-upload"
                        />
                        <label
                          htmlFor="file-upload"
                          className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all cursor-pointer text-sm"
                        >
                          {t('settings.qanything.selectFiles')}
                        </label>
                      </div>

                      {/* 已选文件列表 */}
                      {uploadFiles.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-text-primary">{t('settings.qanything.selectedFiles', { count: uploadFiles.length })}</p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {uploadFiles.map((file, index) => (
                              <div key={index} className="flex items-center justify-between p-2 bg-surface rounded-lg">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText className="w-4 h-4 text-text-secondary flex-shrink-0" />
                                  <span className="text-sm text-text-secondary truncate">{file.name}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-text-secondary">
                                    {formatFileSize(file.size)}
                                  </span>
                                  <button
                                    onClick={() => removeFile(index)}
                                    className="text-xs text-status-failed hover:text-status-failed/80 transition-colors"
                                  >
                                    {t('common.delete')}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 上传状态 */}
                      {uploadStatus !== 'idle' && (
                        <div className={clsx(
                          'p-3 rounded-lg flex items-center gap-2',
                          uploadStatus === 'uploading' && 'bg-blue-500/10 text-blue-400',
                          uploadStatus === 'success' && 'bg-green-500/10 text-green-400',
                          uploadStatus === 'error' && 'bg-red-500/10 text-red-400'
                        )}>
                          {uploadStatus === 'uploading' && <Loader2 className="w-4 h-4 animate-spin" />}
                          {uploadStatus === 'success' && <CheckCircle2 className="w-4 h-4" />}
                          {uploadStatus === 'error' && <AlertCircle className="w-4 h-4" />}
                          <span className="text-sm">{uploadMessage}</span>
                        </div>
                      )}

                      {/* 上传按钮 */}
                      <button
                          onClick={handleUploadDocuments}
                          disabled={!qanythingConfig.enabled || uploadFiles.length === 0 || uploadStatus === 'uploading'}
                          className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                        {uploadStatus === 'uploading' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('settings.qanything.uploading')}
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            {t('settings.qanything.uploadButton')}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                      <Bell className="w-5 h-5" />
                      {t('settings.notifications.title')}
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                      {t('settings.notifications.subtitle')}
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-background rounded-lg p-4">
                      <h4 className="font-medium text-text-primary mb-4">{t('settings.notifications.channels')}</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-text-primary">Webhook</p>
                            <p className="text-xs text-text-secondary">{t('settings.notifications.webhookDesc')}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.webhook_enabled}
                              onChange={(e) => setNotificationConfig({...notificationConfig, webhook_enabled: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-text-primary">{t('settings.notifications.email')}</p>
                            <p className="text-xs text-text-secondary">{t('settings.notifications.emailDesc')}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.email_enabled}
                              onChange={(e) => setNotificationConfig({...notificationConfig, email_enabled: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-text-primary">{t('settings.notifications.wechat')}</p>
                            <p className="text-xs text-text-secondary">{t('settings.notifications.wechatDesc')}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.wechat_enabled}
                              onChange={(e) => setNotificationConfig({...notificationConfig, wechat_enabled: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-text-primary">{t('settings.notifications.dingtalk')}</p>
                            <p className="text-xs text-text-secondary">{t('settings.notifications.dingtalkDesc')}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.dingtalk_enabled}
                              onChange={(e) => setNotificationConfig({...notificationConfig, dingtalk_enabled: e.target.checked})}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="bg-background rounded-lg p-4">
                      <h4 className="font-medium text-text-primary mb-4">{t('settings.notifications.alerts')}</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.alert.critical')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.alert_notification.critical}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                alert_notification: {...notificationConfig.alert_notification, critical: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.alert.warning')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.alert_notification.warning}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                alert_notification: {...notificationConfig.alert_notification, warning: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.alert.info')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.alert_notification.info}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                alert_notification: {...notificationConfig.alert_notification, info: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="bg-background rounded-lg p-4">
                      <h4 className="font-medium text-text-primary mb-4">{t('settings.notifications.tasks')}</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.task.success')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.task_notification.success}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                task_notification: {...notificationConfig.task_notification, success: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.task.failed')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.task_notification.failed}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                task_notification: {...notificationConfig.task_notification, failed: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-text-secondary">{t('settings.notifications.task.running')}</p>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={notificationConfig.task_notification.running}
                              onChange={(e) => setNotificationConfig({
                                ...notificationConfig,
                                task_notification: {...notificationConfig.task_notification, running: e.target.checked}
                              })}
                            />
                            <div className="w-11 h-6 bg-border rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {notificationSaveStatus === 'saving' && (
                          <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                        )}
                        {notificationSaveStatus === 'saved' && (
                          <p className="text-xs text-status-success flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('settings.common.saved')}
                          </p>
                        )}
                        {notificationSaveStatus === 'error' && (
                          <p className="text-xs text-status-failed flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {t('settings.common.saveFailed')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => notificationConfigMutation.mutate(notificationConfig)}
                        disabled={notificationSaveStatus === 'saving'}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {notificationSaveStatus === 'saving' && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                        {t('settings.notifications.save')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'database' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      {t('settings.database.title')}
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                      {t('settings.database.subtitle')}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-background rounded-lg p-4">
                      <h4 className="font-medium text-text-primary mb-2">{t('settings.database.type')}</h4>
                      <p className="text-sm text-text-secondary">{t('settings.database.sqliteCurrent')}</p>
                    </div>

                    <div className="bg-background rounded-lg p-4">
                      <h4 className="font-medium text-text-primary mb-2">{t('settings.database.path')}</h4>
                      <p className="text-sm text-text-secondary">./data/app.db</p>
                    </div>

                    <div className="bg-background rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-text-primary">{t('settings.database.backup.title')}</h4>
                        <div className="flex gap-2">
                          <label className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all cursor-pointer flex items-center gap-2">
                            <Upload className="w-4 h-4" />
                            {t('settings.database.backup.upload')}
                            <input 
                              type="file" 
                              accept=".db,.db.gz"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  uploadBackupMutation.mutate(file);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                          <button
                            onClick={() => createBackupMutation.mutate()}
                            disabled={createBackupMutation.isPending}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
                          >
                            {createBackupMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {createBackupMutation.isPending ? t('settings.database.backup.creating') : t('settings.database.backup.create')}
                          </button>
                        </div>
                      </div>
                      
                      {/* 备份历史列表 */}
                      {backupHistory.length > 0 ? (
                        <div className="space-y-2">
                          {backupHistory.map((backup) => (
                            <div key={backup.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                              <div>
                                <p className="text-sm font-medium text-text-primary">{backup.filename}</p>
                                <p className="text-xs text-text-secondary">
                                  {new Date(backup.createdAt).toLocaleString()} • {formatFileSize(backup.size)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem('token');
                                      const response = await fetch(`/api/backups/download/${backup.id}`, {
                                        headers: {
                                          'Authorization': `Bearer ${token}`
                                        }
                                      });
                                      
                                      if (!response.ok) {
                                        throw new Error(t('settings.database.backup.downloadFailed'));
                                      }
                                      
                                      const blob = await response.blob();
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = backup.filename || `backup-${backup.id}.db`;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      document.body.removeChild(a);
                                    } catch (err) {
                                      alert(t('settings.database.backup.downloadFailedWithMessage', { message: (err as Error).message }));
                                    }
                                  }}
                                  className="px-3 py-1 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                                >
                                  {t('settings.database.backup.download')}
                                </button>
                                <button
                                  onClick={() => restoreBackupMutation.mutate(backup.id)}
                                  disabled={restoreBackupMutation.isPending}
                                  className="px-3 py-1 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                                >
                                  {t('settings.database.backup.restore')}
                                </button>
                                <button
                                  onClick={() => deleteBackupMutation.mutate(backup.id)}
                                  disabled={deleteBackupMutation.isPending}
                                  className="px-3 py-1 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                                >
                                  {t('common.delete')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-text-secondary">{t('settings.database.backup.empty')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      {t('settings.security.title')}
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                      {t('settings.security.subtitle')}
                    </p>
                  </div>

                  {/* 修改密码 */}
                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-4 flex items-center gap-2">
                      <Lock className="w-5 h-5" />
                      {t('settings.security.password.title')}
                    </h4>
                    {searchParams.get('changePassword') === 'true' && (
                      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start gap-2 text-yellow-300">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">{t('settings.security.password.mustChangeTitle')}</p>
                          <p className="text-xs mt-1">{t('settings.security.password.mustChangeDesc')}</p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-4 max-w-md">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.security.password.current')}</label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder={t('settings.security.password.currentPlaceholder')}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.security.password.new')}</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t('settings.security.password.newPlaceholder')}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                        {newPassword && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-text-secondary">{t('settings.security.password.strength')}</span>
                              <span className={`text-sm font-medium ${getPasswordStrength(newPassword).color}`}>
                                {passwordStrengthLabel(newPassword)}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                  key={i}
                                  className={`h-1 flex-1 rounded-full ${
                                    i <= getPasswordStrength(newPassword).score
                                      ? getPasswordStrength(newPassword).color.replace('text-', 'bg-')
                                      : 'bg-border'
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              {Object.entries(validatePassword(newPassword).details).map(([key, value]) => (
                                <div key={key} className={`flex items-center gap-1 ${value ? 'text-status-success' : 'text-text-tertiary'}`}>
                                  {value ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                                  <span>
                                    {passwordRequirementLabel(key)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">{t('settings.security.password.confirm')}</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder={t('settings.security.password.confirmPlaceholder')}
                          className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                        />
                        {confirmPassword && newPassword && (
                          <div className="mt-1 flex items-center gap-1 text-xs">
                            {newPassword === confirmPassword ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-status-success" />
                                <span className="text-status-success">{t('settings.security.password.match')}</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 text-status-failed" />
                                <span className="text-status-failed">{t('settings.security.password.notMatch')}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {passwordError && (
                        <p className="text-sm text-status-failed flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {passwordError}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        {passwordStatus === 'saving' && (
                          <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                        )}
                        {passwordStatus === 'saved' && (
                          <p className="text-sm text-status-success flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            {t('settings.security.password.changeSuccess')}
                          </p>
                        )}
                        <button
                          onClick={handlePasswordChange}
                          disabled={passwordStatus === 'saving'}
                          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {passwordStatus === 'saving' && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          {t('settings.security.password.change')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-4">
                    <h4 className="font-medium text-text-primary mb-2">{t('settings.security.cors')}</h4>
                    <p className="text-sm text-text-secondary mb-3">
                      {t('settings.security.allowedOrigins')}
                    </p>
                    <input
                      type="text"
                      defaultValue="http://localhost:3000"
                      className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                      <Palette className="w-5 h-5" />
                      {t('settings.appearance.title')}
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                      {t('settings.appearance.subtitle')}
                    </p>
                  </div>

                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-2">{t('settings.theme.title')}</h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {t('settings.theme.current', {
                        theme: theme === 'dark' ? t('settings.theme.actualDark') : t('settings.theme.actualLight')
                      })}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {themeOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setThemeMode(option.id)}
                            className={clsx(
                              'text-left rounded-lg border p-4 transition-all',
                              themeMode === option.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-surface hover:border-primary/50'
                            )}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="w-5 h-5 text-primary" />
                              <span className="font-medium text-text-primary">{option.name}</span>
                            </div>
                            <p className="text-xs text-text-secondary">{option.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-2">{t('settings.background.title')}</h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {t('settings.background.desc')}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {backgroundOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setBackgroundStyle(option.id)}
                          className={clsx(
                            'text-left rounded-lg border p-4 transition-all',
                            backgroundStyle === option.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-surface hover:border-primary/50'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            {option.swatches.map((color) => (
                              <span
                                key={color}
                                className="w-6 h-6 rounded-full border border-white/10"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div className="font-medium text-text-primary">{option.name}</div>
                          <div className="text-xs text-text-secondary mt-1">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-6">
                    <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                      <Languages className="w-5 h-5 text-primary" />
                      {t('settings.language.title')}
                    </h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {t('settings.language.desc')}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {languageOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setLocale(option.id)}
                          className={clsx(
                            'text-left rounded-lg border p-4 transition-all',
                            locale === option.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-surface hover:border-primary/50'
                          )}
                        >
                          <div className="font-medium text-text-primary">{option.name}</div>
                          <div className="text-xs text-text-secondary mt-1">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
