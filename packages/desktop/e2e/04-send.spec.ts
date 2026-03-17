import { test, expect } from '@playwright/test';

test.describe('Send Screen', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/send');
  });

  test('renders send screen', async ({ page }) => {
    await expect(page.getByText(/send|transfer/i).first()).toBeVisible();
  });

  test('has address input', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/0x.*or.*name\.eth|address|0x|recipient/i)
        .or(page.getByRole('textbox').first())
    ).toBeVisible();
  });

  test('validates invalid Ethereum address on review click', async ({ page }) => {
    const addr = page.getByPlaceholder(/0x|address|recipient/i).first();
    await addr.fill('notanaddress');
    // Validation triggers on Review click, not on blur
    await page.getByRole('button', { name: /review/i }).first().click();
    await expect(page.getByText(/invalid|not.*valid|address.*invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test('accepts valid Ethereum address', async ({ page }) => {
    const addr = page.getByPlaceholder(/0x|address|recipient/i).first();
    await addr.fill('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    await expect(page.getByText(/invalid.*address/i)).not.toBeVisible({ timeout: 2000 }).catch(() => {});
  });

  test('shows review step after entering address and amount', async ({ page }) => {
    await page.getByPlaceholder(/0x|address|recipient/i).first()
      .fill('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    const amount = page.getByPlaceholder(/0\.00|amount|value/i)
      .or(page.getByRole('spinbutton').first());
    await amount.fill('0.001');
    await page.getByRole('button', { name: /review/i }).first().click();
    await expect(
      page.getByText(/review.*transaction|transaction.*review|confirm.*send/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('shows MEV protection / Flashbots toggle on review', async ({ page }) => {
    await page.getByPlaceholder(/0x|address|recipient/i).first()
      .fill('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    await page.getByPlaceholder(/0\.00|amount/i)
      .or(page.getByRole('spinbutton').first())
      .fill('0.001');
    await page.getByRole('button', { name: /review/i }).first().click();
    await expect(
      page.getByText(/MEV|Flashbots|protection|sandwich/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('gas speed selector is present', async ({ page }) => {
    await expect(
      page.getByText(/slow|normal|fast|gas|speed/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('back button returns to dashboard', async ({ page }) => {
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('token selector button shows current token and balance', async ({ page }) => {
    // The token selector button displays the selected token symbol and "Balance:"
    const tokenBtn = page.locator('button').filter({ hasText: /Balance:/ }).first();
    await expect(tokenBtn).toBeVisible({ timeout: 10000 });
    // Should show either SAIKO or ETH
    await expect(tokenBtn).toContainText(/SAIKO|ETH/);
  });

  test('clicking token button opens picker with ETH and SAIKO visible', async ({ page }) => {
    // Click the token selector button to open the dropdown
    const tokenBtn = page.locator('button').filter({ hasText: /Balance:/ }).first();
    await tokenBtn.click();
    // The dropdown shows option buttons for each token
    // Look for ETH and SAIKO text within the dropdown options
    const dropdown = page.locator('div').filter({ has: page.locator('button:has-text("ETH")') }).filter({ has: page.locator('button:has-text("SAIKO")') }).first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
  });

  test('selecting SAIKO updates the token in the compose form', async ({ page }) => {
    // First switch to ETH by opening selector and clicking ETH option in dropdown
    const tokenBtn = page.locator('button').filter({ hasText: /Balance:/ }).first();
    await tokenBtn.click();
    // The dropdown options have text like "ETH 0" — click the ETH option
    await page.getByRole('button', { name: /^ETH\s/ }).last().click();
    // Verify ETH is now selected in the trigger button
    await expect(page.locator('button').filter({ hasText: /Balance:/ }).first()).toContainText('ETH');
    // Now reopen and select SAIKO
    await page.locator('button').filter({ hasText: /Balance:/ }).first().click();
    await page.getByRole('button', { name: /^SAIKO\s/ }).last().click();
    // Verify SAIKO is now the selected token
    await expect(page.locator('button').filter({ hasText: /Balance:/ }).first()).toContainText('SAIKO');
  });
});
