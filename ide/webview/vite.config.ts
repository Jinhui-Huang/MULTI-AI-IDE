import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
        assetFileNames: (assetInfo) => {
          const fname = typeof assetInfo.name === 'string' ? assetInfo.name : '';
          return fname.endsWith('.css') ? 'main.css' : '[name].[ext]';
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});