import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig(() => ({
  plugins: [
    svelte({
      hot: !process.env.VITEST,
      onwarn(warning, handler) {
        if (warning.code.startsWith('a11y_')) return;
        handler(warning);
      },
    }),
  ],

  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./webview/src/test/setup.ts'],
    include: ['webview/src/**/*.test.ts', 'extension/src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    server: {
      deps: {
        // Force Vitest to use the browser build of svelte, not the SSR build
        inline: ['svelte', '@testing-library/svelte'],
      },
    },
    alias: {
      $shared: resolve(__dirname, 'webview/src/shared'),
      $styles: resolve(__dirname, 'webview/src/styles'),
    },
  },

  build: {
    outDir: '.',
    emptyOutDir: false,
    codeSplitting: false,
    // Inline assets (notably the ~73KB codicon font) as base64 data URIs so they
    // satisfy the webview CSP `font-src data:` without needing resource-root
    // wiring. 150KB headroom covers the codicon .ttf.
    assetsInlineLimit: 150000,
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, 'webview/src/panels/sidebar/main.ts'),
        index: resolve(__dirname, 'webview/src/panels/index/main.ts'),
        history: resolve(__dirname, 'webview/src/panels/history/main.ts'),
      },
      output: {
        entryFileNames: 'webview/[name].js',
        chunkFileNames: 'webview/[name]-[hash].js',
        assetFileNames: 'webview/[name][extname]',
        manualChunks: undefined,
      },
    },
  },

  resolve: {
    alias: {
      $shared: resolve(__dirname, 'webview/src/shared'),
      $styles: resolve(__dirname, 'webview/src/styles'),
    },
    conditions: ['browser'],
  },
}));
