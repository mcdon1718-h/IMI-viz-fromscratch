import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['georaster', 'georaster-layer-for-leaflet'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})