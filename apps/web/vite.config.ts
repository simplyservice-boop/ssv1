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
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: { outDir: 'dist', sourcemap: false },
});
