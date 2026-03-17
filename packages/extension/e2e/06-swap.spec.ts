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

async function goToSwap(): Promise<Page> {
  const page = await seedAndUnlock(context, extensionId, popupUrl);
  await page.locator('button').filter({ hasText: /^Swap$/ }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('SWAP', { exact: true })).toBeVisible({ timeout: 5000 });
  return page;
}

test('swap screen loads with input/output token selectors', async () => {
  const page = await goToSwap();
  await expect(page.getByText('You pay')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('You receive')).toBeVisible();
  // Token buttons with dropdown arrows
  await expect(page.getByText('ETH').first()).toBeVisible();
  await page.close();
});

test('input token picker opens (ETH shown, SAIKO shown)', async () => {
  const page = await goToSwap();
  // Click the input token button — it contains "ETH" and the ▼
  // The input token button is inside the first Card (You pay section)
  const inputTokenBtn = page.locator('button').filter({ hasText: 'ETH' }).filter({ hasText: '▼' }).first();
  await inputTokenBtn.click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Select Input Token')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Ethereum').first()).toBeVisible();
  await expect(page.getByText('Saiko').first()).toBeVisible();
  await page.close();
});

test('output token picker opens', async () => {
  const page = await goToSwap();
  // Output token button — SAIKO ▼
  const outputTokenBtn = page.locator('button').filter({ hasText: 'SAIKO' }).filter({ hasText: '▼' }).first();
  await outputTokenBtn.click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Select Output Token')).toBeVisible({ timeout: 5000 });
  await page.close();
});

test('search in picker filters results', async () => {
  const page = await goToSwap();
  const inputTokenBtn = page.locator('button').filter({ hasText: 'ETH' }).filter({ hasText: '▼' }).first();
  await inputTokenBtn.click();
  await page.waitForTimeout(500);

  await page.locator('input[placeholder="Search tokens..."]').fill('SAIKO');
  await page.waitForTimeout(300);

  // SAIKO should still be visible
  await expect(page.getByText('Saiko').first()).toBeVisible();
  await page.close();
});

test('back button works', async () => {
  const page = await goToSwap();
  // Back button navigates to /dashboard
  await page.locator('button').first().click();
  await page.waitForTimeout(1000);
  await expect(page.getByText('SAIKO WALLET')).toBeVisible({ timeout: 5000 });
  await page.close();
});
