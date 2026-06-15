import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  createAgentTeamRun,
  getAgentTeam,
  getAgentTeamRun,
  listAgentTeamRuns,
  listAgentTeams
} from '../services/agentTeamService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const teams = await listAgentTeams();
    res.json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Agent Teams' });
  }
});

router.get('/runs', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 20);
    const runs = listAgentTeamRuns({ limit });
    res.json({ success: true, data: runs });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Agent Team runs' });
  }
});

router.get('/runs/:runId', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const run = getAgentTeamRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Agent Team run not found' });
    }
    return res.json({ success: true, data: run });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Agent Team run' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), async (req: Request, res: Response) => {
  try {
    const team = await getAgentTeam(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Agent Team not found' });
    }
    return res.json({ success: true, data: team });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Agent Team' });
  }
});

router.get('/:id/runs', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit || 20);
    const runs = listAgentTeamRuns({ teamId: req.params.id, limit });
    res.json({ success: true, data: runs });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Agent Team runs' });
  }
});

router.post('/:id/runs', requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const run = await createAgentTeamRun(req.params.id, {
      input: req.body?.input,
      mode: req.body?.mode,
      context: req.body?.context,
      correlationId: req.body?.correlationId,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Agent Team run';
    res.status(message.includes('not found') ? 404 : 400).json({ success: false, error: message });
  }
});

export default router;
