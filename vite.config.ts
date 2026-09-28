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

export default defineConfig(({ mode }) => ({
  // This development entry has an explicit local client. Never load the
  // checkout's production-oriented .env files or inherit the normal API proxy.
  envDir: mode === 'monitoring-workspace' ? false : undefined,
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), tailwindcss(), buildMetadataPlugin()],
  server: {
    headers: mode === 'monitoring-workspace' ? {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:53000 http://127.0.0.1:53000 ws://localhost:5173 ws://127.0.0.1:5173; object-src 'none'; form-action 'none'; base-uri 'self'",
    } : undefined,
    proxy: mode === 'monitoring-workspace' ? undefined : {
      '/api': 'http://localhost:3000',
    },
  },
}))
