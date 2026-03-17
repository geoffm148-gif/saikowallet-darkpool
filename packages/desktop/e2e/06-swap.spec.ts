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

  test('token picker shows "Your Tokens" section with ETH and SAIKO', async ({ page }) => {
    // Click the output token selector (SAIKO) — this excludes the input token (ETH)
    // from "Your Tokens" but shows SAIKO; then check input picker shows ETH
    const outputSelector = page.getByRole('button', { name: /select.*token.*SAIKO|currently SAIKO/i }).first();
    await outputSelector.click();
    // The modal should show a "Your Tokens" section with SAIKO
    await expect(page.getByText(/Your Tokens/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('SAIKO').first()).toBeVisible({ timeout: 5000 });
    // Close modal
    await page.getByRole('button', { name: /close/i }).click();
    // Now open input selector — excludes SAIKO, shows ETH in "Your Tokens"
    const inputSelector = page.getByRole('button', { name: /select.*token.*ETH|currently ETH/i }).first();
    await inputSelector.click();
    await expect(page.getByText(/Your Tokens/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ETH').first()).toBeVisible({ timeout: 5000 });
  });
});
