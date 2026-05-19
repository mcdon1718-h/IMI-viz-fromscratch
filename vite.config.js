import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // ← listen on all interfaces
    port: 5173,
  },
  optimizeDeps: {
    include: ['georaster', 'georaster-layer-for-leaflet'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})