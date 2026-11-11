import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { duyoViews } from '@duyojs/duyo/views/vite'

export default defineConfig({
  plugins: [duyoViews(), react()],
  // Duyo ships TS source, and its remochi/css entry is a .ts that imports
  // remochi's CSS, whose fonts the dependency pre-bundler can't load. Serve
  // it through Vite's own pipeline instead.
  optimizeDeps: { exclude: ['@duyojs/duyo'] },
  server: {
    port: 5182,
    strictPort: true,
    host: true,
  },
})
