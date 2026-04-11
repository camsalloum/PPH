const { test, expect } = require('@playwright/test');

test('home page loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/127\.0\.0\.1|localhost/);
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveTitle(/.+/);
});
