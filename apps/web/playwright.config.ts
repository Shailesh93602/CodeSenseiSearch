import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the web workspace.
 *
 * Spins up `next dev` automatically (reusing a running instance if
 * one is already on :3000). Tests live in ./e2e and can hit any
 * route the Next.js app serves.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Port 3010 chosen so the dev server doesn't collide with the
    // owner's portfolio on :3000 when both repos are open at once.
    baseURL: 'http://localhost:3010',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
