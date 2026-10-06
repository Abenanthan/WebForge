import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Regenerates the documentation screenshots in docs/screenshots/ from the real running app.
 *   npm run build && npm run preview        (with Apache + MySQL running)
 *   npm run screenshots
 * Each shot drives the page into a meaningful state first, exactly as a user would.
 */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots');
const failures = [];

// Tall pages use a taller window: full-page capture mis-draws the fixed sidebar and top bar.
async function snap(page, name, prepare, { height = 900 } = {}) {
  try {
    await page.setViewportSize({ width: page.viewportSize().width, height });
    await prepare();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // let animations settle
    await page.screenshot({ path: `${OUT}/${name}.png` });
  } catch (err) {
    failures.push(`${name}: ${err.message.split('\n')[0]}`);
  }
}

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
}

test.use({ viewport: { width: 1440, height: 900 } });

test('documentation screenshots', async ({ page }) => {
  test.setTimeout(600_000);
  await page.addInitScript(() => localStorage.setItem('webforge.theme', localStorage.getItem('webforge.theme') ?? 'light'));

  await snap(page, '00-login', () => page.goto('/login'));
  await login(page);

  await snap(page, '01-dashboard', () => page.goto('/'));

  await snap(page, '02-web-playground', async () => {
    await page.goto('/lab/web-playground');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
  });

  await snap(page, '03-js-playground', async () => {
    await page.goto('/lab/js-playground');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
  });

  await snap(page, '04-dom-explorer', async () => {
    await page.goto('/lab/dom-explorer');
    await page.getByRole('button', { name: 'Pick element' }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'Campus Events' }).click();
  });

  await snap(page, '05-event-visualizer', async () => {
    await page.goto('/lab/event-visualizer');
    await page.getByRole('button', { name: 'Click me' }).click();
  });

  await snap(page, '06-form-lab', async () => {
    await page.goto('/lab/form-lab');
    await page.getByRole('button', { name: 'Passes client, fails server' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('list', { name: /flow/i }).first()).toBeVisible();
  });

  await snap(page, '07-ajax-monitor', async () => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('button', { name: /Search the database/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/^200 1 item\(s\) returned from the database$/)).toBeVisible();
  });

  await snap(page, '08-canvas-studio', async () => {
    await page.goto('/lab/canvas-studio');
    const box = await page.locator('canvas[aria-hidden="true"]').boundingBox();
    const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
    const drag = async (from, to) => {
      await page.mouse.move(...at(...from));
      await page.mouse.down();
      await page.mouse.move(...at(...to), { steps: 12 });
      await page.mouse.up();
    };
    await page.getByRole('radio', { name: /Rectangle/ }).click();
    await drag([0.15, 0.2], [0.45, 0.6]);
    await page.getByRole('radio', { name: /Circle/ }).click();
    await page.getByRole('checkbox', { name: 'Fill shapes' }).check();
    await page.getByRole('button', { name: 'Colour #ef4444' }).click();
    await drag([0.68, 0.45], [0.8, 0.45]);
  });

  await snap(page, '09-server-lab', async () => {
    await page.goto('/lab/server-lab');
    await page.getByRole('button', { name: 'Run on server' }).click();
  });

  await snap(page, '10-database-lab', async () => {
    await page.goto('/lab/database-lab');
    await page.getByRole('button', { name: 'Run SELECT' }).click();
  });

  await snap(page, '11-component-studio', async () => {
    await page.goto('/lab/component-studio');
    await page.getByRole('tree', { name: 'React component tree' }).getByText('<Dashboard>', { exact: true }).click();
  });

  await snap(page, '12-jsx-playground', () => page.goto('/lab/component-studio/jsx?example=lists'));

  await snap(page, '13-state-visualizer', async () => {
    await page.goto('/lab/state-lab');
    await page.getByRole('button', { name: '+1', exact: true }).click();
    await page.getByRole('button', { name: 'setCount(c => c + 1) ×3' }).click();
    await page.waitForTimeout(1200); // flow animation
  });

  await snap(page, '14-hooks-lab', async () => {
    await page.goto('/lab/state-lab/hooks');
    await page.getByRole('radiogroup', { name: 'userId prop' }).getByRole('radio', { name: '2' }).click();
    await page.getByText('user 2 loaded').waitFor();
  });

  await snap(page, '15-routing-visualizer', async () => {
    await page.goto('/lab/routing-visualizer');
    const demo = page.getByRole('navigation', { name: 'Demo app' });
    await demo.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('link', { name: 'Stats' }).click();
    await page.waitForTimeout(1200);
  });

  await snap(page, '16-execution-trace-form', async () => {
    await page.goto('/trace/form');
    await page.getByRole('button', { name: 'Fill sample' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.getByText(/^Saved\. /).waitFor();
  }, { height: 1500 });

  await snap(page, '17-execution-trace-flow', async () => {
    await page.getByRole('link', { name: 'Open in the explorer' }).click();
    await page.getByRole('list', { name: 'Trace steps in order' }).getByRole('button', { name: /INSERT lab_contacts/ }).click();
  }, { height: 1500 });

  await snap(page, '18-execution-trace-waterfall', () => page.getByRole('tab', { name: 'Waterfall' }).click());

  await snap(page, '19-projects', () => page.goto('/projects'));

  await snap(page, '20-quiz', async () => {
    await page.goto('/learn/quiz/javascript-core');
    for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('map').selectOption('New array of transformed items');
    await page.getByLabel('filter').selectOption('New array of matching items');
  });

  await snap(page, '21-quiz-result', async () => {
    await page.goto('/learn/quiz/react-fundamentals');
    await page.getByRole('radio', { name: 'React.createElement calls' }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('radio', { name: 'False' }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Your answer').fill('2');
    await page.getByRole('button', { name: 'Question 7' }).click();
    await page.getByRole('button', { name: 'Submit answers' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit anyway' }).click();
    await page.getByRole('img', { name: /^Score/ }).waitFor();
  });

  await snap(page, '22-progress', () => page.goto('/learn/progress'));

  // Dark theme
  await page.evaluate(() => localStorage.setItem('webforge.theme', 'dark'));
  await snap(page, '23-dashboard-dark', () => page.goto('/'));
  await snap(page, '24-execution-trace-dark', () => page.goto('/trace'));

  // Phone
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => localStorage.setItem('webforge.theme', 'light'));
  await snap(page, '25-mobile-lab', () => page.goto('/lab/event-visualizer'));
  await snap(page, '26-mobile-menu', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
  });

  expect(failures, failures.join('\n')).toEqual([]);
});
