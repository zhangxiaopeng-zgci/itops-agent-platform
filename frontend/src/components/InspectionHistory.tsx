import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, History, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface InspectionHistoryProps {
  deviceId: string;
  deviceName: string;
  onClose: () => void;
}

interface HistoryItem {
  id: string;
  device_id: string;
  inspection_type: 'standard' | 'custom' | 'full';
  status: 'success' | 'partial' | 'failed';
  commands_executed: number;
  commands_failed: number;
  results: string;
  summary: string;
  duration_ms: number;
  created_at: string;
}

const typeLabelKeys: Record<HistoryItem['inspection_type'], MessageKey> = {
  standard: 'networkDevices.inspect.standard',
  custom: 'networkDevices.inspect.custom',
  full: 'networkDevices.inspect.full'
};

function getStatusBadge(status: string, t: (key: MessageKey, values?: Record<string, string | number>) => string) {
  const styles: Record<string, string> = {
    success: 'bg-green-500/10 text-green-400 border border-green-500/20',
    partial: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    failed: 'bg-red-500/10 text-red-400 border border-red-500/20'
  };
  const labelKeys: Record<string, MessageKey> = {
    success: 'networkDevices.history.status.success',
    partial: 'networkDevices.history.status.partial',
    failed: 'common.failed'
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[status] || 'bg-surface text-text-secondary border border-border'}`}>
      {labelKeys[status] ? t(labelKeys[status]) : status}
    </span>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}

export default function InspectionHistory({ deviceId, deviceName, onClose }: InspectionHistoryProps) {
  const { locale, t } = useLocale();
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  useEscapeKey({ onEscape: () => { if (selectedHistory) setSelectedHistory(null); else onClose(); } });

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['inspection-history', deviceId],
    queryFn: () => api.get(`/api/network-devices/${deviceId}/history`).then(res => res.data.data)
  });

  const handleViewDetails = (item: HistoryItem) => {
    setSelectedHistory(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-text-secondary" />
            <h3 className="text-base font-medium text-text-primary">
              {t('networkDevices.history.title', { name: deviceName })}
            </h3>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="w-12 h-12 text-text-secondary/40 mb-3" />
              <p className="text-sm text-text-secondary">{t('networkDevices.history.emptyTitle')}</p>
              <p className="text-xs text-text-secondary/60 mt-1">{t('networkDevices.history.emptyDesc')}</p>
            </div>
          ) : (
            <div className="p-6 space-y-2">
              {history.map((item: HistoryItem) => (
                <div
                  key={item.id}
                  onClick={() => handleViewDetails(item)}
                  className="flex items-center justify-between p-4 bg-background rounded-lg hover:bg-background/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {item.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : item.status === 'partial' ? (
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {t(typeLabelKeys[item.inspection_type])}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {new Date(item.created_at).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')} · {formatDuration(item.duration_ms)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(item.status, t)}
                    <p className="text-xs text-text-secondary mt-1">
                      {t('networkDevices.history.commandStats', { executed: item.commands_executed, failed: item.commands_failed })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 bg-background/50 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      {selectedHistory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h4 className="text-base font-medium text-text-primary">
                {t('networkDevices.history.detailsTitle')}
              </h4>
              <button
                onClick={() => setSelectedHistory(null)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">{t('networkDevices.history.inspectionType')}</span>
                  <p className="font-medium text-text-primary">{t(typeLabelKeys[selectedHistory.inspection_type])}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('common.status')}</span>
                  <p className="mt-1">{getStatusBadge(selectedHistory.status, t)}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('networkDevices.history.duration')}</span>
                  <p className="font-medium text-text-primary">{formatDuration(selectedHistory.duration_ms)}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('networkDevices.history.createdAt')}</span>
                  <p className="font-medium text-text-primary">{new Date(selectedHistory.created_at).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('networkDevices.history.commandsExecuted')}</span>
                  <p className="font-medium text-text-primary">{selectedHistory.commands_executed}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('networkDevices.history.commandsFailed')}</span>
                  <p className="font-medium text-text-primary">{selectedHistory.commands_failed}</p>
                </div>
              </div>

              {selectedHistory.summary && (
                <div>
                  <span className="text-sm text-text-secondary">{t('networkDevices.history.summary')}</span>
                  <p className="mt-1 text-sm text-text-primary bg-background p-3 rounded-md">{selectedHistory.summary}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end px-6 py-4 bg-background/50 border-t border-border">
              <button
                onClick={() => setSelectedHistory(null)}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
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
