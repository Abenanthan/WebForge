import { defineConfig, devices } from '@playwright/test';

// Documentation screenshots (npm run screenshots). Not part of the test suite.
export default defineConfig({
  testDir: './scripts',
  testMatch: 'screenshots.spec.js',
  timeout: 600_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.WEBFORGE_BASE_URL ?? 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
