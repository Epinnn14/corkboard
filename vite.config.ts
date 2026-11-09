import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative base: works on GitHub Pages, in a sub-folder or opened from a static server
  base: './',
  plugins: [vue()],
  // pdf.js, docx and jsPDF are split into lazy chunks that only load on import/export
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
