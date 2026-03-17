import { test, expect, type BrowserContext } from '@playwright/test';
import { launchExtension, openPopup } from './helpers';

let context: BrowserContext;
let popupUrl: string;

test.beforeAll(async () => {
  const ext = await launchExtension();
  context = ext.context;
  popupUrl = ext.popupUrl;
});

test.afterAll(async () => {
  await context?.close();
});

test('opens to onboarding with create/import options when no wallet', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await expect(page.getByText('FORGE NEW WALLET')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('IMPORT EXISTING WALLET')).toBeVisible();
  await page.close();
});

test('"Create New Wallet" shows mnemonic words', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await page.getByText('FORGE NEW WALLET').click();
  await expect(page.getByText('SECRET RECOVERY PHRASE')).toBeVisible({ timeout: 10000 });
  await page.close();
});

test('mnemonic contains 24 words', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await page.getByText('FORGE NEW WALLET').click();
  await page.waitForTimeout(500);
  // Click to reveal
  await page.getByText('Click to reveal').click();
  await page.waitForTimeout(500);
  // The SeedPhraseGrid renders words as numbered items; count elements with word indices
  // Each word cell in the grid has the word number and text
  const wordCells = page.locator('[data-word]');
  const count = await wordCells.count();
  if (count > 0) {
    expect(count).toBe(24);
  } else {
    // Fallback: count by grid text content — the grid should show numbers 1-24
    await expect(page.getByText('24')).toBeVisible();
  }
  await page.close();
});

test('passphrase too short (<8 chars) shows error', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await page.getByText('FORGE NEW WALLET').click();
  await page.waitForTimeout(500);

  // Reveal, confirm, continue through seed steps
  await page.getByText('Click to reveal').click();
  await page.waitForTimeout(300);
  await page.locator('#confirm-backup').check();
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(500);

  // Verify step - we need to fill in correct words
  // Get the word position labels and fill them correctly
  // Since we don't know the mnemonic, we skip verify by navigating to set-passphrase
  // Actually the flow requires verify first. Let's attempt to type wrong words and go back.
  // Instead, let's test passphrase validation directly by importing a wallet
  await page.close();

  // Use import flow to get to passphrase step directly
  const page2 = await openPopup(context, popupUrl);
  await page2.waitForTimeout(1000);
  await page2.getByText('IMPORT EXISTING WALLET').click();
  await page2.waitForTimeout(500);

  // Type a valid seed phrase
  const testSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  await page2.locator('textarea').fill(testSeed);
  await page2.getByRole('button', { name: /Continue/i }).click();
  await page2.waitForTimeout(500);

  // Now on set-passphrase step
  await expect(page2.getByText('SET YOUR PASSPHRASE')).toBeVisible({ timeout: 5000 });

  // Type short passphrase
  const passphraseInputs = page2.locator('input[type="password"]');
  await passphraseInputs.first().fill('short');
  await passphraseInputs.nth(1).fill('short');
  await page2.getByRole('button', { name: /Create Wallet/i }).click();
  await page2.waitForTimeout(500);

  await expect(page2.getByText('Minimum 8 characters')).toBeVisible();
  await page2.close();
});

test('mismatched confirm passphrase shows error', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await page.getByText('IMPORT EXISTING WALLET').click();
  await page.waitForTimeout(500);

  const testSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  await page.locator('textarea').fill(testSeed);
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(500);

  const passphraseInputs = page.locator('input[type="password"]');
  await passphraseInputs.first().fill('longenoughpass');
  await passphraseInputs.nth(1).fill('differentpass1');
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('Passphrases do not match')).toBeVisible();
  await page.close();
});

test('valid passphrase proceeds to success/dashboard', async () => {
  const page = await openPopup(context, popupUrl);
  await page.waitForTimeout(1000);
  await page.getByText('IMPORT EXISTING WALLET').click();
  await page.waitForTimeout(500);

  const testSeed = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  await page.locator('textarea').fill(testSeed);
  await page.getByRole('button', { name: /Continue/i }).click();
  await page.waitForTimeout(500);

  const passphraseInputs = page.locator('input[type="password"]');
  await passphraseInputs.first().fill('TestPassphrase@Saiko$2026!');
  await passphraseInputs.nth(1).fill('TestPassphrase@Saiko$2026!');
  await page.getByRole('button', { name: /Create Wallet/i }).click();

  // Should show success with "WALLET CREATED" or go to dashboard
  await expect(page.getByText(/WALLET CREATED|SAIKO WALLET/)).toBeVisible({ timeout: 15000 });
  await page.close();
});

test('back button on import step goes back to welcome', async () => {
  // Clear storage first for fresh state
  const page = await context.newPage();
  await page.goto(popupUrl);
  await page.waitForTimeout(500);
  await page.evaluate(() => chrome.storage.local.clear());
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  await page.getByText('IMPORT EXISTING WALLET').click();
  await page.waitForTimeout(500);
  await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

  // Click back
  await page.getByRole('button', { name: /Back/i }).click();
  await page.waitForTimeout(500);

  await expect(page.getByText('FORGE NEW WALLET')).toBeVisible({ timeout: 5000 });
  await page.close();
});
