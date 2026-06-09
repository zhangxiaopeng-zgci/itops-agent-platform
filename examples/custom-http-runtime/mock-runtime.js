#!/usr/bin/env node

const http = require('http');

const port = Number(process.env.PORT || 9001);

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { success: true, status: 'ok' });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/run') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  try {
    const payload = await readJson(req);
    const input = payload.input || '';
    const agentName = payload.agent_name || 'custom-http-agent';

    sendJson(res, 200, {
      status: 'success',
      output: `# Mock Runtime Result\n\nAgent: ${agentName}\n\nInput: ${input}\n\nThis response came from the custom HTTP mock runtime.`,
      trace: [
        {
          type: 'received',
          content: 'Mock runtime received the request.',
          timestamp: new Date().toISOString(),
          metadata: {
            task_id: payload.task_id || null,
            node_id: payload.node_id || null,
            allowed_tools: payload.allowed_tools || []
          }
        }
      ],
      metadata: {
        mock: true,
        runtime: 'custom_http'
      }
    });
  } catch (error) {
    sendJson(res, 400, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Mock custom HTTP runtime listening on http://0.0.0.0:${port}/run`);
});
