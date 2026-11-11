/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { duyoViews } from '@duyojs/duyo/views/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [duyoViews(), react()],
  // Duyo ships TS source, and its remochi/css entry is a .ts that imports
  // remochi's CSS, whose fonts the dependency pre-bundler can't load. Serve
  // it through Vite's own pipeline instead.
  optimizeDeps: { exclude: ['@duyojs/duyo'] },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'ES2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Bloom's own shell — every built-in app is now its own independent
      // package under packages/apps/*, each with its own build (see
      // INTEGRATION_NOTES.md). The overlay is the shell's second window,
      // the one Evo keeps above apps (src/overlay/OverlayApp.tsx).
      input: {
        main: resolve(__dirname, 'index.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
  },
})
