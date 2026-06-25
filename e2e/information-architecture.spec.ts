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
    await expect(page.locator('body')).toContainText(/标准处理路径|Standard Handling Flow/);
    await expect(page.locator('body')).toContainText(/我遇到告警或故障|I have an alert or incident/);
    await expect(page.locator('body')).toContainText(/我接手一个处理中事项|I am taking over an active Case/);
    await expect(page.locator('body')).toContainText(/审批与执行|Approve & Execute/);
    await expect(page.locator('body')).toContainText(/复盘进化|Review & Evolve/);

    await page.getByText(/我接手一个处理中事项|I am taking over an active Case/).click();
    await expect(page).toHaveURL(/\/operation-cases/);
  });

  test('exposes consolidated primary entries instead of the legacy advanced menu', async ({ page }) => {
    await login(page);

    await expect(page.getByText(/Hermes 控制台|Hermes Console/)).toBeVisible();
    await expect(page.getByText(/进化治理|Evolution Governance/)).toBeVisible();
    await expect(page.getByText(/平台运维|Platform Operations/)).toBeVisible();
    await expect(page.getByText(/高级管理|Advanced/)).toHaveCount(0);

    for (const route of ['/hermes-console', '/evolution-governance', '/platform-operations']) {
      await page.goto(route);
      await expect(page.locator('body')).toContainText(/Hermes 控制台|Hermes Console|进化治理|Evolution Governance|平台运维|Platform Operations/);
      await expect(page.getByText(/Something went wrong|页面加载失败|Route .* not found/i)).toHaveCount(0);
    }
  });
});
