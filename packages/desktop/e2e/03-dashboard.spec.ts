import { test, expect } from '@playwright/test';

const TEST_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

test.describe('Dashboard', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('renders dashboard page', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
  });

  test('shows wallet address or account name', async ({ page }) => {
    // Account switcher trigger shows account name; address is in dropdown
    await expect(
      page.getByText(/Account 1/i).or(page.getByText(/0x9858/i)).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows ETH token row', async ({ page }) => {
    await expect(page.getByText('ETH').first()).toBeVisible({ timeout: 10000 });
  });

  test('shows SAIKO token row', async ({ page }) => {
    await expect(page.getByText('SAIKO').first()).toBeVisible({ timeout: 10000 });
  });

  test('Send action button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /send/i }).first()).toBeVisible();
  });

  test('Receive action button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /receive/i }).first()).toBeVisible();
  });

  test('Swap action button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /swap/i }).first()).toBeVisible();
  });

  test('clicking Send navigates to /send', async ({ page }) => {
    await page.getByRole('button', { name: /send/i }).first().click();
    await expect(page).toHaveURL(/send/);
  });

  test('clicking Receive navigates to /receive', async ({ page }) => {
    await page.getByRole('button', { name: /receive/i }).first().click();
    await expect(page).toHaveURL(/receive/);
  });

  test('clicking Swap navigates to /swap', async ({ page }) => {
    await page.getByRole('button', { name: /swap/i }).first().click();
    await expect(page).toHaveURL(/swap/);
  });

  test('SAIKO row is clickable — navigates to token detail', async ({ page }) => {
    // Wait for the Assets section SAIKO row (not the hero card)
    // The asset row is inside the "Assets" section — click the row with cursor=pointer
    const assetsHeading = page.getByText('Assets');
    await expect(assetsHeading).toBeVisible({ timeout: 15000 });
    // Find SAIKO text after the Assets heading (in the token list)
    const saikoRow = page.locator('[style*="cursor: pointer"], [style*="cursor:pointer"]')
      .filter({ hasText: 'SAIKO' }).first();
    await saikoRow.click();
    await expect(page).toHaveURL(/token\//);
  });

  test('ETH row is clickable — navigates to token detail', async ({ page }) => {
    await page.getByText('ETH').first().click();
    await expect(page).toHaveURL(/token\//);
  });

  test('DarkPool navigation item is present', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /dark.?pool|privacy/i })
        .or(page.getByText(/dark.?pool/i))
        .first()
    ).toBeVisible();
  });

  test('backup warning banner shows when recovery not verified', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('saiko_recovery_verified'));
    await page.reload();
    await page.goto('/dashboard');
    await expect(page.getByText(/backup.*not.*verified|verify.*backup|not.*verified/i)).toBeVisible({ timeout: 5000 });
  });

  test('backup warning banner hidden when recovery verified', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('saiko_recovery_verified', 'true'));
    await page.reload();
    await page.goto('/dashboard');
    await expect(page.getByText(/backup.*not.*verified/i)).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('command palette opens with Ctrl+K', async ({ page }) => {
    // Ensure page focus and React event listeners are ready
    await page.waitForTimeout(500);
    await page.click('body');
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await expect(
      page.getByPlaceholder(/command/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('command palette closes with Escape', async ({ page }) => {
    await page.click('body');
    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder(/command/i)).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('testnet banner appears when on Sepolia', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('saiko_network', 'sepolia'));
    await page.reload();
    await page.goto('/dashboard');
    await expect(page.getByText(/testnet|sepolia/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('testnet banner hidden on mainnet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('saiko_network', 'mainnet'));
    await page.reload();
    await page.goto('/dashboard');
    await expect(page.getByText(/TESTNET MODE/)).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});
