import { test, expect } from '@playwright/test';

const TEST_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

test.describe('Unlock Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Inject a locked wallet state — keystore is pre-encrypted placeholder
    // Real unlock tests use the fixture from generate-fixture.ts
    await page.addInitScript((addr: string) => {
      localStorage.setItem('saiko_wallet_created', 'true');
      localStorage.setItem('saiko_locked', 'true');
      localStorage.setItem('saiko_wallet_address', addr);
      // Minimal keystore — won't decrypt but allows unlock screen to render
      localStorage.setItem('saiko_keystore', JSON.stringify({
        version: 1,
        ciphertext: 'AAAA',
        nonce: 'AAAA',
        salt: 'AAAA',
        kdfParams: { algorithm: 'argon2id', memoryKb: 1024, iterations: 1, parallelism: 1 },
      }));
    }, TEST_ADDRESS);
    await page.goto('/');
  });

  test('shows unlock screen when wallet is locked', async ({ page }) => {
    await expect(page).toHaveURL(/unlock/);
    await expect(page.getByText(/unlock|enter.*passphrase|passphrase/i).first()).toBeVisible();
  });

  test('unlock button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /unlock/i })).toBeVisible();
  });

  test('passphrase input accepts text', async ({ page }) => {
    const input = page.getByPlaceholder(/passphrase|password/i).first();
    await input.fill('mypassword');
    await expect(input).toHaveValue('mypassword');
  });

  test('rejects wrong passphrase and shows error', async ({ page }) => {
    test.setTimeout(30000);
    const input = page.getByPlaceholder(/passphrase|password/i).first();
    await input.fill('wrongpassword');
    await page.getByRole('button', { name: /unlock/i }).click();
    // Should show error toast (after decryption attempt fails)
    await expect(
      page.getByText(/incorrect|invalid|wrong|failed/i).first()
    ).toBeVisible({ timeout: 20000 });
  });

  test('shows attempts remaining counter after wrong passphrase', async ({ page }) => {
    test.setTimeout(30000);
    const input = page.getByPlaceholder(/passphrase|password/i).first();
    await input.fill('badpassword');
    await page.getByRole('button', { name: /unlock/i }).click();
    // After one failed attempt, shows "4 attempts remaining"
    await expect(page.getByText(/attempt.*remaining|\d+ attempts/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('forgot / restore wallet link is visible', async ({ page }) => {
    await expect(
      page.getByText(/forgot|restore|import/i).first()
    ).toBeVisible();
  });

  test('forgot link navigates to import', async ({ page }) => {
    const link = page.getByRole('link', { name: /forgot|restore|import/i })
      .or(page.getByRole('button', { name: /forgot|restore|import/i }))
      .first();
    await link.click();
    await expect(page).toHaveURL(/import|onboarding/);
  });

  test('pressing Enter key in passphrase input triggers unlock', async ({ page }) => {
    test.setTimeout(30000);
    const input = page.getByPlaceholder(/passphrase|password/i).first();
    await input.fill('wrongpassword');
    await input.press('Enter');
    // Should show error (same behavior as clicking Unlock button)
    await expect(
      page.getByText(/incorrect|invalid|wrong|failed/i).first()
    ).toBeVisible({ timeout: 20000 });
  });
});
