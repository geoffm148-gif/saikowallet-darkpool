import { test, expect } from '@playwright/test';

test.describe('DarkPool', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test('DarkPool overview screen loads', async ({ page }) => {
    await page.goto('/darkpool');
    await expect(page.getByText(/dark.?pool|privacy/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('shows deposit button', async ({ page }) => {
    await page.goto('/darkpool');
    await expect(page.getByRole('button', { name: /deposit/i }).first()).toBeVisible();
  });

  test('shows withdraw button', async ({ page }) => {
    await page.goto('/darkpool');
    await expect(page.getByRole('button', { name: /withdraw/i }).first()).toBeVisible();
  });

  test('Deposit button navigates to deposit screen', async ({ page }) => {
    await page.goto('/darkpool');
    await page.getByRole('button', { name: /deposit/i }).first().click();
    await expect(page).toHaveURL(/deposit/);
  });

  test('Withdraw button navigates to withdraw screen', async ({ page }) => {
    await page.goto('/darkpool');
    await page.getByRole('button', { name: /withdraw/i }).first().click();
    await expect(page).toHaveURL(/withdraw/);
  });

  test('Deposit screen shows amount tiers', async ({ page }) => {
    await page.goto('/darkpool/deposit');
    await expect(
      page.getByText(/0\.1|1 ETH|10 ETH|tier|amount/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Deposit screen shows SAIKO staking rewards info', async ({ page }) => {
    await page.goto('/darkpool/deposit');
    await expect(
      page.getByText(/SAIKO|staking|reward|earn/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('Withdraw screen renders', async ({ page }) => {
    await page.goto('/darkpool/withdraw');
    await expect(page.getByText(/withdraw|note|proof/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('back button on deposit returns to darkpool', async ({ page }) => {
    await page.goto('/darkpool/deposit');
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/darkpool(?!.*deposit)/);
  });

  test('back button on withdraw returns to darkpool', async ({ page }) => {
    await page.goto('/darkpool/withdraw');
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/darkpool(?!.*withdraw)/);
  });
});
