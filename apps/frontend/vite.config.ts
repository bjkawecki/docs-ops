import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Wenn du nur `pnpm --filter frontend dev` startest: /api → Backend (Standard 8080 wie `make dev`). */
const devApiTarget = process.env.VITE_DEV_PROXY_API ?? 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: devApiTarget, changeOrigin: true },
      '/health': { target: devApiTarget, changeOrigin: true },
      '/ready': { target: devApiTarget, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
  },
} as Parameters<typeof defineConfig>[0] & { test?: object });
