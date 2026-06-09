import { Router, Request, Response } from 'express';
import { invokeTool, listTools } from '../services/toolApi/toolRegistry';
import { ToolContext } from '../services/toolApi/types';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: listTools() });
});

router.post('/:name/invoke', async (req: AuthenticatedRequest, res: Response) => {
  const context: ToolContext = {
    userId: req.user?.id,
    userRole: req.user?.role || 'viewer',
    ipAddress: req.ip,
    source: req.body?.source === 'agent_runtime' ? 'agent_runtime' : 'api'
  };

  const input = isPlainObject(req.body?.input) ? req.body.input : {};
  const result = await invokeTool(req.params.name, input, context);

  if (result.decision.status === 'approval_required') {
    return res.status(202).json(result);
  }

  if (result.decision.status === 'denied') {
    return res.status(403).json(result);
  }

  return res.status(result.success ? 200 : 400).json(result);
});

router.post('/invoke', async (req: AuthenticatedRequest, res: Response) => {
  const toolName = typeof req.body?.tool === 'string' ? req.body.tool : '';
  const context: ToolContext = {
    userId: req.user?.id,
    userRole: req.user?.role || 'viewer',
    ipAddress: req.ip,
    source: req.body?.source === 'agent_runtime' ? 'agent_runtime' : 'api'
  };

  const input = isPlainObject(req.body?.input) ? req.body.input : {};
  const result = await invokeTool(toolName, input, context);

  if (result.decision.status === 'approval_required') {
    return res.status(202).json(result);
  }

  if (result.decision.status === 'denied') {
    return res.status(403).json(result);
  }

  return res.status(result.success ? 200 : 400).json(result);
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export default router;
