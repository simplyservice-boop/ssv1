import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  envDir: projectRoot,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(projectRoot, 'apps/web/src') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'https://ssv1-backend.onrender.com', changeOrigin: true },
      '/socket.io': { target: 'https://ssv1-backend.onrender.com', ws: true, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: { outDir: 'dist', sourcemap: false },
});
