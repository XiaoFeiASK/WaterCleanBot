import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configureVideoProxy } from './video-proxy.js';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '^/video/.*': {
        target: 'http://127.0.0.1:8888',
        configure: configureVideoProxy,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/video/, ''),
      },
    },
  },
});
