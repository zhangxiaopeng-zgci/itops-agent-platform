import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { getHermesSession, listHermesSessions } from '../services/hermesSessionService';

const router = Router();

router.get('/', requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    const result = listHermesSessions({
      mode: typeof req.query.mode === 'string' ? req.query.mode : undefined,
      correlationId: typeof req.query.correlationId === 'string' ? req.query.correlationId : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes sessions' });
  }
});

router.get('/:id', requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    const session = getHermesSession(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Hermes session not found' });
    }

    return res.json({ success: true, data: session });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Hermes session' });
  }
});

export default router;
