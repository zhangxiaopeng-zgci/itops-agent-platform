import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../contexts/LocaleContext';

const CURRENT_CLUSTER_STORAGE_KEY = 'current-cluster';

export default function KiteLauncher() {
  const [searchParams] = useSearchParams();
  const { t } = useLocale();
  const clusterName = searchParams.get('cluster') || '';
  const target = searchParams.get('target') || '/kite/';

  useEffect(() => {
    if (clusterName) {
      window.sessionStorage.setItem(CURRENT_CLUSTER_STORAGE_KEY, clusterName);
      window.localStorage.setItem(CURRENT_CLUSTER_STORAGE_KEY, clusterName);
    }
    window.location.replace(target.startsWith('/kite') ? target : '/kite/');
  }, [clusterName, target]);

  return (
    <div className="h-full min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <h1 className="mt-4 text-lg font-semibold text-text-primary">{t('kiteLauncher.title')}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          {clusterName ? t('kiteLauncher.subtitleWithCluster', { cluster: clusterName }) : t('kiteLauncher.subtitle')}
        </p>
      </div>
    </div>
  );
}
