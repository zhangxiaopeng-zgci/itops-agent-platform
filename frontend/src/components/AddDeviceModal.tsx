import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, Key, Lock, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface NetworkDevice {
  id?: string;
  name: string;
  ip_address: string;
  vendor: string;
  model?: string;
  os_version?: string;
  ssh_port?: number;
  ssh_key_id?: string;
  username: string;
  password?: string;
  enable_password?: string;
  location?: string;
  role?: string;
}

interface Credential {
  id: string;
  name: string;
  auth_type: 'key' | 'password';
  key_type: string;
  username: string | null;
  description: string | null;
}

interface AddDeviceModalProps {
  device?: NetworkDevice | null;
  onClose: () => void;
  onSuccess: () => void;
}

const vendors = [
  { value: 'huawei', labelKey: 'networkDevices.vendor.huawei' },
  { value: 'cisco', labelKey: 'networkDevices.vendor.cisco' },
  { value: 'h3c', labelKey: 'networkDevices.vendor.h3c' },
  { value: 'ruijie', labelKey: 'networkDevices.vendor.ruijie' },
  { value: 'zte', labelKey: 'networkDevices.vendor.zte' }
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>;

const roles = [
  { value: 'router', labelKey: 'networkDevices.role.router' },
  { value: 'switch', labelKey: 'networkDevices.role.switch' },
  { value: 'firewall', labelKey: 'networkDevices.role.firewall' },
  { value: 'ap', labelKey: 'networkDevices.role.ap' },
  { value: 'other', labelKey: 'networkDevices.role.other' }
] as const satisfies ReadonlyArray<{ value: string; labelKey: MessageKey }>;

export default function AddDeviceModal({ device, onClose, onSuccess }: AddDeviceModalProps) {
  const toast = useToast();
  const { t } = useLocale();
  const [isEditing] = useState(!!device);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [useCredential, setUseCredential] = useState(!!device?.ssh_key_id);

  useEscapeKey({ onEscape: onClose, enabled: !isSubmitting });
  
  const [formData, setFormData] = useState({
    name: device?.name || '',
    ip_address: device?.ip_address || '',
    vendor: device?.vendor || 'huawei',
    model: device?.model || '',
    os_version: device?.os_version || '',
    ssh_port: device?.ssh_port || 22,
    ssh_key_id: device?.ssh_key_id || '',
    username: device?.username || '',
    password: '',
    enable_password: '',
    location: device?.location || '',
    role: device?.role || 'switch'
  });

  // Authentication credentials.
  const { data: credentials = [] } = useQuery({
    queryKey: ['ssh-keys'],
    queryFn: () => api.get('/api/ssh-keys').then(res => res.data.data)
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.ip_address) {
      toast.error(t('networkDevices.toast.nameIpRequired'));
      return;
    }

    // Credential mode reads username and password from Credential Center.
    if (!useCredential && (!formData.username || (!isEditing && !formData.password))) {
      toast.error(t('networkDevices.toast.authRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      // In edit mode, empty password fields keep existing secrets.
      const payload: Record<string, unknown> = { ...formData };

      if (isEditing) {
        if (!formData.password) {
          delete payload.password;
        }
        if (!formData.enable_password) {
          delete payload.enable_password;
        }
      }

      if (isEditing && device?.id) {
        await api.put(`/api/network-devices/${device.id}`, payload);
        toast.success(t('networkDevices.toast.updated'));
      } else {
        await api.post('/api/network-devices', payload);
        toast.success(t('networkDevices.toast.created'));
      }
      onSuccess();
    } catch (error: any) {
      console.error('Save device error:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.response?.data?.error || error.response?.data?.message || t('networkDevices.toast.operationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.ip_address) {
      toast.error(t('networkDevices.toast.ipRequired'));
      return;
    }

    // Credential mode delegates secret handling to the backend.
    let testUsername = formData.username;
    const testPassword = formData.password;
    
    if (useCredential && formData.ssh_key_id) {
      const selectedCred = credentials.find((c: Credential) => c.id === formData.ssh_key_id);
      if (selectedCred && selectedCred.auth_type === 'password') {
        testUsername = selectedCred.username || '';
        toast.info(t('networkDevices.toast.credentialTestAfterSave'));
        return;
      }
    }

    if (!testUsername || !testPassword) {
      toast.error(t('networkDevices.toast.usernamePasswordRequired'));
      return;
    }

    setTestingConnection(true);
    setTestResult(null);
    try {
      const response = await api.post('/api/network-devices/test-connection', {
        ip_address: formData.ip_address,
        ssh_port: formData.ssh_port,
        username: testUsername,
        password: testPassword
      });
      
      setTestResult({
        success: response.data.success,
        message: response.data.error || response.data.message
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.error || t('networkDevices.toast.connectionTestFailed')
      });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface rounded-t-xl z-10">
          <h3 className="text-base font-medium text-text-primary">
            {isEditing ? t('networkDevices.modal.editTitle') : t('networkDevices.modal.addTitle')}
          </h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1">
                {t('networkDevices.form.name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('networkDevices.form.namePlaceholder')}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                {t('networkDevices.form.ipAddress')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.ip_address}
                onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                placeholder="192.168.1.1"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">{t('networkDevices.form.sshPort')}</label>
              <input
                type="number"
                value={formData.ssh_port}
                onChange={(e) => setFormData({ ...formData, ssh_port: parseInt(e.target.value) || 22 })}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                {t('networkDevices.form.vendor')} <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {vendors.map(v => (
                  <option key={v.value} value={v.value}>{t(v.labelKey)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">{t('networkDevices.form.role')}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {roles.map(r => (
                  <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-2">{t('networkDevices.form.authMode')}</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUseCredential(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    useCredential
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-background border-border text-text-secondary hover:border-primary/50'
                  }`}
                >
                  <Key className="w-4 h-4" />
                  {t('networkDevices.form.selectCredential')}
                </button>
                <button
                  type="button"
                  onClick={() => setUseCredential(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    !useCredential
                      ? 'bg-orange-500/10 border-orange-500 text-orange-500'
                      : 'bg-background border-border text-text-secondary hover:border-orange-500/50'
                  }`}
                >
                  <User className="w-4 h-4" />
                  {t('networkDevices.form.manualInput')}
                </button>
              </div>
            </div>

            {useCredential ? (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {t('servers.form.credential')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.ssh_key_id}
                  onChange={(e) => setFormData({ ...formData, ssh_key_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  required
                >
                  <option value="">{t('networkDevices.form.chooseCredential')}</option>
                  {credentials
                    .filter((c: Credential) => c.auth_type === 'password')
                    .map((cred: Credential) => (
                      <option key={cred.id} value={cred.id}>
                        {cred.name} ({cred.username || t('networkDevices.form.noUsername')})
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-text-secondary/60">
                  {t('networkDevices.form.passwordCredentialOnly')}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">{t('servers.form.username')} <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="admin"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    required={!useCredential}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    {t('servers.form.password')} {!isEditing && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={isEditing ? t('networkDevices.form.keepUnchanged') : t('networkDevices.form.loginPasswordPlaceholder')}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    required={!isEditing && !useCredential}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">{t('networkDevices.form.enablePassword')}</label>
              <input
                type="password"
                value={formData.enable_password}
                onChange={(e) => setFormData({ ...formData, enable_password: e.target.value })}
                placeholder={t('networkDevices.form.enablePasswordPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">{t('networkDevices.form.model')}</label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder={t('networkDevices.form.modelPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-primary mb-1">{t('networkDevices.card.location')}</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder={t('networkDevices.form.locationPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
              testResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-300' : 'bg-red-500/10 border border-red-500/20 text-red-300'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {testingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : t('networkDevices.actions.testConnection')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-md hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
