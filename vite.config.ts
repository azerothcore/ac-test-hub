import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths: the site works under any GitHub Pages path (/<repo>/) without configuration.
  base: './',
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
