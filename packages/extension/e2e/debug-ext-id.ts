import { chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../dist');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbg-'));
console.log('Temp dir:', tmpDir);

const ctx = await chromium.launchPersistentContext(tmpDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--no-sandbox',
  ],
  // Use Playwright's Chromium — better extension CDP support
});

// Listen for service workers BEFORE any navigations
const swPromise = new Promise<string>((resolve) => {
  ctx.on('serviceworker', (sw) => {
    console.log('🎉 Service worker registered:', sw.url());
    resolve(sw.url());
  });
  setTimeout(() => resolve('timeout'), 10000);
});

await new Promise(r => setTimeout(r, 2000));

// Navigate to extensions page and dig into shadow DOM
const page = await ctx.newPage();
await page.goto('chrome://extensions');
await page.waitForTimeout(3000);

// Try to extract extension ID from extensions manager shadow DOM
const extId = await page.evaluate(() => {
  try {
    const mgr = document.querySelector('extensions-manager') as any;
    if (!mgr) return 'no-mgr';
    const sr = mgr.shadowRoot;
    if (!sr) return 'no-shadow-root';
    const items = sr.querySelectorAll('extensions-item');
    const ids: string[] = [];
    items.forEach((item: any) => {
      ids.push(item.id || item.getAttribute('id') || JSON.stringify(item.dataset));
    });
    return 'items:' + ids.join(',') || 'no-items-found';
  } catch (e) {
    return 'error:' + String(e);
  }
});
console.log('Extension manager items:', extId);

// Also try CDP API to list extensions
const client = await page.context().newCDPSession(page);
try {
  const targets = await client.send('Target.getTargets');
  console.log('CDP Targets:', JSON.stringify(targets.targetInfos.map(t => ({ type: t.type, url: t.url.slice(0, 80) })), null, 2));
} catch (e) {
  console.log('CDP targets error:', e);
}

const swUrl = await swPromise;
console.log('Service worker URL:', swUrl);

await ctx.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
