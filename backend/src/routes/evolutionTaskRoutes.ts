import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  evolutionContinuousService,
  getEvolutionTask,
  listEvolutionReviewQueue,
  listEvolutionTaskRuns,
  listEvolutionTasks,
  updateEvolutionTask
} from '../services/evolutionContinuousService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listEvolutionTasks() });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution tasks' });
  }
});

router.get('/runs', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    res.json({ success: true, data: listEvolutionTaskRuns(limit) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution task runs' });
  }
});

router.get('/queue', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: listEvolutionReviewQueue({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution review queue' });
  }
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const task = updateEvolutionTask({
      id: req.params.id,
      enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
      schedule: typeof req.body?.schedule === 'string' ? req.body.schedule : undefined
    });

    res.json({ success: true, data: task });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update evolution task';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

router.post('/:id/run', requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const task = getEvolutionTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Evolution task not found' });
    }

    const run = await evolutionContinuousService.runTask(task.id, req.user?.id || 'manual');
    return res.json({ success: true, data: run });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to run evolution task' });
  }
});

export default router;
