import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e',
    port: 5173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'portrait-360x640',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'portrait-430x932',
      use: {
        browserName: 'webkit',
        viewport: { width: 430, height: 932 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
