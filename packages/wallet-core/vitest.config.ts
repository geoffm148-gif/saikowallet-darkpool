import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // WHY: libsodium-wrappers ships a broken ESM entry (.mjs references
      // non-existent libsodium.mjs). We alias to the working CJS build.
      'libsodium-wrappers': require.resolve('libsodium-wrappers'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // Crypto ops (Argon2id) can be slow
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});
