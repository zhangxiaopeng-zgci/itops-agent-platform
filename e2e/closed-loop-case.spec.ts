import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const apiBase = (process.env.E2E_API_BASE || 'http://10.1.132.58:3001').replace(/\/$/, '');
const username = process.env.E2E_USERNAME || 'admin';
const password = process.env.E2E_PASSWORD || 'Admin@123';

async function loginViaApi(): Promise<string> {
  const api = await request.newContext({ baseURL: apiBase });
  const response = await api.post('/api/auth/login', {
    data: { username, password }
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  await api.dispose();
  return body.data.token;
}

async function newAuthedApi(): Promise<APIRequestContext> {
  const token = await loginViaApi();
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
}

test.describe('closed-loop Case evidence', () => {
  test('auto-created Hermes Case exposes downstream approval and task refs', async ({ page }) => {
    const api = await newAuthedApi();
    const suffix = Date.now();
    const correlationId = `e2e-closure-${suffix}`;
    const taskId = `task-${suffix}`;

    const launchOptionsResponse = await api.get('/api/hermes-sessions/launch-options');
    expect(launchOptionsResponse.ok()).toBeTruthy();
    const launchOptionsBody = await launchOptionsResponse.json();
    const diagnoseOption = launchOptionsBody.data.options.find((option: { mode: string }) => option.mode === 'diagnose');
    expect(diagnoseOption?.policy?.canLaunch).toBeTruthy();

    const launchResponse = await api.post('/api/hermes-sessions/launch', {
      data: {
        mode: 'diagnose',
        channelId: diagnoseOption.channel.id,
        correlationId,
        contextType: 'server',
        assetId: `e2e-host-${suffix}`,
        assetType: 'server',
        assetName: `e2e-host-${suffix}`,
        serverId: `e2e-host-${suffix}`,
        serverIds: [`e2e-host-${suffix}`],
        prompt: 'E2E closed-loop evidence launch'
      }
    });
    expect(launchResponse.ok()).toBeTruthy();
    const launchBody = await launchResponse.json();
    const caseId = launchBody.data.createdCaseId;
    expect(caseId).toBeTruthy();

    const approvalResponse = await api.post('/api/tools/run_workflow/invoke', {
      data: {
        input: { workflowId: 'e2e-closure-placeholder-workflow' },
        correlationId
      }
    });
    expect(approvalResponse.status()).toBe(202);
    const approvalBody = await approvalResponse.json();
    const approvalId = approvalBody.approvalId;
    expect(approvalId).toBeTruthy();

    const refsEventResponse = await api.post(`/api/operation-cases/${caseId}/events`, {
      data: {
        eventType: 'hermes_downstream_refs_detected',
        sourceType: 'hermes_session',
        sourceId: `e2e-hermes-session-${suffix}`,
        correlationId,
        payload: {
          mode: 'diagnose',
          status: 'success',
          extractedRefs: {
            approvalIds: [approvalId],
            taskIds: [taskId],
            correlationIds: [correlationId]
          },
          suggestedNextAction: 'review_pending_or_completed_approval'
        }
      }
    });
    expect(refsEventResponse.ok()).toBeTruthy();

    const caseDetailResponse = await api.get(`/api/operation-cases/${caseId}`);
    expect(caseDetailResponse.ok()).toBeTruthy();
    const caseDetailBody = await caseDetailResponse.json();
    expect(caseDetailBody.data.events.some((event: { event_type: string }) => event.event_type === 'hermes_downstream_refs_detected')).toBeTruthy();
    expect(caseDetailBody.data.pipeline.map((step: { key: string }) => step.key)).toEqual([
      'detect',
      'diagnose',
      'approval',
      'execute',
      'verify',
      'review'
    ]);
    expect(caseDetailBody.data.pipeline.find((step: { key: string }) => step.key === 'approval')?.outputs.total).toBeGreaterThan(0);
    await api.dispose();

    await loginInBrowser(page);
    await page.goto(`/operation-cases?caseId=${encodeURIComponent(caseId)}`);
    await expect(page.locator('body')).toContainText(/Hermes 识别到下游线索|Hermes downstream refs detected/);
    const approvalJump = page.getByRole('button', { name: new RegExp(`approval.*${approvalId.slice(-4)}`) }).first();
    await expect(approvalJump).toBeVisible();
    await expect(page.getByRole('button', { name: /task .*|task-/ }).first()).toBeVisible();

    await approvalJump.click();
    await expect(page).toHaveURL(/\/tool-approvals\?approvalId=/);
    await expect(page.locator('body')).toContainText(/run_workflow|Approval|审批/);
  });
});
