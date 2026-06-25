import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const apiBase = (process.env.E2E_API_BASE || 'http://10.1.132.58:3001').replace(/\/$/, '');
const kiteBase = (process.env.E2E_KITE_BASE || 'http://10.1.132.58:3002').replace(/\/$/, '');
const username = process.env.E2E_USERNAME || 'admin';
const password = process.env.E2E_PASSWORD || 'Admin@123';

interface LoginResult {
  token: string;
}

async function loginViaApi(): Promise<LoginResult> {
  const api = await request.newContext({ baseURL: apiBase });
  const response = await api.post('/api/auth/login', {
    data: { username, password }
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await api.dispose();
  return { token: body.data.token };
}

async function newAuthedApi(): Promise<APIRequestContext> {
  const { token } = await loginViaApi();
  return request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: {
      authorization: `Bearer ${token}`
    }
  });
}

async function loginAs(usernameInput: string, passwordInput: string): Promise<string> {
  const api = await request.newContext({ baseURL: apiBase });
  const response = await api.post('/api/auth/login', {
    data: { username: usernameInput, password: passwordInput }
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await api.dispose();
  return body.data.token;
}

async function newApiWithToken(token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: apiBase,
    extraHTTPHeaders: {
      authorization: `Bearer ${token}`
    }
  });
}

async function loginInBrowser(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByText('AIOps Agent').first()).toBeVisible();
}

test.describe('AIOps Agent pilot acceptance smoke', () => {
  test('logs in and opens the primary operator routes', async ({ page }) => {
    await loginInBrowser(page);

    for (const route of [
      '/dashboard',
      '/diagnosis-center',
      '/operation-cases',
      '/execution-center',
      '/assets-center',
      '/hermes-channels',
      '/hermes-dashboard',
      '/workflows',
      '/tool-approvals',
      '/tasks'
    ]) {
      await page.goto(route);
      await expect(page.locator('body')).toContainText(/AIOps Agent|Hermes|工作流|审批|任务|Dashboard|Agent/i);
      await expect(page.getByText(/Something went wrong|页面加载失败|Route .* not found/i)).toHaveCount(0);
    }
  });

  test('shows three Hermes channels and three dashboard lanes', async ({ page }) => {
    const api = await newAuthedApi();
    const response = await api.get('/api/hermes-channels');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.data).toHaveLength(3);
    expect(body.data.map((channel: { type: string }) => channel.type).sort()).toEqual(['diagnose', 'remediate', 'review']);
    await api.dispose();

    await loginInBrowser(page);

    await page.goto('/hermes-channels?channelId=hermes-channel-diagnose&focus=bundle');
    await expect(page.getByRole('heading', { name: 'Hermes 诊断通道' })).toBeVisible();
    await expect(page.locator('body')).toContainText(/Effective Capability Bundle|Capability Bundle|能力/);

    await page.goto('/hermes-dashboard');
    await expect(page.getByText(/诊断|diagnose/i).first()).toBeVisible();
    await expect(page.getByText(/修复|remediate/i).first()).toBeVisible();
    await expect(page.getByText(/复盘|evolve|review/i).first()).toBeVisible();
  });

  test('builds Hermes workflow preflight without configured-MCP false warnings', async () => {
    const api = await newAuthedApi();
    const workflowsResponse = await api.get('/api/workflows');
    expect(workflowsResponse.ok()).toBeTruthy();
    const workflowsBody = await workflowsResponse.json();
    const workflow = workflowsBody.data.find((item: { id: string; name: string }) => item.name === 'Hermes 告警诊断与修复闭环');
    expect(workflow).toBeTruthy();

    const preflightResponse = await api.get(`/api/workflows/${workflow.id}/execution-preflight`);
    expect(preflightResponse.ok()).toBeTruthy();
    const preflightBody = await preflightResponse.json();
    expect(preflightBody.data.schemaVersion).toBe('workflow.executionPreflight.v1');
    expect(preflightBody.data.reasons).not.toContain('mcp_server_unhealthy');
    expect(preflightBody.data.actions).not.toContain('check_mcp_server_health');
    expect(preflightBody.data.capabilitySummary.channelBundles.count).toBeGreaterThan(0);
    await api.dispose();
  });

  test('opens Kite without exposing the initial setup or login flow', async ({ page }) => {
    const kite = await request.newContext({ baseURL: kiteBase });
    const response = await kite.get('/api/v1/bootstrap');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.setup?.initialized).toBe(true);
    expect(body.setup?.step).toBe(2);
    await kite.dispose();

    const api = await newAuthedApi();
    const bridgeResponse = await api.get('/api/kite-bridge/status');
    expect(bridgeResponse.ok()).toBeTruthy();
    const bridgeBody = await bridgeResponse.json();
    expect(bridgeBody.data.clusters.registered).toBeGreaterThan(0);
    expect(bridgeBody.data.kite.initialized).toBe(true);
    expect(typeof bridgeBody.data.kite.loginRequired).toBe('boolean');

    const sessionResponse = await api.post('/api/kite-bridge/session');
    expect(sessionResponse.ok()).toBeTruthy();
    expect(sessionResponse.headers()['set-cookie']).toContain('auth_token=');

    const authedKiteResponse = await api.get(`${kiteBase}/api/v1/bootstrap`);
    expect(authedKiteResponse.ok()).toBeTruthy();
    const authedKiteBody = await authedKiteResponse.json();
    expect(authedKiteBody.user?.username).toBe('admin');
    await api.dispose();

    await loginInBrowser(page);
    await page.goto('/kubernetes-console');
    const kiteFrame = page.frameLocator('iframe[title="Kite Kubernetes Console"]');
    await expect(kiteFrame.locator('body')).toContainText(/Overview|Pods|Workloads|概览|工作负载/i, { timeout: 20_000 });
    await expect(kiteFrame.locator('body')).not.toContainText(/Sign In|Enter your username|登录/i);

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /新窗口打开 Kite|Open Kite/i }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/:3002\//, { timeout: 20_000 });
    await expect(popup.locator('body')).toContainText(/Overview|Pods|Workloads|概览|工作负载/i, { timeout: 20_000 });
    await expect(popup.locator('body')).not.toContainText(/Sign In|Enter your username|登录/i);
    await popup.close();
  });

  test('opens a pending tool approval deep link generated through the Tool API', async ({ page }) => {
    const api = await newAuthedApi();
    const response = await api.post('/api/tools/run_workflow/invoke', {
      data: {
        input: { workflowId: 'e2e-approval-placeholder-workflow' },
        correlationId: `e2e-approval-${Date.now()}`
      }
    });
    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.approvalId).toBeTruthy();

    await loginInBrowser(page);
    await page.goto(`/tool-approvals?approvalId=${encodeURIComponent(body.approvalId)}`);
    await expect(page.getByRole('heading', { name: 'run_workflow' })).toBeVisible();
    await expect(page.getByText(/审批|Approval|approve/i).first()).toBeVisible();
    await api.dispose();
  });

  test('opens an existing task detail view when task evidence is available', async ({ page }) => {
    const api = await newAuthedApi();
    const response = await api.get('/api/tasks');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const tasks = Array.isArray(body.data?.tasks) ? body.data.tasks : Array.isArray(body.data) ? body.data : [];
    test.skip(tasks.length === 0, 'No task evidence exists in this environment yet.');
    const task = tasks[0] as { id: string; name?: string };

    await loginInBrowser(page);
    await page.goto(`/tasks?taskId=${encodeURIComponent(task.id)}`);
    await expect(page.locator('body')).toContainText(/Task Runs|任务/);
    await expect(page.locator('body')).toContainText(/Workflow:|工作流/);
    await api.dispose();
  });

  test('enforces pilot RBAC for viewer, operator, and admin boundaries', async () => {
    const adminApi = await newAuthedApi();
    const suffix = Date.now();
    const passwordForTempUsers = 'PilotRbac@1234';
    const viewerUsername = `e2e_viewer_${suffix}`;
    const operatorUsername = `e2e_operator_${suffix}`;
    const createdUserIds: string[] = [];

    try {
      for (const user of [
        { username: viewerUsername, role: 'viewer' },
        { username: operatorUsername, role: 'operator' }
      ]) {
        const createResponse = await adminApi.post('/api/users', {
          data: {
            username: user.username,
            password: passwordForTempUsers,
            email: `${user.username}@example.test`,
            role: user.role
          }
        });
        expect(createResponse.ok()).toBeTruthy();
        const createBody = await createResponse.json();
        createdUserIds.push(String(createBody.data.id));
      }

      const viewerApi = await newApiWithToken(await loginAs(viewerUsername, passwordForTempUsers));
      const operatorApi = await newApiWithToken(await loginAs(operatorUsername, passwordForTempUsers));

      const channelsForViewer = await viewerApi.get('/api/hermes-channels');
      expect(channelsForViewer.ok()).toBeTruthy();

      const workflowsResponse = await adminApi.get('/api/workflows');
      expect(workflowsResponse.ok()).toBeTruthy();
      const workflowsBody = await workflowsResponse.json();
      const workflow = workflowsBody.data.find((item: { id: string; name: string }) => item.name === 'Hermes 巡检复盘与优化建议');
      expect(workflow).toBeTruthy();

      const viewerTaskCreate = await viewerApi.post('/api/tasks', {
        data: {
          workflow_id: workflow.id,
          name: 'E2E viewer should not start task',
          input: 'viewer denied'
        }
      });
      expect(viewerTaskCreate.status()).toBe(403);

      const viewerWorkflowTool = await viewerApi.post('/api/tools/run_workflow/invoke', {
        data: {
          input: { workflowId: workflow.id },
          correlationId: `e2e-rbac-viewer-${suffix}`
        }
      });
      expect(viewerWorkflowTool.status()).toBe(403);

      const operatorWorkflowTool = await operatorApi.post('/api/tools/run_workflow/invoke', {
        data: {
          input: { workflowId: workflow.id },
          correlationId: `e2e-rbac-operator-${suffix}`
        }
      });
      expect(operatorWorkflowTool.status()).toBe(202);
      const operatorApprovalBody = await operatorWorkflowTool.json();
      expect(operatorApprovalBody.approvalId).toBeTruthy();

      const operatorApprove = await operatorApi.post(`/api/tool-approvals/${operatorApprovalBody.approvalId}/approve`, {
        data: { comment: 'operator must not approve in pilot RBAC' }
      });
      expect(operatorApprove.status()).toBe(403);

      await viewerApi.dispose();
      await operatorApi.dispose();
    } finally {
      for (const userId of createdUserIds.reverse()) {
        await adminApi.delete(`/api/users/${userId}`).catch(() => undefined);
      }
      await adminApi.dispose();
    }
  });
});
