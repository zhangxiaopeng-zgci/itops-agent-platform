import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import db from '../models/database';
import { requireRole } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import { encrypt } from '../services/encryptionService';
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

function normalizeText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
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
