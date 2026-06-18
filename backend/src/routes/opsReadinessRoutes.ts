import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { buildOpsReadinessSummary } from '../services/opsReadinessService';

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

export default router;
