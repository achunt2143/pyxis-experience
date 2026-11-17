import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { duyoViews } from '@duyojs/duyo/views/vite'

export default defineConfig({
  plugins: [duyoViews(), react()],
  // Duyo ships TS source. Serve it through Vite's own pipeline rather than pre-bundling.
  optimizeDeps: { exclude: ['@duyojs/duyo'] },
  server: {
    port: 5187,
    strictPort: true,
    host: true,
  },
})
