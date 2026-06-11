import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, RefreshCw, CheckCircle2,
  Wifi, X, Loader2, Network, Search, ClipboardCheck,
  AlertTriangle, CheckSquare, Square
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import AddDeviceModal from '../components/AddDeviceModal';
import NetworkDeviceCard from '../components/NetworkDeviceCard';
import InspectionResult from '../components/InspectionResult';
import InspectionHistory from '../components/InspectionHistory';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface NetworkDevice {
  id: string;
  name: string;
  ip_address: string;
  vendor: string;
  model?: string;
  os_version?: string;
  ssh_port: number;
  username: string;
  location?: string;
  role?: string;
  status: string;
  last_inspection_at?: string;
  last_inspection_result?: string;
  created_at: string;
  updated_at: string;
}

export default function NetworkDevices() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useLocale();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<NetworkDevice | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectionResult, setInspectionResult] = useState<any>(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [inspectingDevice, setInspectingDevice] = useState<NetworkDevice | null>(null);
  const [inspectionType, setInspectionType] = useState<'standard' | 'custom' | 'full'>('standard');
  const [customDescription, setCustomDescription] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [showHistory, setShowHistory] = useState<NetworkDevice | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [isBatchInspecting, setIsBatchInspecting] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [deleteConfirmDevice, setDeleteConfirmDevice] = useState<NetworkDevice | null>(null);

  // ESC key support for modals
  useEscapeKey({ onEscape: () => { setShowInspectionModal(false); setInspectingDevice(null); }, enabled: showInspectionModal });
  useEscapeKey({ onEscape: () => setShowBatchModal(false), enabled: showBatchModal });
  useEscapeKey({ onEscape: () => { setDeleteConfirmDevice(null); }, enabled: !!deleteConfirmDevice });
  useEscapeKey({ onEscape: () => { setInspectionResult(null); setInspectingDevice(null); }, enabled: !!inspectionResult });
  useEscapeKey({ onEscape: () => setShowHistory(null), enabled: !!showHistory });

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['network-devices'],
    queryFn: () => api.get('/api/network-devices').then(res => res.data.data)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/network-devices/${id}`),
    onSuccess: () => {
      toast.success(t('networkDevices.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['network-devices'] });
    },
    onError: () => toast.error(t('networkDevices.toast.deleteFailed'))
  });

  const handleDelete = (device: NetworkDevice) => {
    setDeleteConfirmDevice(device);
  };

  const confirmDelete = () => {
    if (deleteConfirmDevice) {
      deleteMutation.mutate(deleteConfirmDevice.id);
      setDeleteConfirmDevice(null);
    }
  };

  const handleEdit = (device: NetworkDevice) => {
    setEditingDevice(device);
    setIsAddModalOpen(true);
  };

  const handleInspect = (device: NetworkDevice, type: 'standard' | 'custom' | 'full' = 'standard') => {
    setInspectingDevice(device);
    setInspectionType(type);
    setCustomDescription('');
    setShowInspectionModal(true);
  };

  const handleTestConnection = async (device: NetworkDevice) => {
    try {
      toast.info(t('networkDevices.toast.testingConnection', { name: device.name }));
      const response = await api.post(`/api/network-devices/${device.id}/test-connection`);
      const result = response.data;
      
      if (result.success) {
        toast.success(t('networkDevices.toast.connectionSuccess', { latency: result.data.latency }));
      } else {
        toast.error(t('networkDevices.toast.connectionFailed', { message: result.data.message }));
      }
    } catch (error: any) {
      toast.error(t('networkDevices.toast.connectionTestFailed'));
    }
  };

  const handleHistory = (device: NetworkDevice) => {
    setShowHistory(device);
  };

  const executeInspection = async () => {
    if (!inspectingDevice) return;

    setIsInspecting(true);
    try {
      const response = await api.post(`/api/network-devices/${inspectingDevice.id}/inspect`, {
        inspectionType,
        customDescription: inspectionType === 'custom' ? customDescription : undefined
      });

      setInspectionResult(response.data.data);
      toast.success(t('networkDevices.toast.inspectionComplete'));
      queryClient.invalidateQueries({ queryKey: ['network-devices'] });
    } catch (error: any) {
      toast.error(t('networkDevices.toast.inspectionFailed', { error: error.response?.data?.error || error.message }));
    } finally {
      setIsInspecting(false);
    }
  };

  const toggleDeviceSelection = (id: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDevices(newSelected);
  };

  const selectAllDevices = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(filteredDevices.map((d: NetworkDevice) => d.id)));
    }
  };

  const handleBatchInspect = () => {
    if (selectedDevices.size === 0) {
      toast.error(t('networkDevices.toast.selectAtLeastOne'));
      return;
    }
    setShowBatchModal(true);
  };

  const executeBatchInspection = async () => {
    if (selectedDevices.size === 0) return;

    setIsBatchInspecting(true);
    try {
      const response = await api.post('/api/network-devices/batch-inspect', {
        deviceIds: Array.from(selectedDevices),
        inspectionType: 'standard'
      });

      toast.success(t('networkDevices.toast.batchComplete', { count: response.data.data.length }));
      queryClient.invalidateQueries({ queryKey: ['network-devices'] });
      setSelectedDevices(new Set());
      setShowBatchModal(false);
    } catch (error: any) {
      toast.error(t('networkDevices.toast.batchFailed', { error: error.response?.data?.error || error.message }));
    } finally {
      setIsBatchInspecting(false);
    }
  };

  const filteredDevices = useMemo(() => {
    let result = selectedVendor === 'all'
      ? devices
      : devices.filter((d: NetworkDevice) => d.vendor === selectedVendor);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((d: NetworkDevice) =>
        d.name.toLowerCase().includes(query) ||
        d.ip_address.toLowerCase().includes(query) ||
        (d.location && d.location.toLowerCase().includes(query)) ||
        (d.model && d.model.toLowerCase().includes(query))
      );
    }

    return result;
  }, [devices, selectedVendor, searchQuery]);

  const vendors = ['all', 'huawei', 'cisco', 'h3c', 'ruijie', 'zte'];
  const vendorLabels: Record<string, MessageKey> = {
    all: 'networkDevices.vendor.all',
    huawei: 'networkDevices.vendor.huawei',
    cisco: 'networkDevices.vendor.cisco',
    h3c: 'networkDevices.vendor.h3c',
    ruijie: 'networkDevices.vendor.ruijie',
    zte: 'networkDevices.vendor.zte'
  };

  const standardInspectionItems = [
    'networkDevices.inspect.item.cpuUsage',
    'networkDevices.inspect.item.memoryUsage',
    'networkDevices.inspect.item.interfaceStatus',
    'networkDevices.inspect.item.versionInfo',
    'networkDevices.inspect.item.routingTable',
    'networkDevices.inspect.item.systemLogs',
    'networkDevices.inspect.item.environmentStatus',
    'networkDevices.inspect.item.powerFans'
  ] as const satisfies readonly MessageKey[];

  const fullInspectionItems = [
    'networkDevices.inspect.item.cpu',
    'networkDevices.inspect.item.memory',
    'networkDevices.inspect.item.interface',
    'networkDevices.inspect.item.version',
    'networkDevices.inspect.item.routing',
    'networkDevices.inspect.item.logs',
    'networkDevices.inspect.item.environment',
    'networkDevices.inspect.item.power',
    'networkDevices.inspect.item.fans',
    'networkDevices.inspect.item.stp',
    'networkDevices.inspect.item.vlan',
    'networkDevices.inspect.item.arp',
    'networkDevices.inspect.item.mac'
  ] as const satisfies readonly MessageKey[];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-1">{t('networkDevices.title')}</h1>
        <p className="text-sm text-text-secondary">{t('networkDevices.subtitle')}</p>
      </div>

      <div className="bg-surface rounded-xl border border-border mb-6">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <h2 className="text-base font-medium text-text-primary">{t('networkDevices.listTitle')}</h2>
              <div className="flex items-center gap-2">
                {vendors.map(vendor => (
                  <button
                    key={vendor}
                    onClick={() => setSelectedVendor(vendor)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      selectedVendor === vendor
                        ? 'bg-primary/10 border border-primary/30 text-primary font-medium'
                        : 'bg-background border border-border text-text-secondary hover:bg-surface hover:text-text-primary'
                    }`}
                  >
                    {t(vendorLabels[vendor])}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['network-devices'] })}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-colors"
                title={t('common.refresh')}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {selectedDevices.size > 0 && (
                <>
                  <span className="text-xs text-primary font-medium">{t('networkDevices.selectedCount', { count: selectedDevices.size })}</span>
                  <button
                    onClick={handleBatchInspect}
                    className="flex items-center gap-2 px-3 py-2 bg-green-600/90 text-white text-xs font-medium rounded-md hover:bg-green-600 transition-colors"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    {t('networkDevices.actions.batchInspect')}
                  </button>
                  <button
                    onClick={() => setSelectedDevices(new Set())}
                    className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface rounded-md transition-colors"
                  >
                    {t('networkDevices.actions.clearSelection')}
                  </button>
                </>
              )}
              <button
                onClick={() => { setEditingDevice(null); setIsAddModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-md hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" />
                {t('networkDevices.actions.newDevice')}
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('networkDevices.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Network className="w-12 h-12 text-text-secondary/40 mb-3" />
            <p className="text-sm text-text-secondary mb-1">
              {searchQuery ? t('networkDevices.empty.noMatch') : t('networkDevices.empty.title')}
            </p>
            <p className="text-xs text-text-secondary/60 mb-4">
              {searchQuery ? t('networkDevices.empty.adjustSearch') : t('networkDevices.empty.desc')}
            </p>
            {!searchQuery && (
              <button
                onClick={() => { setEditingDevice(null); setIsAddModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-md hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" />
                {t('networkDevices.actions.newDevice')}
              </button>
            )}
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={selectAllDevices}
                className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                {selectedDevices.size === filteredDevices.length ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-text-secondary" />
                )}
                {t('networkDevices.selectAll', { selected: selectedDevices.size, total: filteredDevices.length })}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDevices.map((device: NetworkDevice) => (
                <div key={device.id} className="relative">
                  <div className="absolute top-3 left-3 z-10">
                    <button
                      onClick={() => toggleDeviceSelection(device.id)}
                      className="p-1 rounded bg-surface/90 border border-border shadow-sm hover:bg-surface transition-colors"
                    >
                      {selectedDevices.has(device.id) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-text-secondary/50" />
                      )}
                    </button>
                  </div>
                  <NetworkDeviceCard
                    device={device}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onInspect={handleInspect}
                    onTestConnection={handleTestConnection}
                    onHistory={handleHistory}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <AddDeviceModal
          device={editingDevice}
          onClose={() => { setIsAddModalOpen(false); setEditingDevice(null); }}
          onSuccess={() => {
            setIsAddModalOpen(false);
            setEditingDevice(null);
            queryClient.invalidateQueries({ queryKey: ['network-devices'] });
          }}
        />
      )}

      {showInspectionModal && inspectingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-medium text-text-primary">
                {t('networkDevices.inspect.title', { name: inspectingDevice.name })}
              </h3>
              <button
                onClick={() => setShowInspectionModal(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {inspectionType === 'standard' ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">{t('networkDevices.inspect.standardDesc')}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {standardInspectionItems.map(itemKey => (
                      <div key={itemKey} className="flex items-center gap-2 text-text-secondary">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        {t(itemKey)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : inspectionType === 'custom' ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-text-primary">{t('networkDevices.inspect.customLabel')}</label>
                  <textarea
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder={t('networkDevices.inspect.customPlaceholder')}
                    className="w-full h-24 px-3 py-2 text-sm bg-background border border-border rounded-md text-text-primary placeholder-text-secondary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none transition-colors"
                  />
                  <p className="text-xs text-text-secondary/60">{t('networkDevices.inspect.customHelp')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">{t('networkDevices.inspect.fullDesc')}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {fullInspectionItems.map(itemKey => (
                      <div key={itemKey} className="flex items-center gap-2 text-text-secondary">
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        {t(itemKey)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-background/50 rounded-b-xl border-t border-border">
              <button
                onClick={() => setShowInspectionModal(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={executeInspection}
                disabled={isInspecting || (inspectionType === 'custom' && !customDescription.trim())}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-md hover:from-blue-500 hover:to-blue-600 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {isInspecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('networkDevices.inspect.inspecting')}
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    {t('networkDevices.inspect.start')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-medium text-text-primary">
                {t('networkDevices.batch.title', { count: selectedDevices.size })}
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-300">
                  <p className="font-medium mb-1">{t('networkDevices.batch.confirmTitle')}</p>
                  <p>{t('networkDevices.batch.confirmDesc', { count: selectedDevices.size })}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-background/50 rounded-b-xl border-t border-border">
              <button
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={executeBatchInspection}
                disabled={isBatchInspecting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600/90 text-white text-sm font-medium rounded-md hover:bg-green-600 transition-colors shadow-lg shadow-green-600/20 disabled:opacity-50 disabled:shadow-none"
              >
                {isBatchInspecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('networkDevices.inspect.inspecting')}
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="w-4 h-4" />
                    {t('networkDevices.batch.confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {inspectionResult && (
        <InspectionResult
          result={inspectionResult}
          deviceName={inspectingDevice?.name || ''}
          onClose={() => setInspectionResult(null)}
        />
      )}

      {showHistory && (
        <InspectionHistory
          deviceId={showHistory.id}
          deviceName={showHistory.name}
          onClose={() => setShowHistory(null)}
        />
      )}

      {deleteConfirmDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-text-primary">{t('networkDevices.delete.title')}</h3>
                  <p className="text-sm text-text-secondary">{t('networkDevices.delete.irreversible')}</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                {t('networkDevices.delete.confirmPrefix')} <span className="font-medium text-text-primary">{deleteConfirmDevice.name}</span> ({deleteConfirmDevice.ip_address}){t('networkDevices.delete.confirmSuffix')}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setDeleteConfirmDevice(null)}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm bg-red-600 text-white font-medium rounded-md hover:bg-red-500 transition-colors shadow-lg shadow-red-600/20"
                >
                  {t('networkDevices.delete.confirmDelete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
