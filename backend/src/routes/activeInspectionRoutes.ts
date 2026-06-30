import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { activeInspectionService } from '../services/activeInspectionService';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    role: string;
  };
}

const router = Router();

router.get('/summary', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    const result = activeInspectionService.runActiveInspection({ createCases: false });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to build active inspection summary', error as Error);
    res.status(500).json({ success: false, error: 'Failed to build active inspection summary' });
  }
});

router.post('/run', requireRole('admin', 'operator'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = activeInspectionService.runActiveInspection({
      createCases: true,
      createdBy: req.user?.id || req.user?.username || 'system',
      source: 'active_inspection_manual'
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to run active inspection', error as Error);
    res.status(500).json({ success: false, error: 'Failed to run active inspection' });
  }
});

export default router;
