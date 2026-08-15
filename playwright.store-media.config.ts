import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/store-media',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/store-media',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    viewport: { width: 636, height: 1048 },
    hasTouch: true,
    isMobile: true,
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e',
    port: 5173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
