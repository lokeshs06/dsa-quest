import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env.VITE_API_URL || 'http://localhost:5000';
const DAY = 24 * 60 * 60;

// Note: Workbox copies each urlPattern function into the generated service worker as source text, so they
// must be self-contained (no outer helpers). They get the full request URL, hence testing the pathname.

// In development, /api calls (and the live-rooms WebSocket) are proxied to the Express server on port 5000.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'DSA Quest',
        short_name: 'DSA Quest',
        description: 'A gamified tracker for daily DSA practice. Solve problems, earn XP, keep your streak.',
        theme_color: '#0A0E1F',
        background_color: '#0A0E1F',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Daily review', url: '/review', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Quest map', url: '/quests', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        // Deep links like /review open the app shell offline, but API and socket calls must never be answered with it
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        runtimeCaching: [
          {
            // Your own data, kept for offline reading. Network first, so you never see stale data while online.
            // These caches are emptied on logout (see clearApiCaches), because they belong to whoever was signed in.
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\/(problems|stats|review|packs)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'api-data', networkTimeoutSeconds: 4, expiration: { maxEntries: 60, maxAgeSeconds: 7 * DAY }, cacheableResponse: { statuses: [200] } },
          },
          {
            // Edits to a problem made offline are queued and replayed when the connection returns
            urlPattern: ({ url, request }) => request.method === 'PATCH' && /\/api\/problems\/[a-f\d]{24}$/.test(url.pathname),
            method: 'PATCH',
            handler: 'NetworkOnly',
            options: { backgroundSync: { name: 'problem-edits', options: { maxRetentionTime: DAY / 60 } } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 365 * DAY }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, changeOrigin: true, ws: true },
    },
  },
});
