import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gameLifeApi } from './server/plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), gameLifeApi()],
  server: {
    port: 5180,
    // Data files are pushed to the page through the API plugin's own watcher.
    watch: { ignored: ['**/data/**', '**/public/media/**'] },
  },
  preview: { port: 5181 },
  build: { chunkSizeWarningLimit: 900 },
})
