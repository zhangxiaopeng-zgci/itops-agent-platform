import { Router, Request, Response } from 'express';
import db from '../models/database';
import { randomUUID } from 'crypto';
import { encrypt } from '../services/encryptionService';
import { safeError } from '../utils/sensitiveMask';
import { validateBody, validateParams } from '../middleware/validation';
import { serverSchemas } from '../schemas/apiValidation';
import { requireRole } from '../middleware/auth';

const router = Router();

function syncServerGroups(serverId: string, groupIds: string[] | undefined) {
  if (!groupIds) return;

  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));
  if (uniqueGroupIds.length > 0) {
    const placeholders = uniqueGroupIds.map(() => '?').join(', ');
    const existingGroups = db.prepare(`SELECT id FROM server_groups WHERE id IN (${placeholders})`).all(...uniqueGroupIds) as Array<{ id: string }>;
    if (existingGroups.length !== uniqueGroupIds.length) {
      throw new Error('One or more server groups do not exist');
    }
  }

  db.transaction(() => {
    db.prepare('DELETE FROM server_group_mapping WHERE server_id = ?').run(serverId);
    const insert = db.prepare('INSERT OR IGNORE INTO server_group_mapping (server_id, group_id) VALUES (?, ?)');
    for (const groupId of uniqueGroupIds) {
      insert.run(serverId, groupId);
    }
  })();
}

// Get all servers
router.get('/', (_req: Request, res: Response) => {
  try {
    const servers = db.prepare('SELECT * FROM servers ORDER BY created_at DESC').all();
    const processedServers = (servers as Array<{ id: string; password?: string; private_key?: string; vnc_password?: string; tags?: string; [key: string]: unknown }>).map(server => {
      const { password: _password, private_key: _private_key, vnc_password: _vnc_password, ...safeServer } = server;
      const groups = db.prepare(
        `SELECT sg.id, sg.name FROM server_groups sg
         JOIN server_group_mapping sgm ON sg.id = sgm.group_id
         WHERE sgm.server_id = ?`
      ).all(server.id);
      return { ...safeServer, tags: server.tags ? JSON.parse(server.tags) : [], groups };
    });
    res.json({ success: true, data: processedServers });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get servers' });
  }
});

// Get single server
router.get('/:id', validateParams(serverSchemas.serverId), (req: Request, res: Response) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const { password: _password, private_key: _private_key, vnc_password: _vnc_password, ...safeServer } = server as { password?: string; private_key?: string; vnc_password?: string; tags?: string; [key: string]: unknown };
    res.json({
      success: true,
      data: { ...safeServer, tags: safeServer.tags ? JSON.parse(safeServer.tags) : [] }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get server' });
  }
});

// Create server
router.post('/', validateBody(serverSchemas.createServer), requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    const { name, hostname, port, username, password, private_key, use_ssh_key, description, os_type, ssh_key_id } = req.body;
    const { group_ids } = req.body as { group_ids?: string[] };
    const tags = (req.body as Record<string, unknown>).tags;
    const tagsJson = tags ? JSON.stringify(tags) : null;

    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedPrivateKey = private_key ? encrypt(private_key) : null;

    const id = randomUUID();
    db.prepare(
      `INSERT INTO servers (id, name, hostname, port, username, password, private_key, use_ssh_key, description, tags, os_type, ssh_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, hostname, port || 22, username, encryptedPassword, encryptedPrivateKey, use_ssh_key ? 1 : 0, description || null, tagsJson, os_type || 'linux', ssh_key_id || null);
    syncServerGroups(id, group_ids);

    res.json({ success: true, data: { id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create server';
    res.status(500).json({ success: false, error: message });
  }
});

// Update server
router.put('/:id', validateParams(serverSchemas.serverId), validateBody(serverSchemas.updateServer), requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const { name, hostname, port, username, password, private_key, use_ssh_key, description, enabled, os_type, ssh_key_id } = req.body as Record<string, unknown>;
    const { group_ids } = req.body as { group_ids?: string[] };
    const hasSshKeyId = Object.prototype.hasOwnProperty.call(req.body, 'ssh_key_id');
    const tags = (req.body as Record<string, unknown>).tags;
    const tagsJson = tags ? JSON.stringify(tags) : undefined;

    let encryptedPassword: string | null | undefined;
    let encryptedPrivateKey: string | null | undefined;

    if (password !== undefined && typeof password === 'string') {
      encryptedPassword = password ? encrypt(password) : null;
    }

    if (private_key !== undefined && typeof private_key === 'string') {
      encryptedPrivateKey = private_key ? encrypt(private_key) : null;
    }

    db.prepare(
      `UPDATE servers
       SET name = COALESCE(?, name),
           hostname = COALESCE(?, hostname),
           port = COALESCE(?, port),
           username = COALESCE(?, username),
           password = CASE WHEN ? IS NOT NULL THEN ? ELSE password END,
           private_key = CASE WHEN ? IS NOT NULL THEN ? ELSE private_key END,
           use_ssh_key = COALESCE(?, use_ssh_key),
           description = COALESCE(?, description),
           tags = COALESCE(?, tags),
           enabled = COALESCE(?, enabled),
           os_type = COALESCE(?, os_type),
           ssh_key_id = CASE WHEN ? THEN ? ELSE ssh_key_id END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      name, hostname, port, username,
      password !== undefined ? encryptedPassword : undefined,
      password !== undefined ? encryptedPassword : undefined,
      private_key !== undefined ? encryptedPrivateKey : undefined,
      private_key !== undefined ? encryptedPrivateKey : undefined,
      use_ssh_key !== undefined ? (use_ssh_key ? 1 : 0) : undefined,
      description, tagsJson, enabled, os_type, hasSshKeyId ? 1 : 0, ssh_key_id ?? null, req.params.id
    );
    syncServerGroups(req.params.id, group_ids);

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update server';
    res.status(500).json({ success: false, error: message });
  }
});

// Delete server
router.delete('/:id', validateParams(serverSchemas.serverId), requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete server' });
  }
});

// Get server command history
router.get('/:id/command-history', validateParams(serverSchemas.serverId), (req: Request, res: Response) => {
  try {
    const history = db.prepare(
      `SELECT * FROM server_command_history WHERE server_id = ? ORDER BY executed_at DESC LIMIT 50`
    ).all(req.params.id);
    res.json({ success: true, data: history });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get command history' });
  }
});

// Get compliance history
router.get('/:id/compliance-history', validateParams(serverSchemas.serverId), (req: Request, res: Response) => {
  try {
    const checks = db.prepare(
      `SELECT * FROM compliance_checks WHERE server_id = ? ORDER BY created_at DESC LIMIT 20`
    ).all(req.params.id);
    res.json({ success: true, data: checks });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to get compliance history' });
  }
});

// Export command history
router.get('/:id/command-history/export', validateParams(serverSchemas.serverId), (req: Request, res: Response) => {
  try {
    const serverId = req.params.id;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as { id: string; name: string; hostname: string; [key: string]: unknown } | undefined;
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const history = db.prepare(
      `SELECT * FROM server_command_history WHERE server_id = ? ORDER BY executed_at DESC`
    ).all(serverId);
    const exportData = {
      server: { id: server.id, name: server.name, hostname: server.hostname, exportTime: new Date().toISOString() },
      commandHistory: history
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="command-history-${serverId}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error) {
    safeError('Failed to export command history:', error);
    res.status(500).json({ success: false, error: 'Failed to export command history' });
  }
});

// Export compliance history
router.get('/:id/compliance-history/export', validateParams(serverSchemas.serverId), (req: Request, res: Response) => {
  try {
    const serverId = req.params.id;
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as { id: string; name: string; hostname: string } | undefined;
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const checks = db.prepare(
      `SELECT * FROM compliance_checks WHERE server_id = ? ORDER BY created_at DESC`
    ).all(serverId);
    const exportData = {
      server: { id: server.id, name: server.name, hostname: server.hostname, exportTime: new Date().toISOString() },
      complianceHistory: checks
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-history-${serverId}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (error: unknown) {
    safeError('Failed to export compliance history:', error);
    res.status(500).json({ success: false, error: 'Failed to export compliance history' });
  }
});

export default router;
