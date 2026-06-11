import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, Key, CheckCircle2, X, Copy, Eye, EyeOff,
  Shield, Fingerprint, Info, Search, Server, AlertTriangle, Lock, User
} from 'lucide-react';
import clsx from 'clsx';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale } from '../contexts/LocaleContext';

interface SSHKey {
  id: string;
  name: string;
  auth_type: 'key' | 'password';
  key_type: string;
  fingerprint: string | null;
  username: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

interface UsageServer {
  id: string;
  name: string;
  hostname: string;
}

export default function SSHKeys() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { locale, t } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<SSHKey | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    auth_type: 'key' as 'key' | 'password',
    username: '',
    password: '',
    private_key: '',
    description: '',
  });
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<SSHKey | null>(null);
  const [usageServers, setUsageServers] = useState<UsageServer[] | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ESC key support for modals
  useEscapeKey({ onEscape: () => { setIsModalOpen(false); resetForm(); setSelectedKey(null); }, enabled: isModalOpen });
  useEscapeKey({ onEscape: () => setDeleteConfirmKey(null), enabled: !!deleteConfirmKey });

  const { data: sshKeys, isLoading } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: async () => {
      const res = await api.get('/api/ssh-keys');
      return res.data.data as SSHKey[];
    },
  });

  const { data: fullKeyData } = useQuery({
    queryKey: ['ssh-key', expandedKey],
    queryFn: async () => {
      if (!expandedKey) return null;
      const res = await api.get(`/api/ssh-keys/${expandedKey}`);
      return res.data.data as SSHKey & { has_private_key?: boolean; has_password?: boolean };
    },
    enabled: !!expandedKey,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await api.post('/api/ssh-keys', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      resetForm();
      setIsModalOpen(false);
      toast.success(t('credentials.toast.created'));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || t('credentials.toast.createFailed');
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const res = await api.put(`/api/ssh-keys/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      resetForm();
      setIsModalOpen(false);
      setSelectedKey(null);
      toast.success(t('credentials.toast.updated'));
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || error?.message || t('credentials.toast.updateFailed');
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/ssh-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ssh-keys'] });
      setDeleteConfirmKey(null);
      toast.success(t('credentials.toast.deleted'));
    },
    onError: () => {
      setDeleteConfirmKey(null);
    },
  });

  const resetForm = () => {
    setFormData({ name: '', auth_type: 'key', username: '', password: '', private_key: '', description: '' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedKey) {
      const data: Partial<typeof formData> = {
        name: formData.name,
        auth_type: formData.auth_type,
        description: formData.description,
      };
      if (formData.auth_type === 'key' && formData.private_key) {
        data.private_key = formData.private_key;
      }
      if (formData.auth_type === 'password') {
        if (formData.username) data.username = formData.username;
        if (formData.password) data.password = formData.password;
      }
      updateMutation.mutate({ id: selectedKey.id, data });
    } else {
      const data = { ...formData };
      if (data.auth_type === 'key') {
        data.username = '';
        data.password = '';
      } else {
        data.private_key = '';
      }
      createMutation.mutate(data);
    }
  };

  const handleEdit = (key: SSHKey) => {
    setSelectedKey(key);
    setFormData({
      name: key.name,
      auth_type: key.auth_type,
      username: key.username || '',
      password: '',
      private_key: '',
      description: key.description || ''
    });
    setIsModalOpen(true);
  };

  const handleCopyFingerprint = (fingerprint: string) => {
    navigator.clipboard.writeText(fingerprint);
    toast.success(t('credentials.toast.fingerprintCopied'));
  };

  const handleViewUsage = async (key: SSHKey) => {
    setUsageLoading(true);
    setUsageServers(null);
    try {
      const res = await api.get(`/api/ssh-keys/${key.id}/usage`);
      setUsageServers(res.data.data.servers);
    } catch {
      toast.error(t('credentials.toast.usageFailed'));
    }
    setUsageLoading(false);
  };

  const filteredKeys = Array.isArray(sshKeys) ? sshKeys.filter((key) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      key.name.toLowerCase().includes(q) ||
      (key.description || '').toLowerCase().includes(q) ||
      (key.fingerprint || '').toLowerCase().includes(q) ||
      key.key_type.toLowerCase().includes(q)
    );
  }) : [];

  const getKeyTypeText = (type: string, authType: string) => {
    if (authType === 'password') return t('credentials.authType.password');
    const map: Record<string, string> = {
      openssh: 'OpenSSH',
      rsa: 'RSA',
      ec: 'EC',
      dsa: 'DSA',
      pkcs8: 'PKCS#8',
      unknown: t('common.unknown'),
    };
    return map[type] || type;
  };

  const getKeyTypeColor = (type: string, authType: string) => {
    if (authType === 'password') return 'text-orange-500 bg-orange-500/10';
    const map: Record<string, string> = {
      openssh: 'text-emerald-500 bg-emerald-500/10',
      rsa: 'text-blue-500 bg-blue-500/10',
      ec: 'text-purple-500 bg-purple-500/10',
      dsa: 'text-yellow-500 bg-yellow-500/10',
      pkcs8: 'text-cyan-500 bg-cyan-500/10',
      unknown: 'text-text-secondary bg-background',
    };
    return map[type] || map.unknown;
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">{t('credentials.title')}</h1>
            <p className="text-text-secondary">{t('credentials.subtitle')}</p>
          </div>
          <button
            onClick={() => { resetForm(); setSelectedKey(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('credentials.add')}
          </button>
        </div>

        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-text-primary mb-1">{t('credentials.security.title')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-text-secondary">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 flex-shrink-0 text-status-success" />
                  <span><strong>{t('credentials.security.encryptedTitle')}</strong>{t('credentials.security.encryptedDesc')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Key className="w-3.5 h-3.5 flex-shrink-0 text-status-warning" />
                  <span><strong>{t('credentials.security.dualAuthTitle')}</strong>{t('credentials.security.dualAuthDesc')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 text-status-failed" />
                  <span><strong>{t('credentials.security.decryptTitle')}</strong>{t('credentials.security.decryptDesc')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('credentials.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-border" />
                  <div className="flex-1">
                    <div className="h-4 bg-border rounded w-1/3 mb-2" />
                    <div className="h-3 bg-border rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredKeys.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-text-secondary">
              <Key className="w-14 h-14 mb-4 opacity-40" />
              <p className="text-lg mb-1">{searchQuery ? t('credentials.empty.noMatch') : t('credentials.empty.title')}</p>
              <p className="text-sm mb-4">{searchQuery ? t('credentials.empty.adjustSearch') : t('credentials.empty.desc')}</p>
              {!searchQuery && (
                <button
                  onClick={() => { resetForm(); setSelectedKey(null); setIsModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('credentials.empty.action')}
                </button>
              )}
            </div>
          ) : (
            filteredKeys.map((key) => (
              <div
                key={key.id}
                className="group relative overflow-hidden rounded-xl border border-[#334155]/60 bg-[#1a2236]/90 backdrop-blur-sm p-4 transition-all duration-200 hover:border-[#3b82f6]/50 hover:bg-[#1e2940] hover:shadow-md hover:shadow-blue-500/5"
              >
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      key.auth_type === 'password'
                        ? 'bg-gradient-to-br from-[#f97316]/20 to-[#ea580c]/15 border-[#f97316]/25'
                        : 'bg-gradient-to-br from-[#3b82f6]/20 to-[#0ea5e9]/15 border-[#3b82f6]/25'
                    )}>
                      {key.auth_type === 'password' ? (
                        <Lock className="h-4 w-4 text-[#fb923c]" />
                      ) : (
                        <Key className="h-4 w-4 text-[#60a5fa]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-white/95">{key.name}</h3>
                        <span className={clsx('inline-flex shrink-0 items-center px-1.5 py-0.5 text-[10px] font-semibold rounded',
                          getKeyTypeColor(key.key_type, key.auth_type)
                        )}>
                          {getKeyTypeText(key.key_type, key.auth_type)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#94a3b8]">
                        <Server className="h-3 w-3" />
                        <span>{t('credentials.card.deviceCount', { count: key.usage_count })}</span>
                        <span className="mx-1 text-[#4a5568]">·</span>
                        <span>{new Date(key.created_at).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-40 transition-opacity group-hover:opacity-100">
                      {key.usage_count > 0 && (
                        <button
                          onClick={() => handleViewUsage(key)}
                          className="rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-[#60a5fa]"
                          title={t('credentials.actions.viewServers')}
                        >
                          <Server className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedKey(expandedKey === key.id ? null : key.id)}
                        className="rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-[#60a5fa]"
                        title={t('credentials.actions.viewSecret')}
                      >
                        {expandedKey === key.id ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleEdit(key)}
                        className="rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-[#60a5fa]"
                        title={t('common.edit')}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmKey(key)}
                        className="rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {key.fingerprint && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#334155]/50 bg-[#111827]/60 px-2.5 py-1.5">
                      <Fingerprint className="h-3 w-3 shrink-0 text-[#3b82f6]/50" />
                      <code className="truncate text-[11px] font-mono text-[#cbd5e1]">{key.fingerprint}</code>
                      <button
                        onClick={() => handleCopyFingerprint(key.fingerprint!)}
                        className="ml-auto shrink-0 rounded p-0.5 text-[#64748b] transition-colors hover:text-[#60a5fa]"
                        title={t('credentials.actions.copyFingerprint')}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {expandedKey === key.id && fullKeyData && (
                    <div className="mt-4 p-4 bg-black/60 border border-border rounded-lg">
                      <div className="flex items-start gap-2">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div>
                          <div className="text-xs font-medium text-text-primary">{t('credentials.encrypted.title')}</div>
                          <p className="mt-1 text-xs leading-5 text-text-tertiary">
                            {t('credentials.encrypted.desc')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {usageServers !== null && (
                    <div className="mt-4 p-4 bg-background/50 border border-border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-text-primary">{t('credentials.usage.title', { count: usageServers.length })}</span>
                        <button onClick={() => setUsageServers(null)} className="p-0.5 hover:bg-surface rounded transition-colors">
                          <X className="w-3.5 h-3.5 text-text-tertiary" />
                        </button>
                      </div>
                      {usageLoading ? (
                        <p className="text-xs text-text-tertiary animate-pulse">{t('common.loading')}</p>
                      ) : usageServers.length === 0 ? (
                        <p className="text-xs text-text-tertiary">{t('credentials.usage.empty')}</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {usageServers.map((srv) => (
                            <div key={srv.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-surface/50 rounded-lg text-xs">
                              <Server className="w-3 h-3 text-primary flex-shrink-0" />
                              <span className="text-text-primary truncate font-medium">{srv.name}</span>
                              <span className="text-text-tertiary truncate">{srv.hostname}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-text-primary mb-6">
              {selectedKey ? t('credentials.modal.editTitle') : t('credentials.modal.addTitle')}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('credentials.form.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('credentials.form.namePlaceholder')}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('credentials.form.authType')}</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, auth_type: 'key' })}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                      formData.auth_type === 'key'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-background border-border text-text-secondary hover:border-primary/50'
                    )}
                  >
                    <Key className="w-4 h-4" />
                    {t('credentials.authType.key')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, auth_type: 'password' })}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
                      formData.auth_type === 'password'
                        ? 'bg-orange-500/10 border-orange-500 text-orange-500'
                        : 'bg-background border-border text-text-secondary hover:border-orange-500/50'
                    )}
                  >
                    <Lock className="w-4 h-4" />
                    {t('credentials.authType.password')}
                  </button>
                </div>
              </div>

              {formData.auth_type === 'key' ? (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {t('credentials.form.privateKey')} {selectedKey && t('credentials.form.keepUnchangedHint')}
                  </label>
                  <textarea
                    value={formData.private_key}
                    onChange={(e) => setFormData({ ...formData, private_key: e.target.value })}
                    placeholder={selectedKey ? t('credentials.form.privateKeyKeepPlaceholder') : t('credentials.form.privateKeyPlaceholder')}
                    rows={8}
                    className="w-full px-4 py-2 bg-black/60 border border-border rounded-lg focus:outline-none focus:border-primary font-mono text-sm text-green-400 resize-none"
                    required={!selectedKey}
                  />
                  <p className="mt-1 text-xs text-text-tertiary">
                    {t('credentials.form.privateKeyHelp')}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <User className="w-3.5 h-3.5 inline mr-1" />
                      {t('credentials.form.username')}
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder={t('credentials.form.usernamePlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <Lock className="w-3.5 h-3.5 inline mr-1" />
                      {t('credentials.form.password')}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={selectedKey ? t('credentials.form.passwordKeepPlaceholder') : t('credentials.form.passwordPlaceholder')}
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                      required={!selectedKey}
                    />
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t('credentials.form.passwordHelp')}
                    </p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">{t('credentials.form.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('credentials.form.descriptionPlaceholder')}
                  rows={2}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:border-primary text-text-primary"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); resetForm(); setSelectedKey(null); }}
                  className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {selectedKey ? t('common.save') : t('credentials.form.addCredential')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmKey && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">{t('credentials.delete.title')}</h3>
            </div>
            <div className="text-sm text-text-secondary mb-4">
              <p>{t('credentials.delete.confirmPrefix')} <strong className="text-text-primary">{deleteConfirmKey.name}</strong>{t('credentials.delete.confirmSuffix')}</p>
              {deleteConfirmKey.usage_count > 0 && (
                <p className="mt-2 text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {t('credentials.delete.inUsePrefix')} <strong>{deleteConfirmKey.usage_count}</strong> {t('credentials.delete.inUseSuffix')}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmKey(null)}
                className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary rounded-lg hover:bg-background transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmKey.id)}
                disabled={deleteConfirmKey.usage_count > 0}
                className={clsx(
                  'flex-1 px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2',
                  deleteConfirmKey.usage_count > 0
                    ? 'bg-red-500/20 text-red-400/50 cursor-not-allowed'
                    : 'bg-red-500 text-white hover:bg-red-600'
                )}
              >
                <Trash2 className="w-4 h-4" />
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
