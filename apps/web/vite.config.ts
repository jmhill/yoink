import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { PWA_NAVIGATE_FALLBACK_DENYLIST } from './src/lib/pwa-navigate-fallback';

export default defineConfig({
  define: {
    __COMMIT_SHA__: JSON.stringify(process.env.VITE_COMMIT_SHA || 'dev'),
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Yoink - Quick Capture',
        short_name: 'Yoink',
        description: 'Capture thoughts and links instantly',
        theme_color: '#FBC4AB',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Share target for Android share intent
        share_target: {
          action: '/share',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
          },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Claim clients as soon as skipWaiting runs so Refresh does not wait
        // on a navigation. Keep skipWaiting unset so registerType: 'prompt'
        // still shows the update banner.
        clientsClaim: true,
        // SW scope is `/`, so without a denylist Workbox SPA navigateFallback
        // serves the web index.html for `/admin*` (and document hits to `/api`).
        navigateFallbackDenylist: PWA_NAVIGATE_FALLBACK_DENYLIST,
      },
    }),
  ],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
