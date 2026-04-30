import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['mapbox-gl'],
  },
  resolve: {
    alias: {
      'mapbox-gl': 'mapbox-gl',
    },
  },
})
