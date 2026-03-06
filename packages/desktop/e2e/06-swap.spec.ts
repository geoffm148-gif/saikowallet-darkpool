import { test, expect } from '@playwright/test';

test.describe('Swap Screen', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/swap');
  });

  test('renders swap screen', async ({ page }) => {
    await expect(page.getByText(/swap/i).first()).toBeVisible();
  });

  test('shows from and to sections', async ({ page }) => {
    await expect(page.getByText(/from|you.*pay|sell/i).first()).toBeVisible();
    await expect(page.getByText(/to|you.*receive|buy/i).first()).toBeVisible();
  });

  test('shows slippage tolerance setting', async ({ page }) => {
    await expect(page.getByText(/slippage/i)).toBeVisible();
  });

  test('shows token selector for source token', async ({ page }) => {
    // There should be at least one clickable token selector
    const selector = page.getByRole('button', { name: /ETH|SAIKO|select.*token/i }).first();
    await expect(selector).toBeVisible({ timeout: 5000 });
  });

  test('swap direction toggle button exists', async ({ page }) => {
    // Arrow/swap direction button between from and to
    await expect(
      page.getByRole('button', { name: /flip|switch|↕|⇅|reverse/i })
        .or(page.locator('[aria-label*="flip"], [aria-label*="switch"]'))
        .first()
    ).toBeVisible();
  });

  test('back button returns to dashboard', async ({ page }) => {
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/dashboard/);
  });
});
