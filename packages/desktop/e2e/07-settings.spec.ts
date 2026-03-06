import { test, expect } from '@playwright/test';

test.describe('Settings Screen', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('renders settings screen', async ({ page }) => {
    await expect(page.getByText(/settings/i).first()).toBeVisible();
  });

  test('shows security section', async ({ page }) => {
    await expect(page.getByText(/security/i).first()).toBeVisible();
  });

  test('shows auto-lock option', async ({ page }) => {
    await expect(page.getByText(/auto.?lock/i)).toBeVisible();
  });

  test('shows Tor privacy routing toggle', async ({ page }) => {
    await expect(page.getByText(/Tor Privacy Routing/i)).toBeVisible();
  });

  test('shows network switcher', async ({ page }) => {
    await expect(
      page.getByText(/mainnet|sepolia|network/i).first()
    ).toBeVisible();
  });

  test('shows View Seed Phrase button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /view.*seed/i })
    ).toBeVisible();
  });

  test('View Seed — shows warning modal first', async ({ page }) => {
    await page.getByRole('button', { name: /view.*seed/i }).click();
    await expect(
      page.getByText(/warning|understand|never share|never screenshot|secret/i).first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('View Seed — shows passphrase prompt after confirming warning', async ({ page }) => {
    await page.getByRole('button', { name: /view.*seed/i }).click();
    // Button text is "I Understand — Show Seed"
    await page.getByRole('button', { name: /i.*understand|show.*seed/i }).click();
    await expect(
      page.getByPlaceholder(/passphrase|password/i).first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('View Seed — rejects wrong passphrase', async ({ page }) => {
    test.setTimeout(30000);
    await page.getByRole('button', { name: /view.*seed/i }).click();
    await page.getByRole('button', { name: /i.*understand|show.*seed/i }).click();
    await page.getByPlaceholder(/passphrase|password/i).first().fill('wrongpassphrase');
    // Button text is "Reveal Seed"
    await page.getByRole('button', { name: /reveal|verify|confirm/i }).first().click();
    await expect(
      page.getByText(/incorrect|wrong|invalid/i)
    ).toBeVisible({ timeout: 20000 });
  });

  test('shows Change Passphrase button', async ({ page }) => {
    // The button label text is just "Change" (in the SettingRow action)
    await expect(
      page.getByRole('button', { name: /^change$/i })
    ).toBeVisible();
  });

  test('Change Passphrase — modal opens', async ({ page }) => {
    await page.getByRole('button', { name: /^change$/i }).click();
    await expect(
      page.getByText(/current.*passphrase|new.*passphrase/i).first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('Change Passphrase — rejects mismatched passwords', async ({ page }) => {
    await page.getByRole('button', { name: /^change$/i }).click();
    const inputs = page.getByPlaceholder(/passphrase|password|min.*8/i);
    await inputs.nth(0).fill('currentpassword');
    await inputs.nth(1).fill('newpassword123');
    await inputs.nth(2).fill('differentpassword'); // mismatch
    // Button text is "Update Passphrase"
    await page.getByRole('button', { name: /update|confirm|save/i }).first().click();
    await expect(
      page.getByText(/match|do not match|mismatch|same/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows Export Backup button', async ({ page }) => {
    // Button text is just "Export"
    await expect(
      page.getByRole('button', { name: /^export$/i }).first()
    ).toBeVisible();
  });

  test('shows About / Version section', async ({ page }) => {
    await expect(
      page.getByText(/about|version|v0\./i).first()
    ).toBeVisible();
  });
});
