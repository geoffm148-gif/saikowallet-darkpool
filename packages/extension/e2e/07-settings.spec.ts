import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { launchExtension, seedAndUnlock } from './helpers';

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

async function goToSettings(): Promise<Page> {
  const page = await seedAndUnlock(context, extensionId, popupUrl);
  // Navigate to settings by clicking the settings icon button in the dashboard header
  await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'));
    const candidates = allBtns.filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.y < 60 && rect.x > 250 && btn.querySelector('svg') && btn.textContent?.trim() === '';
    });
    candidates[0]?.click();
  });
  await page.waitForTimeout(1000);
  await expect(page.getByRole('heading', { name: 'SETTINGS' })).toBeVisible({ timeout: 10000 });
  return page;
}

test('settings screen has expected sections', async () => {
  const page = await goToSettings();
  await expect(page.getByText('Network', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Auto-lock', { exact: true })).toBeVisible();
  await expect(page.getByText('Change Passphrase', { exact: true })).toBeVisible();
  await expect(page.getByText(/Connected Sites/)).toBeVisible();
  await expect(page.getByText('View Seed Phrase')).toBeVisible();
  await expect(page.getByText('Lock Wallet')).toBeVisible();
  await expect(page.getByText(/Reset Wallet/)).toBeVisible();
  await page.close();
});

test('network picker shows network options (Mainnet, Sepolia)', async () => {
  const page = await goToSettings();
  // Click the Network row
  await page.getByText('Network', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Ethereum Mainnet').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Sepolia Testnet')).toBeVisible();
  await page.close();
});

test('auto-lock picker shows time options', async () => {
  const page = await goToSettings();
  await page.getByText('Auto-lock', { exact: true }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText('1 minute')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('5 minutes').first()).toBeVisible();
  await expect(page.getByText('15 minutes')).toBeVisible();
  await expect(page.getByText('30 minutes')).toBeVisible();
  await expect(page.getByText('Disabled', { exact: true })).toBeVisible();
  await page.close();
});

test('change passphrase expands with inputs and button', async () => {
  const page = await goToSettings();
  await page.getByText('Change Passphrase', { exact: true }).click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Current Passphrase')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('New Passphrase', { exact: true })).toBeVisible();
  await expect(page.getByText('Confirm New Passphrase')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update Passphrase' })).toBeVisible();
  await page.close();
});

test('reset wallet: first click shows confirm card with Cancel + Confirm Reset', async () => {
  const page = await goToSettings();
  // Scroll to bottom
  await page.evaluate(() => {
    const el = document.querySelector('[style*="overflow"]') ?? document.documentElement;
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: /Reset Wallet/ }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('This will delete all wallet data')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Reset' })).toBeVisible();
  await page.close();
});

test('scroll test: settings content can be scrolled when sections open', async () => {
  const page = await goToSettings();

  // Open several sections to make content tall
  await page.getByText('Network', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByText('Auto-lock', { exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText('Change Passphrase', { exact: true }).click();
  await page.waitForTimeout(300);

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(scrollHeight).toBeGreaterThan(600);
  await page.close();
});

test('lock wallet: clicking locks and redirects to unlock screen', async () => {
  const page = await goToSettings();
  await page.getByText('Lock Wallet').click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('UNLOCK WALLET')).toBeVisible({ timeout: 10000 });
  await page.close();
});
