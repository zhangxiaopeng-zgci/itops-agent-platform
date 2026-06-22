import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import {
  createHermesBoardFeedback,
  getHermesDashboardSettings,
  listHermesExternalLinks,
  probeHermesDashboard,
  updateHermesDashboardSettings,
  upsertHermesExternalLink,
} from '../services/hermesDashboardBridgeService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  dashboardUrl: z.string().optional(),
  embedMode: z.enum(['link', 'iframe', 'sidecar']).optional(),
  authMode: z.enum(['none', 'reverse_proxy', 'token']).optional(),
  allowedOrigins: z.array(z.string()).optional(),
});

const externalLinkSchema = z.object({
  source_type: z.string().min(1),
  source_id: z.string().min(1),
  correlation_id: z.string().optional().nullable(),
  external_system: z.string().optional().nullable(),
  external_url: z.string().min(1),
  external_card_id: z.string().optional().nullable(),
  external_run_id: z.string().optional().nullable(),
  external_state: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  metadata: z.unknown().optional(),
});

const boardFeedbackSchema = z.object({
  sourceType: z.enum(['hermes_session', 'worker_run', 'correlation_trace', 'tool_approval', 'task']),
  sourceId: z.string().min(1).max(160),
  category: z.enum(['useful', 'wrong_root_cause', 'missing_evidence', 'unsafe_action', 'needs_workflow']),
  reason: z.string().max(1000).optional().nullable(),
  correlationId: z.string().max(128).optional().nullable(),
  evidenceRefs: z.unknown().optional(),
});

router.get('/settings', requireRole('admin', 'operator', 'viewer'), (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getHermesDashboardSettings() });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get Hermes Dashboard settings' });
  }
});

router.put('/settings', requireRole('admin'), validateBody(settingsSchema), (req: Request, res: Response) => {
  try {
    const settings = updateHermesDashboardSettings(req.body || {});
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to update Hermes Dashboard settings' });
  }
});

router.get('/health', requireRole('admin', 'operator', 'viewer'), async (_req: Request, res: Response) => {
  try {
    const health = await probeHermesDashboard();
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to probe Hermes Dashboard' });
  }
});

router.get('/external-links', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '50'), 10);
    const links = listHermesExternalLinks({
      sourceType: req.query.source_type ? String(req.query.source_type) : undefined,
      sourceId: req.query.source_id ? String(req.query.source_id) : undefined,
      correlationId: req.query.correlation_id ? String(req.query.correlation_id) : undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list Hermes external links' });
  }
});

router.post('/external-links', requireRole('admin', 'operator'), validateBody(externalLinkSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const link = upsertHermesExternalLink({
      ...req.body,
      created_by: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to save Hermes external link' });
  }
});

router.post('/feedback', requireRole('admin', 'operator'), validateBody(boardFeedbackSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const feedback = createHermesBoardFeedback({
      sourceType: req.body.sourceType,
      sourceId: req.body.sourceId,
      category: req.body.category,
      reason: req.body.reason,
      correlationId: req.body.correlationId,
      evidenceRefs: req.body.evidenceRefs,
      createdBy: req.user?.id || null,
    });
    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to save Hermes board feedback' });
  }
});

export default router;
