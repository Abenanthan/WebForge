import { expect, test } from '@playwright/test';
import { deleteProject, projectIdFrom } from './support/cleanup.js';

const SHOTS = process.env.WEBFORGE_SCREENSHOTS;
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

test.describe('AJAX Monitor', () => {
  test('sends a real database request and inspects request, response and server trace', async ({ page }) => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('button', { name: /Search the database/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/^200 1 item\(s\) returned from the database$/)).toBeVisible();

    const flow = page.getByRole('list', { name: 'Request flow' });
    await expect(flow).toContainText('GET /api/demo/concepts');
    await expect(flow).toContainText('React re-rendered');

    await page.getByRole('tab', { name: 'Request' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('/api/demo/concepts?search=java&limit=5');
    await expect(page.getByRole('tabpanel')).toContainText('X-Trace-Id');

    await page.getByRole('tab', { name: 'Response' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('JavaScript Fundamentals');
    await expect(page.getByRole('tabpanel')).toContainText('content-type');

    await page.getByRole('tab', { name: 'Server' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('WHERE (c.title LIKE ? OR c.slug LIKE ?)');
    await expect(page.getByRole('tabpanel')).toContainText('["%java%","%java%"]');
    await shot(page, '42-ajax-monitor');
  });

  test('POST with JSON body, server errors and validation of the body', async ({ page }) => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('button', { name: /POST JSON/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/^201 The server received your POST request\.$/)).toBeVisible();

    // Invalid JSON disables sending.
    await page.getByLabel('JSON body').fill('{ "broken": ');
    await expect(page.getByText(/^Invalid JSON/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();

    await page.getByRole('button', { name: /500 Server error/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/^500 Simulated server failure/)).toBeVisible();
    await page.getByRole('radio', { name: 'Errors' }).click();
    await expect(page.getByRole('table', { name: 'Network requests' })).toContainText('/demo/echo?fail=1');
  });

  test('a slow request can be cancelled exactly once', async ({ page }) => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('button', { name: /Slow request/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/Waiting for the server/)).toBeVisible();
    await page.getByRole('button', { name: /^Cancel/ }).click();
    await expect(page.getByText('Request cancelled. fetch() rejected with AbortError.')).toBeVisible();
    await page.waitForTimeout(2000); // longer than the server delay: nothing else may be sent
    const rows = page.getByRole('table', { name: 'Network requests' }).locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('cancelled');
  });

  test('shows the app\'s own AJAX traffic', async ({ page }) => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('radio', { name: 'All app traffic' }).click();
    await expect(page.getByRole('table', { name: 'Network requests' })).toContainText('/auth/me');
  });
});

test.describe('Canvas Studio', () => {
  async function surfaceBox(page) {
    const surface = page.locator('canvas[aria-hidden="true"]');
    await surface.scrollIntoViewIfNeeded();
    return surface.boundingBox();
  }
  async function drag(page, from, to) {
    const box = await surfaceBox(page);
    const pt = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...pt(from));
    await page.mouse.down();
    await page.mouse.move(...pt(to), { steps: 10 });
    await page.mouse.up();
  }
  const pixel = (page, fx, fy) => page.evaluate(([x, y]) => {
    const c = document.querySelector('canvas[role="img"]');
    if (!c) return null; // page still loading
    const d = window.devicePixelRatio || 1;
    return Array.from(c.getContext('2d').getImageData(Math.round(960 * x * d), Math.round(600 * y * d), 1, 1).data);
  }, [fx, fy]);

  test('draws shapes with pointer events, undoes, redoes and clears', async ({ page }) => {
    await page.goto('/lab/canvas-studio');
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await page.getByRole('checkbox', { name: 'Fill shapes' }).check();
    await page.getByRole('button', { name: 'Colour #22c55e' }).click();
    await drag(page, [0.2, 0.2], [0.5, 0.6]);
    expect(await pixel(page, 0.35, 0.4)).toEqual([34, 197, 94, 255]); // #22c55e

    await page.getByRole('radio', { name: /Pencil/ }).click();
    await drag(page, [0.6, 0.6], [0.9, 0.8]);
    const history = page.getByRole('list', { name: 'Operation history' });
    await expect(history).toContainText('1. Rectangle (filled)');
    await expect(history).toContainText('2. Pencil stroke');
    await expect(page.getByRole('list', { name: 'Recent pointer events' })).toContainText('pointerup');

    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    expect(await pixel(page, 0.35, 0.4)).toEqual([0, 0, 0, 0]); // undone: transparent again
    await page.keyboard.press('Control+y');
    expect(await pixel(page, 0.35, 0.4)).toEqual([34, 197, 94, 255]);

    await page.getByRole('button', { name: 'Clear' }).click();
    expect(await pixel(page, 0.35, 0.4)).toEqual([0, 0, 0, 0]);
    await page.keyboard.press('Control+z'); // clearing is undoable too
    expect(await pixel(page, 0.35, 0.4)).toEqual([34, 197, 94, 255]);
  });

  test('saves the drawing as a project and reopens it', async ({ page }) => {
    await page.goto('/lab/canvas-studio');
    await page.getByRole('radio', { name: /Circle/ }).click();
    await page.getByRole('checkbox', { name: 'Fill shapes' }).check();
    await page.getByRole('button', { name: 'Colour #ef4444' }).click();
    await drag(page, [0.5, 0.5], [0.6, 0.5]);
    await expect(page.getByRole('heading', { name: 'Canvas API calls' })).toBeVisible();
    await expect(page.locator('pre').last()).toContainText('ctx.arc(480, 300, 96, 0, Math.PI * 2);');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByLabel('Drawing name').fill(`E2E project canvas ${Date.now()}`);
    await page.getByRole('button', { name: 'Save drawing' }).click();
    await expect(page).toHaveURL(/project=\d+/);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.reload();
    await expect.poll(() => pixel(page, 0.5, 0.5)).toEqual([239, 68, 68, 255]); // #ef4444 restored from PNG
    await shot(page, '43-canvas');
    await deleteProject(page, projectIdFrom(page));
  });
});
