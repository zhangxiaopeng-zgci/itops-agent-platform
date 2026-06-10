import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createMcpServer, getMcpServer, listMcpServers, testMcpServer, updateMcpServer } from '../services/mcpServerService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const onlyEnabled = req.query.enabled === 'true';
    res.json({ success: true, data: listMcpServers(onlyEnabled) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list MCP servers' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const server = getMcpServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'MCP server not found' });
    }
    return res.json({ success: true, data: server });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get MCP server' });
  }
});

router.post('/', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const server = createMcpServer(req.body || {}, req.user?.id || null);
    res.status(201).json({ success: true, data: server });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create MCP server' });
  }
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const server = updateMcpServer(req.params.id, req.body || {});
    res.json({ success: true, data: server });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update MCP server';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:id/test', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const result = await testMcpServer(req.params.id);
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result, error: result.error });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to test MCP server';
    res.status(message.includes('not found') ? 404 : 500).json({ success: false, error: message });
  }
});

export default router;
