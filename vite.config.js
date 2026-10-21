import { defineConfig } from 'vite'

// Relative base so the same build works at a domain root or under a sub-path
// such as GitHub Pages' https://<user>.github.io/<repo>/.
// (Social cards want whole addresses, which a relative build cannot know: those are written out in index.html.)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, assetsInlineLimit: 0 },
  server: { port: 5190, host: true },
})
