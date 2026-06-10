import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createSkill, getSkill, listSkills, updateSkill } from '../services/skillService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const onlyEnabled = req.query.enabled === 'true';
    res.json({ success: true, data: listSkills(onlyEnabled) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Skill Packs' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const skill = getSkill(req.params.id);
    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill Pack not found' });
    }
    return res.json({ success: true, data: skill });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Skill Pack' });
  }
});

router.post('/', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const skill = createSkill(req.body || {}, req.user?.id || null);
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create Skill Pack' });
  }
});

router.put('/:id', requireRole('admin'), (req: Request, res: Response) => {
  try {
    const skill = updateSkill(req.params.id, req.body || {});
    res.json({ success: true, data: skill });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Skill Pack';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

export default router;
