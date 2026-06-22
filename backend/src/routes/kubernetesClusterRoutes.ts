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

const labelsSchema = z.union([z.record(z.unknown()), z.string()]).optional().nullable();

const syncAssetsSchema = z.object({
  nodes: z.array(z.object({
    name: z.string().min(1),
    internal_ip: z.string().optional().nullable(),
    external_ip: z.string().optional().nullable(),
    role: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    kubelet_version: z.string().optional().nullable(),
    os_image: z.string().optional().nullable(),
    container_runtime: z.string().optional().nullable(),
    cpu_capacity: z.string().optional().nullable(),
    memory_capacity: z.string().optional().nullable(),
    pod_capacity: z.number().optional().nullable(),
    server_id: z.string().optional().nullable(),
    labels: labelsSchema,
    annotations: labelsSchema,
  })).optional().default([]),
  namespaces: z.array(z.object({
    name: z.string().min(1),
    status: z.string().optional().nullable(),
    labels: labelsSchema,
    annotations: labelsSchema,
  })).optional().default([]),
  workloads: z.array(z.object({
    namespace: z.string().optional().nullable(),
    name: z.string().min(1),
    kind: z.string().min(1),
    replicas: z.number().optional().nullable(),
    ready_replicas: z.number().optional().nullable(),
    status: z.string().optional().nullable(),
    labels: labelsSchema,
    annotations: labelsSchema,
  })).optional().default([]),
  pods: z.array(z.object({
    namespace: z.string().optional().nullable(),
    name: z.string().min(1),
    phase: z.string().optional().nullable(),
    pod_ip: z.string().optional().nullable(),
    host_ip: z.string().optional().nullable(),
    node_name: z.string().optional().nullable(),
    restart_count: z.number().optional().nullable(),
    ready: z.union([z.boolean(), z.number()]).optional().nullable(),
    labels: labelsSchema,
    annotations: labelsSchema,
  })).optional().default([]),
  services: z.array(z.object({
    namespace: z.string().optional().nullable(),
    name: z.string().min(1),
    type: z.string().optional().nullable(),
    cluster_ip: z.string().optional().nullable(),
    external_ip: z.string().optional().nullable(),
    ports: z.unknown().optional().nullable(),
    selector: z.unknown().optional().nullable(),
    labels: labelsSchema,
  })).optional().default([]),
  events: z.array(z.object({
    namespace: z.string().optional().nullable(),
    involved_kind: z.string().optional().nullable(),
    involved_name: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
    reason: z.string().optional().nullable(),
    message: z.string().optional().nullable(),
    count: z.number().optional().nullable(),
    first_seen_at: z.string().optional().nullable(),
    last_seen_at: z.string().optional().nullable(),
  })).optional().default([]),
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

router.post('/:id/sync-assets', requireRole('admin', 'operator'), validateParams(clusterIdSchema), validateBody(syncAssetsSchema), (req: Request, res: Response) => {
  try {
    const result = kubernetesClusterService.syncClusterAssets(req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Kubernetes cluster not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Failed to sync Kubernetes cluster assets', error as Error);
    const message = error instanceof Error ? error.message : 'Failed to sync Kubernetes cluster assets';
    res.status(500).json({ success: false, error: message });
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
