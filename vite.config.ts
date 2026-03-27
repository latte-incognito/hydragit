import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: '.',
    emptyOutDir: false,          // don't nuke dist/index.html etc.
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, 'webview/src/panels/sidebar/main.ts'),
        // index:   resolve(__dirname, 'webview/src/panels/index/main.ts'),
      },
      output: {
        entryFileNames: 'webview/[name].js',
        chunkFileNames: 'webview/[name]-[hash].js',
        assetFileNames: 'webview/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '$shared': resolve(__dirname, 'webview/src/shared'),
      '$styles': resolve(__dirname, 'webview/src/styles'),
    },
  },
})
