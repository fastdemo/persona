import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build for GitHub Pages project site:
// served from https://fastdemo.github.io/persona/  (repo: fastdemo/persona)
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
});
