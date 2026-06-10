import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  getHermesWorkerStatuses,
  listHermesWorkerDefinitions,
  listHermesWorkerHeartbeats,
  listHermesWorkerRuns
} from '../services/hermesWorkerService';

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

router.get('/runs', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 50);
    res.json({ success: true, data: listHermesWorkerRuns(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes worker runs' });
  }
});

router.get('/heartbeats', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 100);
    res.json({ success: true, data: listHermesWorkerHeartbeats(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes worker heartbeats' });
  }
});

export default router;
