import { expect, test } from '@playwright/test';

/**
 * Smoke test of the production deployment: the Apache build (npm run build:apache)
 * served at /webforge/ with the PHP API at /webforge/api on the same origin.
 *   $env:WEBFORGE_APACHE_URL = "http://localhost/webforge"; npx playwright test e2e/deployment.spec.js
 * Skipped in the normal run (which tests the Vite preview build).
 */
const APP = process.env.WEBFORGE_APACHE_URL?.replace(/\/$/, '');
test.skip(!APP, 'set WEBFORGE_APACHE_URL to test the Apache deployment');

test('the Apache build works end to end on one origin', async ({ page }) => {
  const apiCalls = [];
  page.on('request', (req) => req.url().includes('/api/') && apiCalls.push(new URL(req.url()).pathname));

  // Deep link straight into a protected page: the SPA fallback serves index.html, the guard sends us to login.
  await page.goto(`${APP}/lab/database-lab`);
  await expect(page).toHaveURL(`${APP}/login`);
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();

  // Back where we were heading, inside the /webforge basename
  await expect(page).toHaveURL(`${APP}/lab/database-lab`);
  await page.getByRole('button', { name: 'Run SELECT' }).click();
  await expect(page.getByText(/row\(s\) returned/).first()).toBeVisible();

  // Client-side navigation and a full reload of a nested route
  await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: /Execution Trace/ }).click();
  await expect(page).toHaveURL(`${APP}/trace`);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Execution Trace' })).toBeVisible();

  // Every API call went to the same-origin /webforge/api prefix
  expect(apiCalls.length).toBeGreaterThan(3);
  expect(apiCalls.filter((p) => !p.startsWith('/webforge/api/'))).toEqual([]);
});
