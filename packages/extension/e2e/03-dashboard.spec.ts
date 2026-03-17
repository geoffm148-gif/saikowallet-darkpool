import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { launchExtension, seedAndUnlock, TEST_ADDRESS } from './helpers';

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

async function getDashboard(): Promise<Page> {
  return seedAndUnlock(context, extensionId, popupUrl);
}

test('dashboard shows wallet address (truncated 0x...)', async () => {
  const page = await getDashboard();
  const truncated = `${TEST_ADDRESS.slice(0, 6)}...${TEST_ADDRESS.slice(-4)}`;
  await expect(page.getByText(truncated)).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('ETH balance row visible', async () => {
  const page = await getDashboard();
  // The word "Ethereum" appears in the assets list
  await expect(page.getByText('Ethereum').first()).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('SAIKO balance row visible (mainnet)', async () => {
  const page = await getDashboard();
  // "Saiko" label appears in the SAIKO asset row
  await expect(page.getByText('Saiko').first()).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('"Add Token" button visible', async () => {
  const page = await getDashboard();
  await expect(page.getByText('+ Add Token')).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('clicking Add Token opens modal with address input', async () => {
  const page = await getDashboard();
  await page.getByText('+ Add Token').click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Add Custom Token')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Contract Address')).toBeVisible();
  await page.close();
});

test('Send button navigates to send screen', async () => {
  const page = await getDashboard();
  // The "Send" text button is in the action row
  await page.locator('button').filter({ hasText: /^Send$/ }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole('heading', { name: /SEND ETH/ })).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('Receive button navigates to receive screen', async () => {
  const page = await getDashboard();
  await page.locator('button').filter({ hasText: /^Receive$/ }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole('heading', { name: 'RECEIVE' })).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('Swap button navigates to swap screen', async () => {
  const page = await getDashboard();
  await page.locator('button').filter({ hasText: /^Swap$/ }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('SWAP', { exact: true })).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('Settings icon navigates to settings screen', async () => {
  const page = await getDashboard();
  // Settings icon button is in the header; find the first icon-only button near top-right
  // The dashboard header buttons area: settings (gear) then lock (padlock)
  // Navigate to settings via evaluate to be precise
  await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button'));
    // Find icon-only buttons (no text, contain SVG) in top area
    const candidates = allBtns.filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.y < 60 && rect.x > 250 && btn.querySelector('svg') && btn.textContent?.trim() === '';
    });
    // The first one should be settings
    candidates[0]?.click();
  });
  await page.waitForTimeout(1000);
  await expect(page.getByRole('heading', { name: 'SETTINGS' })).toBeVisible({ timeout: 5000 });
  await page.close();
});
