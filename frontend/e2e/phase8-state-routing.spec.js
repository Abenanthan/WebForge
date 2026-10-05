import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

test.describe('State visualizer', () => {
  test('records real before/after values, batching and bail-outs', async ({ page }) => {
    await page.goto('/lab/state-lab');
    const history = page.getByRole('list', { name: 'State history' });
    const count = page.getByText(/^count = /);

    await page.getByRole('button', { name: '+1', exact: true }).click();
    await expect(count).toHaveText('count = 1');
    await expect(history).toContainText('Increment');
    await expect(history).toContainText('0 → 1');
    await expect(history).toContainText('re-rendered ×1');

    // Same value read three times → +1, batched into one render.
    await page.getByRole('button', { name: 'setCount(count + 1) ×3' }).click();
    await expect(count).toHaveText('count = 2');
    await expect(history.locator('li').first()).toContainText('1 → 2');
    await expect(history.locator('li').first()).toContainText('re-rendered ×1');

    // Functional updates → +3, still one render.
    await page.getByRole('button', { name: 'setCount(c => c + 1) ×3' }).click();
    await expect(count).toHaveText('count = 5');
    await expect(history.locator('li').first()).toContainText('2 → 5');
    await expect(history.locator('li').first()).toContainText('re-rendered ×1');

    // Same value → React bails out.
    await page.getByRole('button', { name: 'setCount(count)', exact: true }).click();
    await expect(history.locator('li').first()).toContainText('no re-render');
    await expect(page.getByText('no: React bailed out')).toBeVisible();

    // Time travel: restore the state after the first update.
    await page.getByRole('button', { name: 'Restore state after "Increment"' }).click();
    await expect(count).toHaveText('count = 1');
    await expect(history.locator('li').first()).toContainText('Restore from history');
  });

  test('mutating an array in place does not re-render', async ({ page }) => {
    await page.goto('/lab/state-lab');
    await page.getByRole('tab', { name: 'To-do list (array)' }).click();
    const history = page.getByRole('list', { name: 'State history' });

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Write tests', { exact: true })).toBeVisible();
    await expect(history.locator('li').first()).toContainText('re-rendered');
    await expect(page.getByText('no: a new value')).toBeVisible();

    await page.getByRole('button', { name: 'Mutate with push() (anti-pattern)' }).click();
    await expect(history.locator('li').first()).toContainText('no re-render');
    await expect(page.getByText('yes: Object.is(old, new) is true')).toBeVisible();
    await expect(page.getByText('Pushed directly', { exact: true })).toHaveCount(0); // in state, not on screen
    await expect(page.locator('pre').filter({ hasText: 'Pushed directly' }).first()).toBeVisible();

    // Hooks lab is a separate section of the same module
    await page.getByRole('link', { name: 'Hooks lab' }).click();
    await expect(page).toHaveURL(/\/lab\/state-lab\/hooks$/);
  });
});

test.describe('Hooks lab', () => {
  test('logs effects, dependency changes, aborts and cleanups', async ({ page }) => {
    await page.goto('/lab/state-lab/hooks');
    const timeline = page.getByRole('list', { name: 'Hook timeline' });
    await expect(timeline).toContainText('ran after mount');
    await expect(timeline).toContainText('response for userId = 1');
    // Each commit is logged exactly once.
    await expect(timeline.getByText('render #1 committed', { exact: true })).toHaveCount(1);

    // Change userId twice quickly: the first request is aborted by its cleanup.
    const userIds = page.getByRole('radiogroup', { name: 'userId prop' });
    await userIds.getByRole('radio', { name: '2' }).click();
    await userIds.getByRole('radio', { name: '3' }).click();
    await expect(timeline).toContainText('dependency changed: userId 2 → 3');
    await expect(timeline).toContainText('request for userId = 2 aborted');
    await expect(timeline).toContainText('response for userId = 3');
    await expect(page.getByText('user 3 loaded')).toBeVisible();

    // useState cycle
    await page.getByRole('button', { name: /Like \(0\)/ }).click();
    await expect(page.getByRole('button', { name: /Like \(1\)/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'useState cycle' })).toContainText('setLikes(0 + 1)');

    // Unmount → every cleanup runs
    await page.getByRole('button', { name: 'Unmount component' }).click();
    await expect(timeline).toContainText('cleanup on unmount');
    await expect(page.getByText('<ProfileWidget> is not mounted.')).toBeVisible();
  });
});

test.describe('Routing visualizer', () => {
  test('matches routes, passes params, redirects through a guard and keeps a history stack', async ({ page }) => {
    await page.goto('/lab/routing-visualizer');
    const demo = page.getByRole('navigation', { name: 'Demo app' });
    const navLog = page.getByRole('list', { name: 'Route history' });
    const stack = page.getByRole('list', { name: 'History stack' });

    await demo.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(navLog.locator('li').first()).toContainText('PUSH');
    await expect(navLog.locator('li').first()).toContainText('/ → /about');
    await expect(page.getByLabel('Address')).toHaveValue('/about');

    // Dynamic segment
    await demo.getByRole('link', { name: 'Profile' }).click();
    await expect(page.getByRole('heading', { name: 'Profile #7' })).toBeVisible();
    await expect(page.getByText('{"userId":"7"}').first()).toBeVisible();

    // Nested routes
    await demo.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page.getByText('Stats: 42 students')).toBeVisible();
    await expect(page.getByText('<DashboardStats />').first()).toBeVisible();
    await expect(page.getByRole('table', { name: 'Route table' }).locator('tr[class*="matched"]')).toHaveCount(3);

    // Guarded route redirects while logged out
    await demo.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expect(navLog.locator('li').first()).toContainText('redirect');
    await expect(page.getByLabel('Address')).toHaveValue('/login?from=/settings');

    // Logging in replaces the login entry
    await page.getByRole('button', { name: 'Log in and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(navLog.locator('li').first()).toContainText('REPLACE');
    await expect(page.getByText('Demo user is logged in')).toBeVisible();
    await expect(stack.locator('li')).toHaveCount(6); // / about profile dashboard stats settings

    // Back button → POP
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(navLog.locator('li').first()).toContainText('POP');

    // Address bar → 404 route
    await page.getByLabel('Address').fill('/nowhere');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Route table' }).locator('tr[class*="matched"]')).toContainText(['/', '/*']);
  });
});
