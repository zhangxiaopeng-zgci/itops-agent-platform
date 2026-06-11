import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  getHermesCapabilityGraph,
  getHermesControlPlaneOverview,
  getHermesRiskSummary
} from '../services/hermesControlPlaneService';

const router = Router();

router.get('/overview', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const overview = await getHermesControlPlaneOverview();
    res.json({ success: true, data: overview });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to load Hermes control plane overview' });
  }
});

router.get('/capability-graph', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const graph = await getHermesCapabilityGraph();
    res.json({ success: true, data: graph });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to load Hermes capability graph' });
  }
});

router.get('/risk-summary', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const riskSummary = await getHermesRiskSummary();
    res.json({ success: true, data: riskSummary });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to load Hermes risk summary' });
  }
});

export default router;
