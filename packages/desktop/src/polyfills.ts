/**
 * Browser polyfills for Node.js APIs used by wallet-core.
 * WHY: wallet-core uses Buffer for base64 encoding in encryption modules.
 * Vite runs in browser context where Buffer isn't available natively.
 * This must be imported before any wallet-core code.
 */
import { Buffer } from 'buffer';

// Make Buffer available globally (wallet-core uses it implicitly)
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as Record<string, unknown>).Buffer = Buffer;
}
