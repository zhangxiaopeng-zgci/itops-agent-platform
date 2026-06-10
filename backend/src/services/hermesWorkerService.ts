import axios from 'axios';

export type HermesWorkerRole = 'diagnose' | 'remediate' | 'evolve';

export interface HermesWorkerDefinition {
  role: HermesWorkerRole;
  name: string;
  channelType: string;
  url?: string;
}

export interface HermesWorkerStatus extends HermesWorkerDefinition {
  configured: boolean;
  healthy: boolean;
  latencyMs: number;
  status: string;
  model?: string;
  upstreamConfigured?: boolean;
  error?: string;
}

export interface HermesWorkerRunMetadata {
  attempted: boolean;
  used: boolean;
  fallbackUsed: boolean;
  role?: HermesWorkerRole;
  url?: string;
  latencyMs?: number;
  error?: string;
}

export interface HermesWorkerRunResult {
  data: Record<string, unknown>;
  metadata: HermesWorkerRunMetadata;
}

const WORKERS: HermesWorkerDefinition[] = [
  {
    role: 'diagnose',
    name: 'Hermes Diagnose Worker',
    channelType: 'diagnose',
    url: process.env.HERMES_WORKER_DIAGNOSE_URL
  },
  {
    role: 'remediate',
    name: 'Hermes Remediate Worker',
    channelType: 'remediate',
    url: process.env.HERMES_WORKER_REMEDIATE_URL
  },
  {
    role: 'evolve',
    name: 'Hermes Evolve Worker',
    channelType: 'review',
    url: process.env.HERMES_WORKER_EVOLVE_URL
  }
];

export function listHermesWorkerDefinitions(): HermesWorkerDefinition[] {
  return WORKERS.map(worker => ({ ...worker }));
}

export function resolveHermesWorkerForChannel(channelType?: string): HermesWorkerDefinition | null {
  if (!channelType) return null;
  return WORKERS.find(worker => worker.channelType === channelType) || null;
}

export async function getHermesWorkerStatuses(): Promise<HermesWorkerStatus[]> {
  return Promise.all(WORKERS.map(async (worker) => {
    if (!worker.url) {
      return {
        ...worker,
        configured: false,
        healthy: false,
        latencyMs: 0,
        status: 'not_configured'
      };
    }

    const startTime = Date.now();
    try {
      const response = await axios.get(`${trimTrailingSlash(worker.url)}/health`, { timeout: 5000 });
      return {
        ...worker,
        configured: true,
        healthy: response.data?.status === 'healthy',
        latencyMs: Date.now() - startTime,
        status: String(response.data?.status || 'unknown'),
        model: typeof response.data?.model === 'string' ? response.data.model : undefined,
        upstreamConfigured: Boolean(response.data?.upstreamConfigured)
      };
    } catch (error) {
      return {
        ...worker,
        configured: true,
        healthy: false,
        latencyMs: Date.now() - startTime,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
}

export async function runHermesWorker(
  worker: HermesWorkerDefinition,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<HermesWorkerRunResult> {
  if (!worker.url) {
    throw new Error(`Hermes worker URL is not configured for role: ${worker.role}`);
  }

  const startTime = Date.now();
  const response = await axios.post(
    `${trimTrailingSlash(worker.url)}/run`,
    body,
    { timeout: timeoutMs }
  );

  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.error || `Hermes worker ${worker.role} returned an invalid response`);
  }

  return {
    data: response.data.data,
    metadata: {
      attempted: true,
      used: true,
      fallbackUsed: false,
      role: worker.role,
      url: worker.url,
      latencyMs: Date.now() - startTime
    }
  };
}

export function isHermesWorkerFallbackEnabled(): boolean {
  return process.env.HERMES_WORKER_FALLBACK_ENABLED !== 'false';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
