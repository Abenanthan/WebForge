import { defineConfig, devices } from '@playwright/test';

// Browsers are installed off the system drive:
//   set PLAYWRIGHT_BROWSERS_PATH=D:\pw-browsers  &&  npx playwright install chromium
// Requires XAMPP (Apache + MySQL) running and `npm run dev`.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEBFORGE_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
