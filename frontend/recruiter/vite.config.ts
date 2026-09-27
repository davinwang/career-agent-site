import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend (Hono) listens on :4111. Everything under /api and /ag-ui is
// proxied there in dev; in production nginx does the same job, so the app only
// ever uses relative paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4111',
        changeOrigin: true,
      },
      '/ag-ui': {
        target: 'http://localhost:4111',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4111',
        changeOrigin: true,
      },
      '/vendor': {
        target: 'http://localhost:4111',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
