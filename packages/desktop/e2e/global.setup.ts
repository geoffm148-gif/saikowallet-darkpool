/**
 * Global setup — ensures the test wallet fixture exists before tests run.
 * If missing, regenerates it by spawning `tsx generate-fixture.ts` as a child process.
 * This avoids ESM/CJS conflicts when importing wallet-core directly in Playwright's runner.
 */
import { test as setup } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'unlocked-wallet.json');

setup('generate wallet fixture', async () => {
  // Skip if fixture already exists with a real keystore
  if (fs.existsSync(FIXTURE_PATH)) {
    const existing = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    const ks = existing?.origins?.[0]?.localStorage?.find(
      (x: { name: string }) => x.name === 'saiko_keystore',
    );
    if (ks?.value && ks.value.includes('ciphertext') && !ks.value.includes('__GENERATE')) {
      console.log('Fixture already exists with real keystore, skipping generation.');
      return;
    }
  }

  console.log('Generating wallet fixture via tsx...');
  execSync('npx tsx e2e/generate-fixture.ts', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  console.log('Fixture generation complete.');
});
