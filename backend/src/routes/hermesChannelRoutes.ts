import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  channelToRuntimeConfig,
  createHermesChannel,
  getHermesChannel,
  listHermesChannels,
  updateHermesChannel,
  updateHermesChannelHealth
} from '../services/hermesChannelService';
import { testHermesConnection } from '../services/agentRuntime/hermesRuntime';
import { listTools } from '../services/toolApi/toolRegistry';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listHermesChannels() });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes channels' });
  }
});

router.get('/tools', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listTools() });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list tools' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const channel = getHermesChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Hermes channel not found' });
    }
    return res.json({ success: true, data: channel });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Hermes channel' });
  }
});

router.post('/', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const channel = createHermesChannel(req.body || {}, req.user?.id || null);
    res.status(201).json({ success: true, data: channel });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create Hermes channel' });
  }
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const channel = updateHermesChannel(req.params.id, req.body || {});
    res.json({ success: true, data: channel });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Hermes channel';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:id/test', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const channel = getHermesChannel(req.params.id);
    if (!channel) {
      return res.status(404).json({ success: false, error: 'Hermes channel not found' });
    }

    const result = await testHermesConnection(channelToRuntimeConfig(channel));
    updateHermesChannelHealth(channel.id, result.success);
    return res.status(result.success ? 200 : 400).json({ success: result.success, data: result, error: result.error });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to test Hermes channel' });
  }
});

export default router;
