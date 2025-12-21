import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  base: '/admin/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@yoink/ui-base': path.resolve(__dirname, '../../packages/ui-base/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/login': 'http://localhost:3000',
      '/admin/logout': 'http://localhost:3000',
      '/admin/session': 'http://localhost:3000',
      '/admin/organizations': 'http://localhost:3000',
      '/admin/users': 'http://localhost:3000',
      '/admin/tokens': 'http://localhost:3000',
    },
  },
});
