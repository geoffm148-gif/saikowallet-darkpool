import { test, expect, type BrowserContext } from '@playwright/test';
import { launchExtension, seedAndLock, TEST_PASSPHRASE, TEST_ADDRESS } from './helpers';

let context: BrowserContext;
let popupUrl: string;
let extensionId: string;

test.beforeAll(async () => {
  const ext = await launchExtension();
  context = ext.context;
  popupUrl = ext.popupUrl;
  extensionId = ext.extensionId;
});

test.afterAll(async () => {
  await context?.close();
});

test('locked wallet shows unlock screen with passphrase field', async () => {
  const page = await seedAndLock(context, extensionId, popupUrl);
  await expect(page.getByText('UNLOCK WALLET')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.close();
});

test('wrong passphrase shows error', async () => {
  const page = await seedAndLock(context, extensionId, popupUrl);
  await expect(page.getByText('UNLOCK WALLET')).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="password"]').fill('wrongpassphrase');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.waitForTimeout(2000);

  // Should show "X attempts remaining" or the toast "Wrong passphrase. N left."
  await expect(page.getByText('attempts remaining').first()).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('Enter key on passphrase field triggers unlock attempt', async () => {
  const page = await seedAndLock(context, extensionId, popupUrl);
  await expect(page.getByText('UNLOCK WALLET')).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="password"]').fill('wrongpass123');
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForTimeout(2000);

  // Should show error (means Enter key worked)
  await expect(page.getByText('attempts remaining').first()).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('correct passphrase unlocks and shows dashboard', async () => {
  const page = await seedAndLock(context, extensionId, popupUrl);
  await expect(page.getByText('UNLOCK WALLET')).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="password"]').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();

  // Should navigate to dashboard
  await expect(page.getByText('SAIKO WALLET')).toBeVisible({ timeout: 15000 });
  const truncatedAddr = `${TEST_ADDRESS.slice(0, 6)}...${TEST_ADDRESS.slice(-4)}`;
  await expect(page.getByText(truncatedAddr)).toBeVisible({ timeout: 5000 });
  await page.close();
});
