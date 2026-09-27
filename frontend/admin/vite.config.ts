import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4111',
      '/ag-ui': 'http://localhost:4111',
    },
  },
});
