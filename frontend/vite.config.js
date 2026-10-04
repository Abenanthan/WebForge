import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The PHP API is served by XAMPP Apache under /webforge (see backend/config/apache-webforge.conf).
// In development the SPA calls same-origin /api/... and Vite forwards it, so cookies and
// CSRF work exactly as they will in production (no CORS).
const API_TARGET = process.env.WEBFORGE_API_TARGET ?? 'http://localhost';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => `/webforge${path}`,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: './src/test/setup.js',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
