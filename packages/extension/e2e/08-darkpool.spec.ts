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

async function goToDarkPool(): Promise<Page> {
  const page = await seedAndUnlock(context, extensionId, popupUrl);
  await page.getByText('DarkPool', { exact: true }).click();
  await page.waitForTimeout(1000);
  return page;
}

test('darkpool screen loads without crashing', async () => {
  const page = await goToDarkPool();
  // Should show the DarkPool heading in header or hero
  await expect(page.getByText('DarkPool').first()).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('shows hub content with Saiko Dark Pools heading', async () => {
  const page = await goToDarkPool();
  await expect(page.getByText('Saiko Dark Pools')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Private ZK deposits/)).toBeVisible();
  await page.close();
});

test('deposit and withdraw buttons visible', async () => {
  const page = await goToDarkPool();
  await expect(page.getByRole('button', { name: /Deposit/i })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: /Withdraw/i })).toBeVisible();
  await page.close();
});

test('no JavaScript console errors on load', async () => {
  const page = await goToDarkPool();

  // Collect console errors
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Navigate fresh to darkpool and check for errors
  await page.reload();
  await page.waitForTimeout(2000);

  // Filter out known non-critical errors (like network errors for balance fetches)
  const criticalErrors = errors.filter(e =>
    !e.includes('net::') &&
    !e.includes('Failed to fetch') &&
    !e.includes('chrome.runtime') &&
    !e.includes('publicnode')
  );

  expect(criticalErrors.length).toBe(0);
  await page.close();
});
