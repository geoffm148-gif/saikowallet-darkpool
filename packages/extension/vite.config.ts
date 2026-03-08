import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': '{}',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'process.browser': 'true',
    'process.version': '"v18.0.0"',
    'process.versions': '{}',
    'process.platform': '"browser"',
    'process.hrtime': 'undefined',
    'process.nextTick': 'queueMicrotask',
  },
  resolve: {
    alias: {
      '@saiko-wallet/ui-kit': resolve(__dirname, '../ui-kit/src/index.ts'),
      '@saiko-wallet/wallet-core': resolve(__dirname, 'src/popup/wallet-safe.ts'),
      'libsodium-wrappers': require.resolve('libsodium-wrappers'),
      buffer: 'buffer',
      // Stub out Node built-ins — they're not available in extension context
      fs: resolve(__dirname, 'src/stubs/node-builtins.ts'),
      path: resolve(__dirname, 'src/stubs/node-builtins.ts'),
      url: resolve(__dirname, 'src/stubs/node-builtins.ts'),
      os: resolve(__dirname, 'src/stubs/node-builtins.ts'),
      stream: resolve(__dirname, 'src/stubs/node-builtins.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    rollupOptions: {
      external: ['snarkjs'],
      input: {
        popup: resolve(__dirname, 'popup.html'),
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content-script.ts'),
        inpage: resolve(__dirname, 'src/inpage/provider.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'popup') return 'popup.js';
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          if (chunkInfo.name === 'inpage') return 'inpage.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    target: 'chrome116',
    minify: true,
  },
});
