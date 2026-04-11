const { test, expect } = require('@playwright/test');

const E2E_EMAIL = process.env.PLAYWRIGHT_EMAIL;
const E2E_PASSWORD = process.env.PLAYWRIGHT_PASSWORD;
const API_BASE = process.env.PLAYWRIGHT_API_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

async function loginByApi(page) {
  const loginRes = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });

  expect(loginRes.ok()).toBeTruthy();
  const body = await loginRes.json();
  const token = body?.accessToken;
  expect(token).toBeTruthy();

  await page.addInitScript((authToken) => {
    localStorage.setItem('auth_token', authToken);
  }, token);
}

test.describe('Field Visit lifecycle smoke', () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run lifecycle e2e');

  test('open field visits and exercise planning/reporting entry points', async ({ page }) => {
    await loginByApi(page);

    await page.goto('/crm/visits');
    await expect(page.getByText('Field Visit Trips')).toBeVisible();

    const planNewTripBtn = page.getByRole('button', { name: /Plan New Trip/i });
    await expect(planNewTripBtn).toBeVisible();
    await planNewTripBtn.click();

    await expect(page).toHaveURL(/\/crm\/visits\/new/);

    const titleInput = page.locator('input').first();
    await titleInput.fill(`PW E2E Trip ${Date.now()}`);

    const backToList = page.getByRole('button').first();
    await backToList.click();
    await page.goto('/crm/visits');

    await expect(page.getByText(/Field Visit Trips/i)).toBeVisible();

    const detailsButtons = page.getByRole('button', { name: /Details/i });
    const detailsCount = await detailsButtons.count();
    if (detailsCount > 0) {
      await detailsButtons.first().click();
      await expect(page).toHaveURL(/\/crm\/visits\/\d+/);

      const travelReportBtn = page.getByRole('button', { name: /Travel Report/i });
      if (await travelReportBtn.count()) {
        await travelReportBtn.first().click();
        await expect(page).toHaveURL(/\/travel-report/);
      }
    }
  });
});
