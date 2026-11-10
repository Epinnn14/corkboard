import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative base: works on GitHub Pages, in a sub-folder or opened from a static server
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ['sw-notify.js'],
      },
      manifest: {
        name: 'corkboard',
        short_name: 'corkboard',
        description: 'Boards of sticky notes, photos and stickers, with dates and reminders',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        background_color: '#ece6db',
        theme_color: '#f7f3ec',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Widget', short_name: 'Widget', url: './#widget', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Agenda', short_name: 'Agenda', url: './#agenda', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  // pdf.js, docx and jsPDF are split into lazy chunks that only load on import/export.
  // safari14: older iPads (iPadOS 14–16) parse the app too; newer syntax would leave them a blank page
  build: { chunkSizeWarningLimit: 1500, target: ['es2020', 'safari14', 'chrome87', 'edge88', 'firefox78'] },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
