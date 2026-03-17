/**
 * Cryptographically secure random byte generation.
 *
 * WHY: Math.random() uses a PRNG that is NOT cryptographically secure —
 * its output can be predicted if the seed is known. For key material,
 * nonces, and salts we MUST use the OS CSPRNG via crypto.getRandomValues().
 *
 * WHY globalThis.crypto: Works in both Node.js (>=19) and browsers.
 * We avoid importing from 'crypto' module since wallet-core must run
 * in browser environments (Tauri webview, React Native).
 */

/**
 * Resolve the crypto provider — works in both Node and browser.
 * WHY lazy: globalThis.crypto may not be available at module load in
 * some test environments, but will be available when called.
 */
function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto;
  }
  throw new Error(
    'secureRandom: No CSPRNG available. ' +
    'globalThis.crypto is required (Node >=19 or any modern browser).',
  );
}

/**
 * Generate `length` cryptographically random bytes.
 * Throws if the CSPRNG is unavailable — this is a fatal condition.
 */
export function secureRandom(length: number): Uint8Array {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error(`secureRandom: length must be a positive integer, got ${length}`);
  }

  const buffer = new Uint8Array(length);
  getCrypto().getRandomValues(buffer);
  return buffer;
}

/**
 * Generate a random hex string of `byteLength` bytes.
 * WHY: Convenience wrapper used for nonces in tests and display purposes.
 */
export function secureRandomHex(byteLength: number): string {
  const bytes = secureRandom(byteLength);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
