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

async function goToReceive(): Promise<Page> {
  const page = await seedAndUnlock(context, extensionId, popupUrl);
  await page.getByText('Receive', { exact: true }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('RECEIVE')).toBeVisible({ timeout: 5000 });
  return page;
}

test('receive screen shows wallet address as text', async () => {
  const page = await goToReceive();
  await expect(page.getByText(TEST_ADDRESS)).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('copy button visible', async () => {
  const page = await goToReceive();
  await expect(page.getByRole('button', { name: /Copy Address/i })).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('QR code visible', async () => {
  const page = await goToReceive();
  // QRCodeSVG renders an <svg> element inside a white-background div
  await expect(page.locator('svg').first()).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('back button returns to dashboard', async () => {
  const page = await goToReceive();
  // Back button is the left arrow at the top
  const backBtn = page.locator('button').first();
  await backBtn.click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('SAIKO WALLET')).toBeVisible({ timeout: 5000 });
  await page.close();
});
