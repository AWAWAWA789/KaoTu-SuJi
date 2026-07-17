import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    headless: true,
  },
  webServer: [
    {
      command: 'cd ../../apps/server && pnpm dev',
      url: 'http://localhost:3000/health',
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
