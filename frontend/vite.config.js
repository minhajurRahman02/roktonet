import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all network interfaces, not just the container's internal
    // localhost -- required for your browser (outside the container) to
    // reach the dev server through Docker's port mapping.
    host: true,

    // Polling-based file watching -- more reliable than native filesystem
    // events when the source folder is bind-mounted from the host PC into
    // a container (a well-known Docker Desktop quirk, especially on
    // Windows/Mac). Slightly more CPU usage, negligible for a project
    // this size.
    watch: {
      usePolling: true,
    },

    proxy: {
      '/api': {
        // BACKEND_PROXY_TARGET lets this work correctly in BOTH contexts:
        // - Native `npm run dev` (no env var set) -> defaults to localhost:3000
        // - Inside docker-compose -> set to http://backend:3000, where
        //   "backend" is resolved via Docker's internal DNS to the backend
        //   container (service names become hostnames on the same network).
        target: process.env.BACKEND_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
