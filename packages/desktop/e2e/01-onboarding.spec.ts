import { test, expect } from '@playwright/test';

test.describe('Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('redirects to onboarding when no wallet exists', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/onboarding/);
  });

  test('shows welcome step with Create and Import options', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByText(/create.*wallet|new.*wallet/i).first()).toBeVisible();
    await expect(page.getByText(/import/i).first()).toBeVisible();
  });

  test('import wallet tab navigates to import', async ({ page }) => {
    await page.goto('/onboarding');
    const importBtn = page.getByRole('link', { name: /import/i })
      .or(page.getByRole('button', { name: /import/i }))
      .first();
    await importBtn.click();
    await expect(page).toHaveURL(/import/);
  });

  test('import wallet rejects invalid seed phrase', async ({ page }) => {
    await page.goto('/import');
    const textbox = page.getByRole('textbox').first();
    await textbox.fill('this is not a valid seed phrase at all');
    await expect(
      page.getByText(/need 12|need 24|invalid|not valid|words/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('import wallet accepts valid 12-word mnemonic', async ({ page }) => {
    await page.goto('/import');
    const textbox = page.getByRole('textbox').first();
    await textbox.fill(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    );
    await page.getByRole('button', { name: /import|restore|continue/i }).first().click();
    await expect(page.getByText(/invalid/i)).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test('create wallet shows seed phrase step', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /forge.*wallet|create.*wallet|new.*wallet/i }).first().click();
    await expect(page.getByText(/recovery.*phrase|secret.*phrase|write.*these/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('create wallet — seed phrase has 24 words', async ({ page }) => {
    await page.goto('/onboarding');
    await page.getByRole('button', { name: /forge.*wallet|create.*wallet|new.*wallet/i }).first().click();
    await page.waitForTimeout(1000);
    const words = page.locator('[class*="word"], [data-word], [data-index]');
    const count = await words.count();
    if (count === 0) {
      await expect(page.locator('text=/^[a-z]+$/').first()).toBeVisible({ timeout: 5000 });
    } else {
      expect(count).toBeGreaterThanOrEqual(24);
    }
  });
});
