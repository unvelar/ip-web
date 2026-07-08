import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function buildMetadataPlugin(): Plugin {
  return {
    name: 'unvelar-build-metadata',
    apply: 'build',
    generateBundle() {
      const sha = process.env.VITE_BUILD_SHA || 'dev'
      const time = process.env.VITE_BUILD_TIME || new Date().toISOString()
      this.emitFile({
        type: 'asset',
        fileName: 'build.json',
        source: `${JSON.stringify({ sha, time }, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), buildMetadataPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
