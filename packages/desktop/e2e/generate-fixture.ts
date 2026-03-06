/**
 * Standalone fixture generator — run once before tests:
 *   npx tsx e2e/generate-fixture.ts
 *
 * Generates e2e/fixtures/unlocked-wallet.json with a real encrypted keystore
 * using ARGON2_TEST_PARAMS (fast, ~50ms) so test setup is quick.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'unlocked-wallet.json');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSPHRASE = 'TestPassword123!';
const TEST_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

async function main(): Promise<void> {
  // Import wallet-core encryption directly
  const { encryptPayloadFast } = await import(
    '../../wallet-core/src/crypto/encryption.js'
  );

  console.log('Generating test keystore (fast params)...');
  const keystore = await encryptPayloadFast(TEST_MNEMONIC, TEST_PASSPHRASE);
  const keystoreJson = JSON.stringify(keystore);
  console.log('Keystore generated:', keystoreJson.substring(0, 80) + '...');

  const fixture = {
    cookies: [],
    origins: [
      {
        origin: 'http://127.0.0.1:3000',
        localStorage: [
          { name: 'saiko_wallet_created', value: 'true' },
          { name: 'saiko_wallet_address', value: TEST_ADDRESS },
          { name: 'saiko_locked', value: 'false' },
          { name: 'saiko_recovery_verified', value: 'true' },
          { name: 'saiko_network', value: 'mainnet' },
          {
            name: 'saiko_accounts_state',
            value: JSON.stringify({
              wallets: [
                {
                  index: 0,
                  name: 'Account 1',
                  address: TEST_ADDRESS,
                  derivationPath: "m/44'/60'/0'/0/0",
                  createdAt: 1704067200000,
                  isDefault: true,
                },
              ],
              activeIndex: 0,
              nextIndex: 1,
            }),
          },
          { name: 'saiko_keystore', value: keystoreJson },
        ],
      },
    ],
  };

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  console.log('Fixture written to', FIXTURE_PATH);
}

main().catch((err) => {
  console.error('Fixture generation failed:', err);
  process.exit(1);
});
