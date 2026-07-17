import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@kaotu/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    environment: 'node',
    // e2e 由 Playwright 运行，不纳入 vitest
    exclude: ['node_modules/**', 'e2e/**', 'dist/**'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
