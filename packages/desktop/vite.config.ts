import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default defineConfig({
  base: './', // Required for Electron file:// loading in production
  plugins: [react()],
  define: {
    // Polyfill Node globals for browser environment
    global: 'globalThis',
    'process.env': '{}',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  resolve: {
    alias: {
      '@saiko-wallet/ui-kit': resolve(__dirname, '../ui-kit/src/index.ts'),
      '@saiko-wallet/wallet-core': resolve(__dirname, '../wallet-core/src/index.ts'),
      'libsodium-wrappers': require.resolve('libsodium-wrappers'),
      // Buffer polyfill for browser
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // No source maps in production builds
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      external: ['snarkjs'],
    },
  },
  // Prevent Vite from clearing the terminal — useful for Tauri integration
  clearScreen: false,
});
