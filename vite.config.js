
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        headers: { 'X-Frappe-Site-Name': 'clssurya.local' },
      },
      '/socket.io': {
        target: 'http://127.0.0.1:9001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../backend/clssurya/public/erp',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  test: { environment: 'node' },
});