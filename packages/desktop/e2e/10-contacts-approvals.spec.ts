import { test, expect } from '@playwright/test';

test.describe('Contacts', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test('contacts screen loads', async ({ page }) => {
    await page.goto('/contacts');
    await expect(page.getByText(/contact|address.*book/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('add contact button is present', async ({ page }) => {
    await page.goto('/contacts');
    await expect(
      page.getByRole('button', { name: /add.*contact|add|\+/i }).first()
    ).toBeVisible();
  });

  test('can add a valid contact', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: /add.*contact|add|\+/i }).first().click();
    // ContactForm placeholders: "Contact name" and "0x..."
    await page.getByPlaceholder(/contact.*name|name/i).fill('Vitalik');
    await page.getByPlaceholder(/0x/i).fill('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    // Save button text is "Save"
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await expect(page.getByText('Vitalik')).toBeVisible({ timeout: 5000 });
  });

  test('rejects invalid address when adding contact', async ({ page }) => {
    await page.goto('/contacts');
    await page.getByRole('button', { name: /add.*contact|add|\+/i }).first().click();
    await page.getByPlaceholder(/contact.*name|name/i).fill('Test User');
    await page.getByPlaceholder(/0x/i).fill('notanaddress');
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await expect(page.getByText(/invalid|error|not.*valid/i)).toBeVisible({ timeout: 3000 });
  });

  test('back button returns to settings', async ({ page }) => {
    await page.goto('/contacts');
    // Contacts back button navigates to /settings, not /dashboard
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/settings/);
  });
});

test.describe('Token Approvals', () => {
  test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

  test('approvals screen loads', async ({ page }) => {
    await page.goto('/approvals');
    await expect(
      page.getByText(/approval|permission|allowance/i).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('back button returns to settings', async ({ page }) => {
    await page.goto('/approvals');
    // Approvals back button navigates to /settings, not /dashboard
    await page.getByRole('button', { name: /back|←/i }).first().click();
    await expect(page).toHaveURL(/settings/);
  });
});
