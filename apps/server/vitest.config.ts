import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@kaotu/shared': new URL('../../packages/shared/src', import.meta.url).pathname,
    },
  },
});
