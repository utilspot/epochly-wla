import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { APP_TITLE } from './app-meta.mjs'

const rootDir = resolve(__dirname)
const srcDir = resolve(rootDir, 'src')

// Replaces the %APP_TITLE% placeholder in src/index.html with the same
// title scripts/vite-run.mjs writes into dist/manifest.json's entries[0].title
// - one source of truth (app-meta.mjs) for both.
function injectAppTitle(): Plugin {
  return {
    name: 'inject-app-title',
    transformIndexHtml(html) {
      return html.replace(/%APP_TITLE%/g, APP_TITLE)
    },
  }
}

// Mounts the emulation server's request handler (server/requestHandler.js)
// directly into Vite's own dev/preview server, so `npm run dev`/`preview`
// serve the React app, the /time JSON endpoint, and the admin page all
// from one process on one port - no second server, no proxy.
function epochlyEmulationServer(): Plugin {
  return {
    name: 'epochly-emulation-server',
    async configureServer(server) {
      const { handleRequest } = await import('./server/requestHandler.js')
      server.middlewares.use(handleRequest)
    },
    async configurePreviewServer(server) {
      const { handleRequest } = await import('./server/requestHandler.js')
      server.middlewares.use(handleRequest)
    },
  }
}

// All source code (including the HTML entry point and static public assets)
// lives under src/. Vite builds it into dist/, which ends up containing only
// client-facing files (HTML, CSS, JS, favicon) - nothing server-related.
export default defineConfig({
  root: srcDir,
  publicDir: resolve(srcDir, 'public'),
  plugins: [react(), epochlyEmulationServer(), injectAppTitle()],
  build: {
    outDir: resolve(rootDir, 'dist'),
    emptyOutDir: true,
    assetsDir: '',
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
