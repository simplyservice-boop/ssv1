import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:4000';

  return {
    envDir: projectRoot,
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(projectRoot, 'apps/web/src') } },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: false },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true, secure: false },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
