import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import {
  getToolApproval,
  listToolApprovals,
  markToolApprovalExecuted,
  markToolApprovalRejected
} from '../services/toolApi/approvalService';
import { invokeTool } from '../services/toolApi/toolRegistry';
import { ToolContext } from '../services/toolApi/types';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', requireRole('admin', 'operator'), (req: Request, res: Response) => {
  try {
    const result = listToolApprovals({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list tool approvals' });
  }
});

router.get('/:id', requireRole('admin', 'operator'), (req: Request, res: Response) => {
  const approval = getToolApproval(req.params.id);
  if (!approval) {
    return res.status(404).json({ success: false, error: 'Tool approval not found' });
  }

  return res.json({ success: true, data: approval });
});

router.post('/:id/reject', requireRole('admin', 'operator'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const approval = markToolApprovalRejected(
      req.params.id,
      req.user?.id || 'unknown',
      typeof req.body?.comment === 'string' ? req.body.comment : undefined
    );

    res.json({ success: true, data: approval });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to reject tool approval' });
  }
});

router.post('/:id/approve', requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const approval = getToolApproval(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Tool approval not found' });
    }
    if (approval.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Tool approval is already ${approval.status}` });
    }

    const context: ToolContext = {
      userId: req.user?.id,
      userRole: req.user?.role || 'viewer',
      ipAddress: req.ip,
      source: 'api'
    };

    const result = await invokeTool(approval.tool_name, approval.input, context, { skipApproval: true });
    const updated = markToolApprovalExecuted(
      req.params.id,
      req.user?.id || 'unknown',
      result,
      typeof req.body?.comment === 'string' ? req.body.comment : undefined
    );

    res.status(result.success ? 200 : 400).json({ success: result.success, data: updated, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to approve tool approval' });
  }
});

export default router;
