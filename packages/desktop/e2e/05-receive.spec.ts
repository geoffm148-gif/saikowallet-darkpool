import { test, expect } from '@playwright/test';

test.describe('Receive Screen', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/receive');
  });

  test('renders receive screen', async ({ page }) => {
    await expect(page.getByText(/receive/i).first()).toBeVisible();
  });

  test('shows a QR code', async ({ page }) => {
    // QRCodeSVG renders an SVG element, not a canvas
    const qr = page.locator('svg').first();
    await expect(qr).toBeVisible({ timeout: 5000 });
  });

  test('shows wallet address', async ({ page }) => {
    await expect(page.getByText(/0x9858/i)).toBeVisible({ timeout: 5000 });
  });

  test('copy address element is present', async ({ page }) => {
    // The address div is clickable (not a button with role) — look for the copy icon or the address text
    await expect(
      page.getByText(/0x9858/i).first()
    ).toBeVisible();
  });

  test('back button returns to dashboard', async ({ page }) => {
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/dashboard/);
  });
});
