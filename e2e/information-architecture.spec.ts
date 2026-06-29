import { expect, test, type Page } from '@playwright/test';

const username = process.env.E2E_USERNAME || 'admin';
const password = process.env.E2E_PASSWORD || 'Admin@123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe('information architecture', () => {
  test('guides operators from the dashboard into the standard case flow', async ({ page }) => {
    await login(page);

    await expect(page.locator('body')).toContainText(/从这里开始|Start Here/);
    await expect(page.locator('body')).toContainText(/全局运维态势|Global Ops Posture/);
    await expect(page.locator('body')).toContainText(/主机|Hosts/);
    await expect(page.locator('body')).toContainText(/Kubernetes/);
    await expect(page.locator('body')).toContainText(/网络设备|Network Devices/);
    await expect(page.locator('body')).toContainText(/闭环处理|Closed Loop/);
    await expect(page.getByRole('link', { name: /打开全屏大屏|Open Wallboard/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /查看关系图|Open Topology/ })).toBeVisible();
    await expect(page.locator('body')).toContainText(/标准处理路径|Standard Handling Flow/);
    await expect(page.locator('body')).toContainText(/我遇到告警或故障|I have an alert or incident/);
    await expect(page.locator('body')).toContainText(/我接手一个处理中事项|I am taking over an active Case/);
    await expect(page.locator('body')).toContainText(/我需要审批或执行修复|I need to approve or execute a repair/);
    await expect(page.locator('body')).toContainText(/待办|Todo|Evolution Todo/);

    await page.getByText(/我接手一个处理中事项|I am taking over an active Case/).click();
    await expect(page).toHaveURL(/\/operation-cases/);
  });

  test('keeps the primary operator pages aligned to the same closed-loop path', async ({ page }) => {
    await login(page);

    await page.goto('/diagnosis-center');
    await expect(page.locator('body')).toContainText(/诊断链路|Diagnosis Flow/);
    await expect(page.locator('body')).toContainText(/推荐路径|Recommended Path/);
    await expect(page.locator('body')).toContainText(/创建 Case 并诊断|Create Case & Diagnose/);
    await expect(page.locator('body')).toContainText(/带上下文诊断|Diagnose with Context/);

    await page.goto('/operation-cases');
    await expect(page.locator('body')).toContainText(/Case 闭环主线|Case Closure Flow/);
    await expect(page.locator('body')).toContainText(/Open Hermes|打开 Hermes|Continue Hermes diagnosis|继续诊断/);
    await expect(page.locator('body')).toContainText(/Open Execution Center|打开执行中心|Execution Center/);
    const hasCaseSnapshot = await page.getByText(/Case 快照|Case Snapshot/).count();
    if (hasCaseSnapshot > 0) {
      await expect(page.locator('body')).toContainText(/闭环证据|Closure Evidence/);
    } else {
      await expect(page.locator('body')).toContainText(/暂无 Case|No cases yet/);
    }

    await page.goto('/execution-center');
    await expect(page.locator('body')).toContainText(/执行链路|Execution Flow/);
    await expect(page.locator('body')).toContainText(/推荐动作|Recommended Action/);
    await expect(page.locator('body')).toContainText(/生产变更门禁|Production Change Gate/);

    await page.goto('/assets-center');
    await expect(page.locator('body')).toContainText(/资源操作焦点|Resource Operation Focus/);
    await expect(page.locator('body')).toContainText(/当前资源|Current Resource/);
    await expect(page.locator('body')).toContainText(/诊断资产|Diagnose Asset/);
    await expect(page.locator('body')).toContainText(/运维工作台使用路径|Ops Workspace Usage Flow/);

    await page.goto('/kubernetes-clusters');
    await expect(page.locator('body')).toContainText(/节点背后主机关联|Node Backing Host Binding/);
    await expect(page.locator('body')).toContainText(/绑定率|Binding Rate/);
    await expect(page.locator('body')).toContainText(/自动登记为待接入主机|registered as disabled backing hosts/);
    await expect(page.getByRole('button', { name: /Hermes 诊断|Hermes Diagnose/ }).first()).toBeVisible();

    await page.goto('/assets-center');
    const diagnoseAsset = page.getByRole('button', { name: /诊断资产|Diagnose Asset/ }).first();
    if (await diagnoseAsset.isEnabled()) {
      await diagnoseAsset.click();
      await expect(page).toHaveURL(/\/diagnosis-center\?.*assetId=/);
      await expect(page.locator('body')).toContainText(/上下文摘要|Context Summary/);

      await page.goto('/assets-center');
      const executeAsset = page.getByRole('button', { name: /执行修复|Execute Repair/ }).first();
      await executeAsset.click();
      await expect(page).toHaveURL(/\/execution-center\?.*assetId=/);
      await expect(page.locator('body')).toContainText(/诊断交接上下文|Diagnosis Handoff Context/);
    }
  });

  test('exposes consolidated primary entries instead of the legacy advanced menu', async ({ page }) => {
    await login(page);

    const resourcesEntry = page.getByRole('link', { name: /资源与连接|Resources & Connections/ }).first();
    const diagnosisEntry = page.getByRole('link', { name: /诊断中心|Diagnosis Center/ }).first();
    await expect(resourcesEntry).toBeVisible();
    await expect(diagnosisEntry).toBeVisible();
    expect((await resourcesEntry.boundingBox())?.y || 0).toBeLessThan((await diagnosisEntry.boundingBox())?.y || 0);
    await expect(page.getByRole('link', { name: /Hermes 控制台|Hermes Console/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /进化治理|Evolution Governance/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /平台运维|Platform Operations/ })).toBeVisible();
    await expect(page.getByText(/高级管理|Advanced/)).toHaveCount(0);

    for (const route of ['/hermes-console', '/evolution-governance', '/platform-operations']) {
      await page.goto(route);
      await expect(page.locator('body')).toContainText(/Hermes 控制台|Hermes Console|进化治理|Evolution Governance|平台运维|Platform Operations/);
      await expect(page.getByText(/Something went wrong|页面加载失败|Route .* not found/i)).toHaveCount(0);
    }
  });
});
