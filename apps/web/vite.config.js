import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind on all interfaces so the container port mapping works.
    host: true,
    proxy: {
      // Same-origin API calls in development. This keeps the httpOnly refresh
      // cookie first-party, which avoids the SameSite headaches you get when
      // the SPA and API sit on different origins.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // The audit's headline performance defect was a 14 MB first paint. Keeping
    // a low warning threshold makes any regression here loud.
    chunkSizeWarningLimit: 500,
  },
});
