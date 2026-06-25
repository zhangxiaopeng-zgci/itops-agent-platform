import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { getCorrelationTrace } from '../services/correlationTraceService';
import {
  addOperationCaseEvent,
  createOperationCase,
  getOperationCase,
  listOperationCaseEvents,
  listOperationCases,
  updateOperationCaseStatus
} from '../services/operationCaseService';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const router = Router();

const caseStatusSchema = z.enum([
  'diagnosing',
  'diagnosis_ready',
  'approval_pending',
  'executing',
  'verifying',
  'reviewing',
  'evolving',
  'closed',
  'cancelled'
]);

const createCaseSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  caseType: z.string().min(1).max(80).optional(),
  status: caseStatusSchema.optional(),
  severity: z.string().max(40).optional().nullable(),
  source: z.string().min(1).max(80).optional(),
  assetId: z.string().max(160).optional().nullable(),
  assetType: z.string().max(80).optional().nullable(),
  assetName: z.string().max(240).optional().nullable(),
  alertId: z.string().max(160).optional().nullable(),
  correlationId: z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/).optional().nullable(),
  serverIds: z.array(z.string().min(1).max(160)).optional(),
  context: z.record(z.unknown()).optional(),
  summary: z.record(z.unknown()).optional().nullable()
});

const eventSchema = z.object({
  eventType: z.string().min(1).max(100),
  sourceType: z.string().max(100).optional().nullable(),
  sourceId: z.string().max(160).optional().nullable(),
  correlationId: z.string().regex(/^[a-zA-Z0-9._:-]{8,128}$/).optional().nullable(),
  payload: z.record(z.unknown()).optional()
});

const statusSchema = z.object({
  status: caseStatusSchema,
  summary: z.record(z.unknown()).optional().nullable()
});

router.get('/', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const result = listOperationCases({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      correlationId: typeof req.query.correlationId === 'string' ? req.query.correlationId : undefined,
      limit: req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined,
      offset: req.query.offset ? Number.parseInt(String(req.query.offset), 10) : undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to list operation cases' });
  }
});

router.post('/', requireRole('admin', 'operator'), validateBody(createCaseSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const operationCase = createOperationCase({
      ...req.body,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: operationCase });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to create operation case' });
  }
});

router.get('/:id', requireRole('admin', 'operator', 'viewer'), (req: Request, res: Response) => {
  try {
    const operationCase = getOperationCase(req.params.id);
    if (!operationCase) {
      return res.status(404).json({ success: false, error: 'Operation case not found' });
    }

    return res.json({
      success: true,
      data: {
        case: operationCase,
        events: listOperationCaseEvents(operationCase.id),
        trace: getCorrelationTrace(operationCase.correlation_id)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Failed to get operation case' });
  }
});

router.post('/:id/events', requireRole('admin', 'operator'), validateBody(eventSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const event = addOperationCaseEvent({
      caseId: req.params.id,
      eventType: req.body.eventType,
      sourceType: req.body.sourceType,
      sourceId: req.body.sourceId,
      correlationId: req.body.correlationId,
      payload: req.body.payload,
      createdBy: req.user?.id || null
    });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to add operation case event' });
  }
});

router.put('/:id/status', requireRole('admin', 'operator'), validateBody(statusSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const operationCase = updateOperationCaseStatus({
      id: req.params.id,
      status: req.body.status,
      summary: req.body.summary,
      createdBy: req.user?.id || null
    });
    res.json({ success: true, data: operationCase });
  } catch (error) {
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Failed to update operation case status' });
  }
});

export default router;
