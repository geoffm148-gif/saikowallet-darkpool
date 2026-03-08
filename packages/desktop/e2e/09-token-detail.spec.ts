import { test, expect } from '@playwright/test';

const SAIKO_ADDRESS = '0x4c89364F18Ecc562165820989549022e64eC2eD2';

test.describe('Token Detail Screen', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test('SAIKO token detail page loads', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await expect(page.getByText('SAIKO').first()).toBeVisible({ timeout: 10000 });
  });

  test('ETH token detail page loads', async ({ page }) => {
    await page.goto('/token/eth');
    await expect(page.getByText(/ETH|Ethereum/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('token detail shows Send button', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible({ timeout: 5000 });
  });

  test('token detail shows Receive button', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await expect(page.getByRole('button', { name: /receive/i })).toBeVisible({ timeout: 5000 });
  });

  test('token detail shows Etherscan link', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await expect(
      page.getByRole('link', { name: /etherscan|explorer|contract/i })
        .or(page.getByText(/etherscan/i))
        .first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('token detail Send button navigates to send screen', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await page.getByRole('button', { name: /send/i }).click();
    await expect(page).toHaveURL(/send/);
  });

  test('back button returns to dashboard', async ({ page }) => {
    await page.goto(`/token/${SAIKO_ADDRESS}`);
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/dashboard/);
  });
});
