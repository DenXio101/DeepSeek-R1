import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'LyricGlow — personal karaoke stage',
        short_name: 'LyricGlow',
        description: 'Sing along with word-by-word lyrics, YouTube Music backing tracks, scoring and a guide cue.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0a0a0e',
        theme_color: '#0a0a0e',
        categories: ['music', 'entertainment'],
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // the app shell works offline; live services (recognition, lyrics, YouTube) are never cached
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          { urlPattern: ({ url }) => url.hostname === 'lrclib.net', handler: 'NetworkFirst', options: { cacheName: 'lrclib', expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 } } },
          { urlPattern: ({ url }) => url.hostname === 'i.ytimg.com', handler: 'StaleWhileRevalidate', options: { cacheName: 'yt-thumbs', expiration: { maxEntries: 120, maxAgeSeconds: 7 * 24 * 3600 } } },
        ],
      },
    }),
  ],
})
