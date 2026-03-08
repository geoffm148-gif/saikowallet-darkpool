/**
 * Polyfills for the Chrome extension popup environment.
 */
if (typeof globalThis.process === 'undefined') {
  (globalThis as Record<string, unknown>).process = { env: { NODE_ENV: 'production' }, browser: true };
}
