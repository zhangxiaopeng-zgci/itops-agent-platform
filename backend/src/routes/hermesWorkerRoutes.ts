import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { getHermesWorkerStatuses, listHermesWorkerDefinitions } from '../services/hermesWorkerService';

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const workers = await getHermesWorkerStatuses();
    res.json({ success: true, data: workers });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes workers' });
  }
});

router.get('/definitions', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listHermesWorkerDefinitions() });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes worker definitions' });
  }
});

export default router;
