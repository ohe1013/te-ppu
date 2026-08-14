import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/dev-modes',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
      port: 4175,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:clean -- --host 127.0.0.1 --port 4176 --strictPort',
      port: 4176,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'dev-cleared',
      testMatch: /dev-cleared\.spec\.ts/u,
      use: { baseURL: 'http://127.0.0.1:4175' },
    },
    {
      name: 'dev-clean',
      testMatch: /dev-clean\.spec\.ts/u,
      use: { baseURL: 'http://127.0.0.1:4176' },
    },
  ],
});
