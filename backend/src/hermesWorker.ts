import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios, { AxiosError } from 'axios';
import fs from 'fs';

type HermesWorkerRole = 'diagnose' | 'remediate' | 'evolve';

const app = express();
const role = parseWorkerRole(process.env.HERMES_WORKER_ROLE);
const port = Number(process.env.HERMES_WORKER_PORT || process.env.PORT || 4100);
const upstreamBase = trimTrailingSlash(process.env.HERMES_API_BASE || '');
const defaultModel = process.env.HERMES_MODEL || 'smart-router';
const apiKeyRef = process.env.HERMES_API_KEY_REF || 'HERMES_API_KEY';

app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: upstreamBase && resolveSecret(apiKeyRef) ? 'healthy' : 'degraded',
    role,
    model: defaultModel,
    upstreamConfigured: Boolean(upstreamBase),
    apiKeyRef,
    timestamp: new Date().toISOString()
  });
});

app.get('/capabilities', (_req: Request, res: Response) => {
  res.json({
    role,
    model: defaultModel,
    supports: {
      chatCompletions: true,
      toolCalls: true,
      directToolExecution: false,
      proposalOnly: role === 'evolve'
    },
    boundaries: roleBoundaries(role)
  });
});

app.post('/run', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    if (!upstreamBase) {
      return res.status(500).json({ success: false, error: 'Hermes worker requires HERMES_API_BASE' });
    }

    const apiKey = resolveSecret(apiKeyRef);
    if (!apiKey) {
      return res.status(500).json({ success: false, error: `Hermes worker requires secret reference: ${apiKeyRef}` });
    }

    const body = normalizeRunBody(req.body, defaultModel);
    const response = await axios.post(
      `${upstreamBase}/chat/completions`,
      body,
      {
        timeout: Number(req.body?.timeoutMs || process.env.HERMES_WORKER_TIMEOUT_MS || 300000),
        headers: {
          authorization: apiKey,
          'content-type': 'application/json'
        }
      }
    );

    return res.json({
      success: true,
      role,
      latencyMs: Date.now() - startTime,
      data: response.data
    });
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status || 500 : 500;
    return res.status(status).json({
      success: false,
      role,
      latencyMs: Date.now() - startTime,
      error: toHermesWorkerError(error)
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Hermes worker started on 0.0.0.0:${port}`, {
    role,
    model: defaultModel,
    upstreamConfigured: Boolean(upstreamBase),
    apiKeyRef
  });
});

function normalizeRunBody(rawBody: unknown, fallbackModel: string): Record<string, unknown> {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    throw new Error('Hermes worker /run body must be a JSON object');
  }

  const body = rawBody as Record<string, unknown>;
  return {
    ...body,
    model: typeof body.model === 'string' && body.model.trim() ? body.model : fallbackModel
  };
}

function parseWorkerRole(value: string | undefined): HermesWorkerRole {
  if (value === 'diagnose' || value === 'remediate' || value === 'evolve') {
    return value;
  }
  return 'diagnose';
}

function roleBoundaries(workerRole: HermesWorkerRole): string[] {
  if (workerRole === 'diagnose') {
    return ['read-only diagnosis', 'evidence first', 'no direct production changes'];
  }
  if (workerRole === 'remediate') {
    return ['approval-first remediation', 'workflow orchestration', 'no approval bypass'];
  }
  return ['post-incident review', 'proposal generation', 'no direct production changes'];
}

function resolveSecret(envName: string): string | undefined {
  const direct = process.env[envName]?.trim();
  if (direct) {
    return direct;
  }

  const filePath = process.env[`${envName}_FILE`]?.trim();
  if (!filePath) {
    return undefined;
  }

  try {
    return fs.readFileSync(filePath, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function toHermesWorkerError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    const responseError = axiosError.response?.data?.error || axiosError.response?.data?.message;
    return responseError || axiosError.message;
  }

  return error instanceof Error ? error.message : String(error);
}
