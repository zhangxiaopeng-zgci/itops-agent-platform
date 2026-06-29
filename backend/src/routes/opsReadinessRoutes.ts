import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { buildOpsReadinessSummary } from '../services/opsReadinessService';
import {
  createContainerRebuildDrill,
  listContainerRebuildDrills
} from '../services/containerRebuildDrillService';
import {
  createKiteBackup,
  createKiteBackupDrill,
  listKiteBackupDrills,
  listKiteBackups
} from '../services/kiteBackupService';
import { runClosedLoopSmoke } from '../services/closedLoopSmokeService';

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

router.post('/closed-loop-smoke', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runClosedLoopSmoke({
      createdBy: req.user?.id || null,
      retainEvidence: req.body?.retainEvidence === true
    });
    res.status(result.success ? 201 : 500).json({ success: result.success, data: result });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run closed-loop smoke'
    });
  }
});

router.get('/kite-backups', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const backups = listKiteBackups(req.query.limit ? Number(req.query.limit) : 20);
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list Kite backups'
    });
  }
});

router.post('/kite-backups', requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const backup = await createKiteBackup();
    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Kite backup'
    });
  }
});

router.get('/kite-restore-drills', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const drills = listKiteBackupDrills(req.query.limit ? Number(req.query.limit) : 20);
    res.json({ success: true, data: drills });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list Kite restore drills'
    });
  }
});

router.post('/kite-restore-drills', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const drill = await createKiteBackupDrill({
      backupId: typeof req.body?.backupId === 'string' ? req.body.backupId : undefined,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: drill });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Kite restore drill'
    });
  }
});

export default router;
