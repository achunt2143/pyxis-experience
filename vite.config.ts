/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
      // INTEGRATION_NOTES.md).
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
  },
})
