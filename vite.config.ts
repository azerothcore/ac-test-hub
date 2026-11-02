import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths: the site works under any GitHub Pages path (/<repo>/) without configuration.
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/tc9-api/': { target: 'http://127.0.0.1:8787', rewrite: (path) => path.replace(/^\/tc9-api/, '') },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
