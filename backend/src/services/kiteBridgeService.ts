import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import db from '../models/database';
import { decrypt } from './encryptionService';

interface KiteBridgeCluster {
  id: string;
  name: string;
  status: string;
  enabled: number;
  auth_type: string;
  credential_id?: string | null;
  node_count: number;
  pod_count: number;
  last_sync_at?: string | null;
  has_kubeconfig: number;
}

interface KiteBootstrapMeta {
  clusterId: string;
  clusterName: string;
  syncedAt: string;
  outputPath: string;
}

interface KiteBootstrapResponse {
  setup?: {
    initialized?: boolean;
    step?: number;
  };
  auth?: {
    providers?: string[];
    credentialProviders?: string[];
    oauthProviders?: string[];
  };
  user?: unknown;
}

interface KiteHttpResponse<T> {
  statusCode: number;
  data: T | null;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  error?: string;
}

interface KiteSessionResult {
  publicUrl: string | null;
  username: string;
  userPresent: boolean;
  cookieHeaders: string[];
}

function getBootstrapDir(): string {
  return process.env.KITE_BOOTSTRAP_DIR || '/app/kite-bootstrap';
}

function getBootstrapKubeconfigPath(): string {
  return process.env.KITE_BOOTSTRAP_KUBECONFIG || path.join(getBootstrapDir(), 'kubeconfig');
}

function getBootstrapMetaPath(): string {
  return `${getBootstrapKubeconfigPath()}.meta.json`;
}

function readBootstrapMeta(): KiteBootstrapMeta | null {
  try {
    const content = fs.readFileSync(getBootstrapMetaPath(), 'utf8');
    return JSON.parse(content) as KiteBootstrapMeta;
  } catch {
    return null;
  }
}

function getKiteUrl(): string | null {
  return process.env.KITE_URL || null;
}

function getKitePublicUrl(): string | null {
  return process.env.KITE_PUBLIC_URL || null;
}

function requestJson<T>(
  url: string,
  timeoutMs = 5000,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<KiteHttpResponse<T>> {
  return new Promise((resolve) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const body = options.body === undefined ? null : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }
    const req = client.request(target, { method: options.method || 'GET', headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ statusCode: res.statusCode || 0, data: rawBody ? JSON.parse(rawBody) as T : null, headers: res.headers, rawBody });
        } catch (error) {
          resolve({ statusCode: res.statusCode || 0, data: null, headers: res.headers, rawBody, error: error instanceof Error ? error.message : 'Invalid JSON response' });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Kite request timed out'));
    });
    req.on('error', (error) => {
      resolve({ statusCode: 0, data: null, headers: {}, rawBody: '', error: error.message });
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function getSetCookieHeaders(headers: http.IncomingHttpHeaders): string[] {
  const value = headers['set-cookie'];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

class KiteBridgeService {
  getRegisteredClusters(): KiteBridgeCluster[] {
    return db.prepare(`
      SELECT
        c.id,
        c.name,
        c.status,
        c.enabled,
        c.auth_type,
        c.credential_id,
        c.last_sync_at,
        COUNT(DISTINCT n.id) AS node_count,
        COUNT(DISTINCT p.id) AS pod_count,
        CASE WHEN kc.kubeconfig IS NOT NULL AND kc.kubeconfig != '' THEN 1 ELSE 0 END AS has_kubeconfig
      FROM kubernetes_clusters c
      LEFT JOIN kubernetes_nodes n ON n.cluster_id = c.id
      LEFT JOIN kubernetes_pods p ON p.cluster_id = c.id
      LEFT JOIN kubernetes_credentials kc ON kc.id = c.credential_id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.created_at DESC
    `).all() as KiteBridgeCluster[];
  }

  async getStatus() {
    const clusters = this.getRegisteredClusters();
    const eligibleClusters = clusters.filter((cluster) => (
      cluster.enabled === 1
      && cluster.auth_type === 'kubeconfig'
      && Boolean(cluster.credential_id)
      && cluster.has_kubeconfig === 1
    ));
    const outputPath = getBootstrapKubeconfigPath();
    const meta = readBootstrapMeta();
    const kiteUrl = getKiteUrl();
    const kiteBootstrap = kiteUrl
      ? await requestJson<KiteBootstrapResponse>(`${kiteUrl.replace(/\/+$/, '')}/api/v1/bootstrap`)
      : { statusCode: 0, data: null, error: 'KITE_URL is not configured' };

    const fileExists = fs.existsSync(outputPath);
    const fileStat = fileExists ? fs.statSync(outputPath) : null;
    const initialized = Boolean(kiteBootstrap.data?.setup?.initialized);
    const loginRequired = initialized && !kiteBootstrap.data?.user && (kiteBootstrap.data?.auth?.providers || []).includes('password');

    return {
      kite: {
        configured: Boolean(kiteUrl),
        url: kiteUrl,
        publicUrl: getKitePublicUrl(),
        reachable: kiteBootstrap.statusCode >= 200 && kiteBootstrap.statusCode < 500,
        statusCode: kiteBootstrap.statusCode,
        error: kiteBootstrap.error || null,
        initialized,
        authProviders: kiteBootstrap.data?.auth?.providers || [],
        userPresent: Boolean(kiteBootstrap.data?.user),
        loginRequired,
        sessionBridgeConfigured: Boolean(process.env.KITE_PASSWORD),
      },
      bridge: {
        bootstrapDir: getBootstrapDir(),
        kubeconfigPath: outputPath,
        kubeconfigPresent: fileExists,
        kubeconfigUpdatedAt: fileStat ? fileStat.mtime.toISOString() : null,
        syncedClusterId: meta?.clusterId || null,
        syncedClusterName: meta?.clusterName || null,
        syncedAt: meta?.syncedAt || null,
        restartRequired: fileExists && initialized,
      },
      clusters: {
        registered: clusters.length,
        eligible: eligibleClusters.length,
        items: clusters,
      },
    };
  }

  syncBootstrap(clusterId?: string | null): KiteBootstrapMeta {
    const params: unknown[] = [];
    let filter = '';
    if (clusterId) {
      filter = 'AND c.id = ?';
      params.push(clusterId);
    }

    const cluster = db.prepare(`
      SELECT
        c.id,
        c.name,
        kc.kubeconfig
      FROM kubernetes_clusters c
      JOIN kubernetes_credentials kc ON kc.id = c.credential_id
      WHERE c.enabled = 1
        AND c.auth_type = 'kubeconfig'
        AND kc.credential_type = 'kubeconfig'
        AND kc.kubeconfig IS NOT NULL
        AND kc.kubeconfig != ''
        ${filter}
      ORDER BY
        CASE WHEN c.status = 'synced' THEN 0 ELSE 1 END,
        c.updated_at DESC
      LIMIT 1
    `).get(...params) as { id: string; name: string; kubeconfig: string } | undefined;

    if (!cluster) {
      throw new Error(clusterId
        ? 'Selected cluster cannot be synced to Kite. Use an enabled kubeconfig credential.'
        : 'No enabled Kubernetes cluster with kubeconfig credential found.');
    }

    const kubeconfig = decrypt(cluster.kubeconfig).trim();
    if (!kubeconfig) {
      throw new Error(`Kubeconfig for cluster ${cluster.id} is empty`);
    }

    const outputPath = getBootstrapKubeconfigPath();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(outputPath, `${kubeconfig}\n`, { mode: 0o600 });

    const meta: KiteBootstrapMeta = {
      clusterId: cluster.id,
      clusterName: cluster.name,
      syncedAt: new Date().toISOString(),
      outputPath,
    };
    fs.writeFileSync(getBootstrapMetaPath(), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
    return meta;
  }

  async createSession(): Promise<KiteSessionResult> {
    const kiteUrl = getKiteUrl();
    if (!kiteUrl) {
      throw new Error('KITE_URL is not configured');
    }

    const username = process.env.KITE_USERNAME || 'admin';
    const password = process.env.KITE_PASSWORD;
    if (!password) {
      throw new Error('KITE_PASSWORD is not configured for Kite session bridge');
    }

    const baseUrl = kiteUrl.replace(/\/+$/, '');
    const login = await requestJson<unknown>(`${baseUrl}/api/auth/login/password`, 8000, {
      method: 'POST',
      body: { username, password },
    });

    if (login.statusCode !== 204 && (login.statusCode < 200 || login.statusCode >= 300)) {
      let message = `Kite login failed with status ${login.statusCode}`;
      if (login.data && typeof login.data === 'object' && 'error' in login.data) {
        message = String((login.data as { error?: unknown }).error || message);
      } else if (login.rawBody) {
        message = login.rawBody.slice(0, 200);
      }
      throw new Error(message);
    }

    const cookieHeaders = getSetCookieHeaders(login.headers);
    if (cookieHeaders.length === 0) {
      throw new Error('Kite login did not return a session cookie');
    }

    const bootstrap = await requestJson<KiteBootstrapResponse>(`${baseUrl}/api/v1/bootstrap`, 5000, {
      headers: {
        Cookie: cookieHeaders.map((cookie) => cookie.split(';')[0]).join('; '),
      },
    });

    return {
      publicUrl: getKitePublicUrl(),
      username,
      userPresent: Boolean(bootstrap.data?.user),
      cookieHeaders,
    };
  }
}

export const kiteBridgeService = new KiteBridgeService();
