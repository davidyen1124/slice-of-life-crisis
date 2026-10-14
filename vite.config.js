import { defineConfig } from 'vite'

export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, assetsInlineLimit: 0 },
  server: { port: 5190, host: true },
})
