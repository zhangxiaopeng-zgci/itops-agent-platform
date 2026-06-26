import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { kiteBridgeService } from '../services/kiteBridgeService';
import { logger } from '../utils/logger';

const router = Router();

const syncSchema = z.object({
  clusterId: z.string().uuid().optional().nullable(),
});

router.get('/status', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const status = await kiteBridgeService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Failed to get Kite bridge status', error as Error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Kite bridge status' });
  }
});

router.post('/sync-bootstrap', requireRole('admin', 'operator'), validateBody(syncSchema), async (req: Request, res: Response) => {
  try {
    const result = await kiteBridgeService.syncBootstrap(req.body.clusterId || null);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to sync Kite bootstrap kubeconfig', error as Error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to sync Kite bootstrap kubeconfig' });
  }
});

router.post('/session', requireRole('admin', 'operator'), async (_req: Request, res: Response) => {
  try {
    const result = await kiteBridgeService.createSession();
    res.setHeader('Set-Cookie', result.cookieHeaders);
    res.json({
      success: true,
      data: {
        publicUrl: result.publicUrl,
        username: result.username,
        userPresent: result.userPresent,
      },
    });
  } catch (error) {
    logger.error('Failed to create Kite bridge session', error as Error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create Kite bridge session' });
  }
});

export default router;
