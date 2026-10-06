import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { APP_ROUTES, PUBLIC_ROUTES } from './support/routes.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
}

/** Scan the current page; return one readable line per violating element. */
async function violations(page, label) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400); // let lazy chunks and animations settle
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return found.flatMap((v) => v.nodes.map((n) => `${label} · ${v.id} (${v.impact}) · ${n.target.join(' ')} · ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`));
}

for (const theme of ['light', 'dark']) {
  test(`every page passes WCAG 2.1 AA checks (${theme} theme)`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript((t) => localStorage.setItem('webforge.theme', t), theme);
    const problems = [];

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      problems.push(...await violations(page, route));
    }
    await login(page);
    for (const route of APP_ROUTES) {
      await page.goto(route);
      problems.push(...await violations(page, route));
    }

    // Interactive states that only exist after user actions
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).first().click();
    problems.push(...await violations(page, '/projects (new project dialog)'));
    await page.keyboard.press('Escape');

    await page.goto('/learn/quiz/dom-and-events');
    await page.getByRole('button', { name: 'Question 6' }).click();
    await page.getByRole('button', { name: 'Submit answers' }).click();
    problems.push(...await violations(page, '/learn/quiz (confirm dialog)'));
    await page.getByRole('dialog').getByRole('button', { name: 'Submit anyway' }).click();
    await expect(page).toHaveURL(/\/learn\/attempts\/\d+$/);
    problems.push(...await violations(page, '/learn/attempts/:id (result)'));

    await page.goto('/trace');
    await page.getByRole('tab', { name: 'Waterfall' }).click().catch(() => {}); // only when a trace exists
    problems.push(...await violations(page, '/trace (waterfall)'));

    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('no page scrolls sideways at phone, tablet or desktop width', async ({ page }) => {
  test.setTimeout(300_000);
  const overflow = [];
  const check = async (route, width) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    if (scroll > inner + 1) overflow.push(`${route} at ${width}px: page is ${scroll}px wide`);
  };
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of PUBLIC_ROUTES) await check(route, width);
  }
  await login(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of APP_ROUTES) await check(route, width);
  }
  expect(overflow, overflow.join('\n')).toEqual([]);
});

test('keyboard users can skip straight to the page content', async ({ page }) => {
  await login(page);
  await page.goto('/lab/state-lab');
  await expect(page.getByRole('heading', { level: 1, name: 'State & Hooks' })).toBeVisible(); // shell rendered after the auth check
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible(); // visible while focused
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});
