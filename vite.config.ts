import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig(() => ({
  plugins: [
    svelte({
      hot: !process.env.VITEST,
    }),
  ],

  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./webview/src/test/setup.ts'],
    include: ['webview/src/**/*.test.ts'],
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
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, 'webview/src/panels/sidebar/main.ts'),
        index: resolve(__dirname, 'webview/src/panels/index/main.ts'),
      },
      output: {
        entryFileNames: 'webview/[name].js',
        chunkFileNames: 'webview/[name]-[hash].js',
        assetFileNames: 'webview/[name][extname]',
        inlineDynamicImports: false,
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
