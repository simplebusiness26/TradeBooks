import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks of the journeys the business depends on, driven through
 * a real browser against a production build and the seeded demo data.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Signing in dozens of times in a minute is exactly what the sign-in rate
  // limiter exists to stop, so it is switched off for the browser suite and
  // covered by its own unit test instead.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx next start -p 3100',
        url: 'http://127.0.0.1:3100/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { ...process.env, DISABLE_RATE_LIMIT: 'true' } as Record<string, string>,
      },
});
