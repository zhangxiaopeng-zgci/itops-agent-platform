import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { getCorrelationTrace } from '../services/correlationTraceService';

const router = Router();

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const correlationId = req.params.id;
    if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(correlationId)) {
      return res.status(400).json({ success: false, error: 'Invalid correlation id' });
    }

    return res.json({
      success: true,
      data: getCorrelationTrace(correlationId)
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch correlation chain'
    });
  }
});

export default router;
