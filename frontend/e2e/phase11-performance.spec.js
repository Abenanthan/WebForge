import { expect, test } from '@playwright/test';

/**
 * JavaScript budget per page on a cold load (fresh browser context, empty cache).
 * Uncompressed sizes (gzip transfers about a third). Budgets are the measured size plus ~10% headroom
 * so a change that pulls a large dependency into a page fails here instead of shipping.
 */
const BUDGET_KB = {
  '/': 330,
  '/lab/web-playground': 1120,
  '/lab/js-playground': 1050,
  '/lab/server-lab': 1040,
  '/lab/component-studio/jsx': 1160,
  '/lab/dom-explorer': 490,
  '/learn': 320,
};

test('pages stay within their JavaScript budget', async ({ browser }) => {
  test.setTimeout(180_000);
  const loginContext = await browser.newContext();
  const login = await loginContext.newPage();
  await login.goto('/login');
  await login.getByLabel('Email').fill('demo@webforge.local');
  await login.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await login.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(login.getByRole('heading', { level: 1 })).toContainText('Demo');
  const storageState = await loginContext.storageState();
  await loginContext.close();

  const over = [];
  for (const [route, budget] of Object.entries(BUDGET_KB)) {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    const sizes = [];
    page.on('response', (res) => {
      if (res.url().endsWith('.js')) sizes.push(res.body().then((b) => b.length, () => 0));
    });
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const kb = (await Promise.all(sizes)).reduce((a, b) => a + b, 0) / 1024;
    if (kb > budget) over.push(`${route}: ${kb.toFixed(0)} KB (budget ${budget} KB)`);
    await context.close();
  }
  expect(over, over.join('\n')).toEqual([]);
});
