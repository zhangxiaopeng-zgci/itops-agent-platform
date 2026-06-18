import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  createEvolutionProposal,
  enrichEvolutionProposal,
  generateEvolutionProposal,
  getEvolutionProposal,
  listEvolutionProposalEvents,
  listEvolutionProposals,
  updateEvolutionProposalStatus
} from '../services/evolutionProposalService';
import {
  evaluateEvolutionProposal,
  listEvolutionProposalEvaluations
} from '../services/evolutionEvaluationService';
import {
  listEvolutionReleaseEvents,
  listEvolutionReleaseVersions,
  publishEvolutionProposal,
  rollbackEvolutionReleaseVersion
} from '../services/evolutionReleaseService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const result = listEvolutionProposals({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution proposals' });
  }
});

router.get('/releases/versions', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const versions = listEvolutionReleaseVersions({
      objectType: typeof req.query.objectType === 'string' ? req.query.objectType : undefined,
      targetId: typeof req.query.targetId === 'string' ? req.query.targetId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    });

    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution release versions' });
  }
});

router.get('/releases/versions/:id/events', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: listEvolutionReleaseEvents(req.params.id) });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list evolution release events' });
  }
});

router.post('/releases/versions/:id/rollback', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = rollbackEvolutionReleaseVersion({
      versionId: req.params.id,
      actorId: req.user?.id || null,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined
    });

    res.json({ success: true, data: version });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to rollback evolution release version' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const proposal = getEvolutionProposal(req.params.id);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Evolution proposal not found' });
    }

    return res.json({
      success: true,
      data: {
        proposal,
        events: listEvolutionProposalEvents(req.params.id),
        evaluations: listEvolutionProposalEvaluations(req.params.id),
        releases: listEvolutionReleaseVersions({ proposalId: req.params.id })
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get evolution proposal' });
  }
});

router.post('/', requireRole('admin', 'operator'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const proposal = createEvolutionProposal({
      title: req.body?.title,
      type: req.body?.type,
      priority: req.body?.priority,
      source: 'manual',
      sourceRef: req.body?.sourceRef,
      targetDescriptor: req.body?.targetDescriptor,
      proposalBody: req.body?.proposalBody,
      evidenceRefs: req.body?.evidenceRefs,
      riskNotes: req.body?.riskNotes,
      correlationId: req.body?.correlationId,
      createdBy: req.user?.id || null
    });

    res.status(201).json({ success: true, data: proposal });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create evolution proposal' });
  }
});

router.post('/generate', requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proposal = await generateEvolutionProposal({
      prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : undefined,
      type: typeof req.body?.type === 'string' ? req.body.type : undefined,
      priority: typeof req.body?.priority === 'string' ? req.body.priority : undefined,
      correlationId: typeof req.body?.correlationId === 'string' ? req.body.correlationId : undefined,
      evidenceWindowHours: req.body?.evidenceWindowHours,
      createdBy: req.user?.id || null,
      userRole: req.user?.role || null,
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: proposal });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to generate evolution proposal' });
  }
});

router.post('/:id/evaluate', requireRole('admin', 'operator'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const evaluation = evaluateEvolutionProposal({
      proposalId: req.params.id,
      actorId: req.user?.id || null
    });

    return res.json({ success: true, data: evaluation });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to evaluate evolution proposal' });
  }
});

router.post('/:id/enrich', requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await enrichEvolutionProposal({
      proposalId: req.params.id,
      actorId: req.user?.id || null,
      userRole: req.user?.role || null,
      ipAddress: req.ip
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to enrich evolution proposal' });
  }
});

router.post('/:id/publish', requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const version = publishEvolutionProposal({
      proposalId: req.params.id,
      actorId: req.user?.id || null,
      comment: typeof req.body?.comment === 'string' ? req.body.comment : undefined
    });

    return res.status(201).json({ success: true, data: version });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to publish evolution proposal' });
  }
});

router.post('/:id/status', requireRole('admin', 'operator'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedStatus = String(req.body?.status || '');
    if (requestedStatus === 'approved' && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only admins can approve evolution proposals' });
    }

    const proposal = updateEvolutionProposalStatus({
      id: req.params.id,
      status: requestedStatus,
      actorId: req.user?.id || null,
      comment: typeof req.body?.comment === 'string' ? req.body.comment : undefined,
      evalSummary: req.body?.evalSummary
    });

    return res.json({ success: true, data: proposal });
  } catch (error) {
    return res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to update evolution proposal status' });
  }
});

export default router;
