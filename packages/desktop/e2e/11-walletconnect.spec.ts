import { test, expect } from '@playwright/test';

test.describe('WalletConnect', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test('WalletConnect screen loads', async ({ page }) => {
    await page.goto('/walletconnect');
    await expect(
      page.getByText(/wallet.*connect|connect.*dapp|connect.*wallet/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows URI input for connecting', async ({ page }) => {
    await page.goto('/walletconnect');
    // Input has placeholder "Paste WalletConnect URI (wc:...)"
    await expect(
      page.getByRole('textbox', { name: /walletconnect/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('back button returns to dashboard', async ({ page }) => {
    await page.goto('/walletconnect');
    // Back button has no aria-label — use locator for first button
    await page.locator('button').first().click();
    await expect(page).toHaveURL(/dashboard/);
  });
});
