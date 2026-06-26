import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../models/database';
import { requireRole } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import { decrypt, encrypt } from '../services/encryptionService';
import { logger } from '../utils/logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    role: string;
  };
}

const credentialIdSchema = z.object({ id: z.string().uuid('Invalid Kubernetes credential ID') });
const credentialTypeSchema = z.enum(['token', 'kubeconfig', 'certificate']);

const createCredentialSchema = z.object({
  name: z.string().min(1, 'Credential name is required'),
  credential_type: credentialTypeSchema,
  username: z.string().optional().nullable(),
  token: z.string().optional().nullable(),
  kubeconfig: z.string().optional().nullable(),
  client_certificate: z.string().optional().nullable(),
  client_key: z.string().optional().nullable(),
  ca_certificate: z.string().optional().nullable(),
  server_url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
}).refine((data) => {
  if (data.credential_type === 'token') return Boolean(data.token?.trim());
  if (data.credential_type === 'kubeconfig') return Boolean(data.kubeconfig?.trim());
  if (data.credential_type === 'certificate') return Boolean(data.client_certificate?.trim() && data.client_key?.trim());
  return false;
}, {
  message: 'Token credentials require token, kubeconfig credentials require kubeconfig, certificate credentials require client certificate and key',
});

const updateCredentialSchema = z.object({
  name: z.string().min(1, 'Credential name is required').optional(),
  credential_type: credentialTypeSchema.optional(),
  username: z.string().optional().nullable(),
  token: z.string().optional().nullable(),
  kubeconfig: z.string().optional().nullable(),
  client_certificate: z.string().optional().nullable(),
  client_key: z.string().optional().nullable(),
  ca_certificate: z.string().optional().nullable(),
  server_url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function stripYamlValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '|' || trimmed === '>') return null;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseKubeconfigServer(rawKubeconfig: string | null | undefined): string | null {
  if (!rawKubeconfig) return null;
  try {
    const kubeconfig = JSON.parse(rawKubeconfig);
    const currentContextName = kubeconfig['current-context'];
    const currentContext = kubeconfig.contexts?.find((item: any) => item.name === currentContextName)?.context || kubeconfig.contexts?.[0]?.context;
    const clusterName = currentContext?.cluster;
    const cluster = kubeconfig.clusters?.find((item: any) => item.name === clusterName)?.cluster || kubeconfig.clusters?.[0]?.cluster;
    return normalizeText(cluster?.server);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return stripYamlValue(rawKubeconfig.match(/^\s*server:\s*(.+?)\s*$/m)?.[1]);
    }
    return null;
  }
}

router.get('/', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    const credentials = db.prepare(`
      SELECT
        kc.id,
        kc.name,
        kc.credential_type,
        kc.username,
        kc.server_url,
        kc.description,
        kc.created_by,
        kc.created_at,
        kc.updated_at,
        CASE WHEN kc.token_secret IS NOT NULL AND kc.token_secret != '' THEN 1 ELSE 0 END AS has_token,
        CASE WHEN kc.kubeconfig IS NOT NULL AND kc.kubeconfig != '' THEN 1 ELSE 0 END AS has_kubeconfig,
        CASE WHEN kc.client_certificate IS NOT NULL AND kc.client_certificate != '' AND kc.client_key IS NOT NULL AND kc.client_key != '' THEN 1 ELSE 0 END AS has_certificate,
        COUNT(DISTINCT c.id) AS usage_count
      FROM kubernetes_credentials kc
      LEFT JOIN kubernetes_clusters c ON c.credential_id = kc.id
      GROUP BY kc.id
      ORDER BY kc.created_at DESC
    `).all();
    res.json({ success: true, data: credentials });
  } catch (error) {
    logger.error('Failed to list Kubernetes credentials', error as Error);
    res.status(500).json({ success: false, error: 'Failed to list Kubernetes credentials' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), validateParams(credentialIdSchema), (req: Request, res: Response) => {
  try {
    const credential = db.prepare(`
      SELECT
        id,
        name,
        credential_type,
        username,
        server_url,
        description,
        created_by,
        created_at,
        updated_at,
        token_secret,
        kubeconfig,
        client_certificate,
        client_key
      FROM kubernetes_credentials
      WHERE id = ?
    `).get(req.params.id) as {
      id: string;
      name: string;
      credential_type: string;
      username?: string | null;
      server_url?: string | null;
      description?: string | null;
      created_by?: string | null;
      created_at: string;
      updated_at: string;
      token_secret?: string | null;
      kubeconfig?: string | null;
      client_certificate?: string | null;
      client_key?: string | null;
    } | undefined;

    if (!credential) {
      return res.status(404).json({ success: false, error: 'Kubernetes credential not found' });
    }

    const clusters = db.prepare(`
      SELECT id, name, environment, auth_type, api_server_url, last_sync_at
      FROM kubernetes_clusters
      WHERE credential_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id);

    const parsedServerUrl = credential.kubeconfig ? parseKubeconfigServer(decrypt(credential.kubeconfig)) : null;
    const {
      token_secret: _tokenSecret,
      kubeconfig: _kubeconfig,
      client_certificate: _clientCertificate,
      client_key: _clientKey,
      ...safeCredential
    } = credential;

    res.json({
      success: true,
      data: {
        ...safeCredential,
        has_token: Boolean(credential.token_secret),
        has_kubeconfig: Boolean(credential.kubeconfig),
        has_certificate: Boolean(credential.client_certificate && credential.client_key),
        parsed_server_url: parsedServerUrl,
        usage_count: clusters.length,
        clusters,
      },
    });
  } catch (error) {
    logger.error('Failed to get Kubernetes credential', error as Error);
    res.status(500).json({ success: false, error: 'Failed to get Kubernetes credential' });
  }
});

router.post('/', requireRole('admin'), validateBody(createCredentialSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM kubernetes_credentials WHERE name = ?').get(req.body.name);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Kubernetes credential name already exists' });
    }

    const id = randomUUID();
    db.prepare(`
      INSERT INTO kubernetes_credentials (
        id, name, credential_type, username, token_secret, kubeconfig,
        client_certificate, client_key, ca_certificate, server_url,
        description, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.body.name.trim(),
      req.body.credential_type,
      normalizeText(req.body.username),
      req.body.token ? encrypt(req.body.token) : null,
      req.body.kubeconfig ? encrypt(req.body.kubeconfig) : null,
      req.body.client_certificate ? encrypt(req.body.client_certificate) : null,
      req.body.client_key ? encrypt(req.body.client_key) : null,
      req.body.ca_certificate ? encrypt(req.body.ca_certificate) : null,
      normalizeText(req.body.server_url),
      normalizeText(req.body.description),
      req.user?.id || req.user?.username || null
    );

    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    logger.error('Failed to create Kubernetes credential', error as Error);
    res.status(500).json({ success: false, error: 'Failed to create Kubernetes credential' });
  }
});

router.put('/:id', requireRole('admin'), validateParams(credentialIdSchema), validateBody(updateCredentialSchema), (req: Request, res: Response) => {
  try {
    const existing = db.prepare(`
      SELECT id, name, credential_type, username, token_secret, kubeconfig,
        client_certificate, client_key, ca_certificate, server_url, description
      FROM kubernetes_credentials
      WHERE id = ?
    `).get(req.params.id) as {
      id: string;
      name: string;
      credential_type: string;
      username?: string | null;
      token_secret?: string | null;
      kubeconfig?: string | null;
      client_certificate?: string | null;
      client_key?: string | null;
      ca_certificate?: string | null;
      server_url?: string | null;
      description?: string | null;
    } | undefined;

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Kubernetes credential not found' });
    }

    const nextName = req.body.name !== undefined ? req.body.name.trim() : existing.name;
    const duplicate = db.prepare('SELECT id FROM kubernetes_credentials WHERE name = ? AND id != ?').get(nextName, req.params.id);
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'Kubernetes credential name already exists' });
    }

    const nextType = req.body.credential_type || existing.credential_type;
    const nextToken = normalizeText(req.body.token) ? encrypt(req.body.token) : existing.token_secret || null;
    const nextKubeconfig = normalizeText(req.body.kubeconfig) ? encrypt(req.body.kubeconfig) : existing.kubeconfig || null;
    const nextClientCertificate = normalizeText(req.body.client_certificate) ? encrypt(req.body.client_certificate) : existing.client_certificate || null;
    const nextClientKey = normalizeText(req.body.client_key) ? encrypt(req.body.client_key) : existing.client_key || null;
    const nextCaCertificate = normalizeText(req.body.ca_certificate) ? encrypt(req.body.ca_certificate) : existing.ca_certificate || null;

    if (nextType === 'token' && !nextToken) {
      return res.status(400).json({ success: false, error: 'Token credentials require token' });
    }
    if (nextType === 'kubeconfig' && !nextKubeconfig) {
      return res.status(400).json({ success: false, error: 'Kubeconfig credentials require kubeconfig' });
    }
    if (nextType === 'certificate' && (!nextClientCertificate || !nextClientKey)) {
      return res.status(400).json({ success: false, error: 'Certificate credentials require client certificate and key' });
    }

    db.prepare(`
      UPDATE kubernetes_credentials
      SET name = ?,
        credential_type = ?,
        username = ?,
        token_secret = ?,
        kubeconfig = ?,
        client_certificate = ?,
        client_key = ?,
        ca_certificate = ?,
        server_url = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextName,
      nextType,
      req.body.username !== undefined ? normalizeText(req.body.username) : existing.username || null,
      nextToken,
      nextKubeconfig,
      nextClientCertificate,
      nextClientKey,
      nextCaCertificate,
      req.body.server_url !== undefined ? normalizeText(req.body.server_url) : existing.server_url || null,
      req.body.description !== undefined ? normalizeText(req.body.description) : existing.description || null,
      req.params.id
    );

    const usage = db.prepare('SELECT COUNT(*) AS count FROM kubernetes_clusters WHERE credential_id = ?').get(req.params.id) as { count: number };
    res.json({
      success: true,
      data: {
        id: req.params.id,
        name: nextName,
        credential_type: nextType,
        username: req.body.username !== undefined ? normalizeText(req.body.username) : existing.username || null,
        server_url: req.body.server_url !== undefined ? normalizeText(req.body.server_url) : existing.server_url || null,
        description: req.body.description !== undefined ? normalizeText(req.body.description) : existing.description || null,
        has_token: Boolean(nextToken),
        has_kubeconfig: Boolean(nextKubeconfig),
        has_certificate: Boolean(nextClientCertificate && nextClientKey),
        usage_count: usage.count,
      },
    });
  } catch (error) {
    logger.error('Failed to update Kubernetes credential', error as Error);
    res.status(500).json({ success: false, error: 'Failed to update Kubernetes credential' });
  }
});

router.delete('/:id', requireRole('admin'), validateParams(credentialIdSchema), (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM kubernetes_credentials WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Kubernetes credential not found' });
    }

    const usage = db.prepare('SELECT COUNT(*) AS count FROM kubernetes_clusters WHERE credential_id = ?').get(req.params.id) as { count: number };
    if (usage.count > 0) {
      return res.status(409).json({ success: false, error: `Credential is used by ${usage.count} Kubernetes cluster(s)` });
    }

    db.prepare('DELETE FROM kubernetes_credentials WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete Kubernetes credential', error as Error);
    res.status(500).json({ success: false, error: 'Failed to delete Kubernetes credential' });
  }
});

export default router;
