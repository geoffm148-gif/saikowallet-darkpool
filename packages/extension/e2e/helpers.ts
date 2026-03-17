import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { HDNodeWallet, Mnemonic, getAddress } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EXTENSION_PATH = path.resolve(__dirname, '../dist');

// Standard BIP-39 test vector — well-known, safe for automated tests only.
export const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
export const TEST_PASSPHRASE = 'TestPassphrase@Saiko$2026!';
export const TEST_ADDRESS = getAddress(
  HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
  ), "m/44'/60'/0'/0/0").address,
);

export async function launchExtension(): Promise<{ context: BrowserContext; popupUrl: string; extensionId: string }> {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
  // Wait for service worker to register and get extension ID
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).hostname;
  const popupUrl = `chrome-extension://${extId}/popup.html`;
  return { context, popupUrl, extensionId: extId };
}

export async function openPopup(context: BrowserContext, popupUrl: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

/**
 * Seed the extension with a known test wallet via wallet:setup message.
 */
export async function seedWallet(context: BrowserContext, extensionId: string): Promise<void> {
  const seedPage = await context.newPage();
  await seedPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await seedPage.waitForTimeout(1000);

  const result = await seedPage.evaluate(
    async ({ mnemonic, passphrase, address }) => {
      return new Promise<{ ok?: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'wallet:setup', mnemonic, passphrase, address },
          (resp: unknown) => resolve(resp as { ok?: boolean; error?: string }),
        );
      });
    },
    { mnemonic: TEST_MNEMONIC, passphrase: TEST_PASSPHRASE, address: TEST_ADDRESS },
  );

  await seedPage.close();
  if (!result?.ok) throw new Error(`seedWallet failed: ${result?.error ?? 'unknown'}`);
}

/**
 * Seed wallet + set popup state so the popup shows as unlocked with wallet created.
 * Returns a fresh popup page at the dashboard.
 */
export async function seedAndUnlock(context: BrowserContext, extensionId: string, popupUrl: string): Promise<Page> {
  // 1. Seed wallet
  await seedWallet(context, extensionId);

  // 2. Set popup state: walletCreated = true, locked = true (so it shows unlock screen)
  const page = await context.newPage();
  await page.goto(popupUrl);
  await page.waitForTimeout(500);

  await page.evaluate(
    ({ address }) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({
          'saiko:state': {
            walletCreated: true,
            locked: true,
            address,
            networkId: 'mainnet',
          },
        }, resolve);
      });
    },
    { address: TEST_ADDRESS },
  );

  // 3. Reload and do a real unlock via the UI
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Fill passphrase and unlock
  await page.locator('input[type="password"]').fill(TEST_PASSPHRASE);
  await page.getByRole('button', { name: 'Unlock' }).click();

  // Wait for dashboard to appear
  await page.waitForTimeout(2000);
  return page;
}

/**
 * Seed wallet and set state so the wallet is created but locked.
 * Returns a fresh popup page at the unlock screen.
 */
export async function seedAndLock(context: BrowserContext, extensionId: string, popupUrl: string): Promise<Page> {
  await seedWallet(context, extensionId);

  const page = await context.newPage();
  await page.goto(popupUrl);
  await page.waitForTimeout(500);

  await page.evaluate(
    ({ address }) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.set({
          'saiko:state': {
            walletCreated: true,
            locked: true,
            address,
            networkId: 'mainnet',
          },
        }, resolve);
      });
    },
    { address: TEST_ADDRESS },
  );

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
  return page;
}
