import { X, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Clock } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useLocale, type MessageKey } from '../contexts/LocaleContext';

interface InspectionResultProps {
  result: {
    inspectionId: string;
    deviceId: string;
    inspectionType: 'standard' | 'custom' | 'full';
    status: 'success' | 'partial' | 'failed';
    results: Array<{
      type: string;
      success: boolean;
      value?: number | string;
      unit?: string;
      status: 'normal' | 'warning' | 'critical' | 'error';
      details: string;
      rawOutput: string;
      timestamp: string;
    }>;
    commandsExecuted: number;
    commandsFailed: number;
    durationMs: number;
    summary: string;
  };
  deviceName: string;
  onClose: () => void;
}

const inspectionTypeLabelKeys: Record<InspectionResultProps['result']['inspectionType'], MessageKey> = {
  standard: 'networkDevices.inspect.standard',
  custom: 'networkDevices.inspect.custom',
  full: 'networkDevices.inspect.full'
};

const typeNameKeys: Record<string, MessageKey> = {
  cpu: 'networkDevices.inspect.item.cpuUsage',
  memory: 'networkDevices.inspect.item.memoryUsage',
  interface: 'networkDevices.inspect.item.interfaceStatus',
  version: 'networkDevices.result.item.systemVersion',
  routes: 'networkDevices.inspect.item.routingTable',
  log: 'networkDevices.inspect.item.systemLogs',
  environment: 'networkDevices.inspect.item.environmentStatus',
  power: 'networkDevices.result.item.powerStatus',
  fan: 'networkDevices.result.item.fanStatus',
  stp: 'networkDevices.result.item.stpStatus',
  vlan: 'networkDevices.result.item.vlanInfo',
  arp: 'networkDevices.result.item.arpTable',
  mac: 'networkDevices.result.item.macTable'
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'normal':
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'warning':
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    case 'critical':
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    default:
      return <Loader2 className="w-5 h-5 text-text-secondary/50" />;
  }
}

function getStatusBadge(status: string, t: (key: MessageKey, values?: Record<string, string | number>) => string) {
  const styles: Record<string, string> = {
    normal: 'bg-green-500/10 text-green-400 border border-green-500/20',
    warning: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
    error: 'bg-red-500/10 text-red-400 border border-red-500/20'
  };
  const labelKeys: Record<string, MessageKey> = {
    normal: 'networkDevices.result.status.normal',
    warning: 'networkDevices.result.status.warning',
    critical: 'networkDevices.result.status.critical',
    error: 'common.error'
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
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1);
  return `${minutes}m ${remainingSeconds}s`;
}

export default function InspectionResult({ result, deviceName, onClose }: InspectionResultProps) {
  const { locale, t } = useLocale();
  useEscapeKey({ onEscape: onClose });

  const normalCount = result.results.filter(r => r.status === 'normal').length;
  const warningCount = result.results.filter(r => r.status === 'warning').length;
  const criticalCount = result.results.filter(r => r.status === 'critical').length;
  const errorCount = result.results.filter(r => r.status === 'error').length;

  const overallStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : errorCount > 0 ? 'error' : 'normal';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-medium text-text-primary">
              {t('networkDevices.result.title', { name: deviceName })}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {t(inspectionTypeLabelKeys[result.inspectionType])} · {formatDuration(result.durationMs)} · {t('networkDevices.result.commandCount', { count: result.commandsExecuted })}
            </p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            <div className={`p-4 rounded-lg border ${
              overallStatus === 'critical' ? 'bg-red-500/10 border-red-500/20' :
              overallStatus === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' :
              'bg-green-500/10 border-green-500/20'
            }`}>
              <div className="flex items-start gap-3">
                {getStatusIcon(overallStatus)}
                <div>
                  <h4 className={`text-sm font-medium ${
                    overallStatus === 'critical' ? 'text-red-300' :
                    overallStatus === 'warning' ? 'text-yellow-300' :
                    'text-green-300'
                  }`}>
                    {result.summary}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className="text-green-400">✓ {t('networkDevices.result.normalCount', { count: normalCount })}</span>
                    {warningCount > 0 && <span className="text-yellow-400">⚠ {t('networkDevices.result.warningCount', { count: warningCount })}</span>}
                    {criticalCount > 0 && <span className="text-red-400">{t('networkDevices.result.criticalCount', { count: criticalCount })}</span>}
                    {errorCount > 0 && <span className="text-red-400">✕ {t('networkDevices.result.errorCount', { count: errorCount })}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium text-text-primary mb-3">{t('networkDevices.result.details')}</h4>
              <div className="space-y-2">
                {result.results.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-background rounded-md hover:bg-background/80 transition-colors">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(item.status)}
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {typeNameKeys[item.type] ? t(typeNameKeys[item.type]) : item.type}
                        </p>
                        <p className="text-xs text-text-secondary truncate max-w-[300px]">
                          {item.details}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.value !== undefined && item.value !== '' && (
                        <span className="text-sm font-mono font-medium text-text-primary">
                          {item.value}{item.unit || ''}
                        </span>
                      )}
                      {getStatusBadge(item.status, t)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {result.commandsFailed > 0 && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <p className="text-sm text-red-300">
                    {t('networkDevices.result.commandsFailedWarning', { count: result.commandsFailed })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-background/50 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Clock className="w-3 h-3" />
            <span>{new Date(result.results[0]?.timestamp).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors rounded-md"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
