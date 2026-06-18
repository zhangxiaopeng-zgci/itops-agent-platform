import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { buildOpsReadinessSummary } from '../services/opsReadinessService';
import {
  createContainerRebuildDrill,
  listContainerRebuildDrills
} from '../services/containerRebuildDrillService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/summary', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const summary = await buildOpsReadinessSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build ops readiness summary'
    });
  }
});

router.get('/container-drills', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const drills = listContainerRebuildDrills(req.query.limit ? Number(req.query.limit) : 20);
    res.json({ success: true, data: drills });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list container rebuild drills'
    });
  }
});

router.post('/container-drills', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const drill = await createContainerRebuildDrill({
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
      externalRecreatePerformed: req.body?.externalRecreatePerformed === true,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: drill });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create container rebuild drill'
    });
  }
});

export default router;
