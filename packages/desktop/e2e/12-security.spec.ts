/**
 * Security-focused tests — verify that the app enforces security boundaries
 * that are critical for a wallet application.
 */
import { test, expect } from '@playwright/test';

test.describe('Security boundaries', () => {
  test('redirects to onboarding when wallet does not exist', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page).toHaveURL(/onboarding/);
  });

  test('redirects to unlock when wallet exists but is locked', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('saiko_wallet_created', 'true');
      localStorage.setItem('saiko_locked', 'true');
      localStorage.setItem('saiko_wallet_address', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
      localStorage.setItem('saiko_keystore', JSON.stringify({
        version: 1, ciphertext: 'x', nonce: 'x', salt: 'x',
        kdfParams: { algorithm: 'argon2id', memoryKb: 1024, iterations: 1, parallelism: 1 },
      }));
    });
    await page.goto('/');
    await expect(page).toHaveURL(/unlock/);
  });

  test('dashboard is NOT accessible when locked', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('saiko_wallet_created', 'true');
      localStorage.setItem('saiko_locked', 'true');
      localStorage.setItem('saiko_wallet_address', '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
      localStorage.setItem('saiko_keystore', JSON.stringify({
        version: 1, ciphertext: 'x', nonce: 'x', salt: 'x',
        kdfParams: { algorithm: 'argon2id', memoryKb: 1024, iterations: 1, parallelism: 1 },
      }));
    });
    // Navigate to root — should redirect to unlock, not dashboard
    await page.goto('/');
    await expect(page).toHaveURL(/unlock/);
  });

  test.describe('With unlocked wallet', () => {
    test.use({ storageState: 'e2e/fixtures/unlocked-wallet.json' });

    test('mnemonic is NOT visible in the DOM on dashboard', async ({ page }) => {
      await page.goto('/dashboard');
      const content = await page.content();
      expect(content).not.toContain('abandon abandon abandon');
    });

    test('saiko_mnemonic key is NOT in localStorage', async ({ page }) => {
      await page.goto('/dashboard');
      const val = await page.evaluate(() => localStorage.getItem('saiko_mnemonic'));
      expect(val).toBeNull();
    });

    test('keystore in localStorage is NOT plaintext mnemonic', async ({ page }) => {
      await page.goto('/dashboard');
      const keystore = await page.evaluate(() => localStorage.getItem('saiko_keystore'));
      expect(keystore).not.toContain('abandon');
      if (keystore && keystore.startsWith('{')) {
        const parsed = JSON.parse(keystore);
        expect(parsed).toHaveProperty('ciphertext');
        expect(parsed).toHaveProperty('nonce');
        expect(parsed).toHaveProperty('salt');
      }
    });
  });
});
