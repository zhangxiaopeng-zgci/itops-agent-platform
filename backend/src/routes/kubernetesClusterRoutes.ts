import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import { kubernetesClusterService } from '../services/kubernetesClusterService';
import { logger } from '../utils/logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username?: string;
    role: string;
  };
}

const clusterIdSchema = z.object({ id: z.string().uuid('Invalid Kubernetes cluster ID') });
const authTypeSchema = z.enum(['kubeconfig', 'token', 'certificate']);

const createClusterSchema = z.object({
  name: z.string().min(1, 'Cluster name is required'),
  api_server_url: z.string().optional().nullable(),
  environment: z.string().optional().nullable(),
  distribution: z.string().optional().nullable(),
  version: z.string().optional().nullable(),
  auth_type: authTypeSchema.optional(),
  credential_id: z.string().optional().nullable(),
  enabled: z.union([z.boolean(), z.number()]).optional(),
  description: z.string().optional().nullable(),
});

const updateClusterSchema = createClusterSchema.partial().extend({
  status: z.string().optional(),
});

router.get('/', (_req: Request, res: Response) => {
  try {
    const clusters = kubernetesClusterService.getAllClusters();
    res.json({ success: true, data: clusters });
  } catch (error) {
    logger.error('Failed to list Kubernetes clusters', error as Error);
    res.status(500).json({ success: false, error: 'Failed to list Kubernetes clusters' });
  }
});

router.get('/:id', validateParams(clusterIdSchema), (req: Request, res: Response) => {
  try {
    const cluster = kubernetesClusterService.getClusterById(req.params.id);
    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }
    res.json({ success: true, data: cluster });
  } catch (error) {
    logger.error('Failed to get Kubernetes cluster', error as Error);
    res.status(500).json({ success: false, error: 'Failed to get Kubernetes cluster' });
  }
});

router.get('/:id/assets', validateParams(clusterIdSchema), (req: Request, res: Response) => {
  try {
    const assets = kubernetesClusterService.getClusterAssets(req.params.id);
    if (!assets) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }
    res.json({ success: true, data: assets });
  } catch (error) {
    logger.error('Failed to get Kubernetes cluster assets', error as Error);
    res.status(500).json({ success: false, error: 'Failed to get Kubernetes cluster assets' });
  }
});

router.post('/', requireRole('admin'), validateBody(createClusterSchema), (req: AuthenticatedRequest, res: Response) => {
  try {
    const cluster = kubernetesClusterService.createCluster({
      ...req.body,
      created_by: req.user?.id || req.user?.username,
    });
    res.status(201).json({ success: true, data: cluster });
  } catch (error) {
    logger.error('Failed to create Kubernetes cluster', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to create Kubernetes cluster';
    if (message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, error: 'Kubernetes cluster name already exists' });
    }
    res.status(500).json({ success: false, error: message });
  }
});

router.put('/:id', requireRole('admin'), validateParams(clusterIdSchema), validateBody(updateClusterSchema), (req: Request, res: Response) => {
  try {
    const cluster = kubernetesClusterService.updateCluster(req.params.id, req.body);
    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }
    res.json({ success: true, data: cluster });
  } catch (error) {
    logger.error('Failed to update Kubernetes cluster', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to update Kubernetes cluster';
    if (message.includes('UNIQUE constraint')) {
      return res.status(409).json({ success: false, error: 'Kubernetes cluster name already exists' });
    }
    res.status(500).json({ success: false, error: message });
  }
});

router.delete('/:id', requireRole('admin'), validateParams(clusterIdSchema), (req: Request, res: Response) => {
  try {
    const deleted = kubernetesClusterService.deleteCluster(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }
    res.json({ success: true, message: 'Kubernetes cluster deleted' });
  } catch (error) {
    logger.error('Failed to delete Kubernetes cluster', error as Error);
    res.status(500).json({ success: false, error: 'Failed to delete Kubernetes cluster' });
  }
});

router.post('/:id/test-connection', requireRole('admin'), validateParams(clusterIdSchema), (req: Request, res: Response) => {
  try {
    const result = kubernetesClusterService.validateConnectionConfig(req.params.id);
    res.status(result.success ? 200 : 400).json({ success: result.success, data: result });
  } catch (error) {
    logger.error('Failed to validate Kubernetes cluster connection config', error as Error);
    res.status(500).json({ success: false, error: 'Failed to validate Kubernetes cluster connection config' });
  }
});

export default router;
