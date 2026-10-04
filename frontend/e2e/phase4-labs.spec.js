import { expect, test } from '@playwright/test';

const SHOTS = process.env.WEBFORGE_SCREENSHOTS;
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

test.describe('JS Playground', () => {
  test('traces a real execution and steps through it', async ({ page }) => {
    await page.goto('/lab/js-playground?topic=conditions');
    const timeline = page.getByRole('list', { name: 'Execution timeline' });
    await expect(timeline).toContainText('marks = 72');
    await expect(timeline).toContainText('marks >= 90 → false');
    await expect(timeline).toContainText('marks >= 60 → true');
    await expect(timeline).toContainText('grade = "C"');

    await page.getByRole('button', { name: 'Last step' }).click();
    await expect(page.getByRole('complementary', { name: 'Variables at this step' })).toContainText('grade');
    await page.getByRole('button', { name: 'First step' }).click();
    await expect(page.getByText(/^Step 1 \//)).toBeVisible();
    await expect(page.locator('.cm-traceLine')).toHaveCount(1);

    await page.getByRole('tab', { name: /^Output/ }).click();
    await expect(page.getByRole('list', { name: 'Program output' })).toContainText('marks 72 → grade C');
    await shot(page, '30-js-playground');
  });

  test('reports runtime errors with their line', async ({ page }) => {
    await page.goto('/lab/js-playground?topic=variables');
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('const a = 1;\nconsole.log(a);\nmissingFunction();\n');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const errors = page.getByRole('list', { name: 'Errors' });
    await expect(errors).toContainText('missingFunction is not defined');
    await expect(errors.getByRole('button', { name: /line 3/ })).toBeVisible();
  });
});

test.describe('DOM Explorer', () => {
  test('selects, inspects and mutates elements, logging the JavaScript and mutations', async ({ page }) => {
    await page.goto('/lab/dom-explorer');
    const tree = page.getByRole('tree', { name: 'DOM tree' });
    await expect(tree).toContainText('main#app');

    // Pick an element by clicking it inside the live page.
    await page.getByRole('button', { name: 'Pick element' }).click();
    const frame = page.frameLocator('iframe[title="Document being inspected"]');
    await frame.getByRole('heading', { name: 'Campus Events' }).click();
    const inspector = page.getByRole('region', { name: 'Inspector' });
    await expect(inspector).toContainText('<h1#title>');
    await expect(inspector).toContainText('#title');

    await inspector.getByLabel('Text content').fill('Tech Fest');
    await inspector.getByRole('button', { name: 'Set textContent' }).click();
    await expect(frame.getByRole('heading', { name: 'Tech Fest' })).toBeVisible();

    await inspector.getByLabel('CSS property').fill('color');
    await inspector.getByLabel('Value').fill('rgb(250, 204, 21)');
    await inspector.getByRole('button', { name: 'Apply' }).click();
    await expect(frame.getByRole('heading', { name: 'Tech Fest' })).toHaveCSS('color', 'rgb(250, 204, 21)');

    const log = page.getByRole('list', { name: 'DOM change log' });
    await expect(log).toContainText('element.textContent = "Tech Fest";');
    await expect(log).toContainText('element.style.color = "rgb(250, 204, 21)";');
    await expect(log).toContainText('caused by your action');

    // A page script changing the DOM is also observed.
    await frame.getByRole('button', { name: 'Add event' }).click();
    await expect(log).toContainText('caused by page script');
    await expect(log).toContainText('added li.event');
    await shot(page, '31-dom-explorer');
  });

  test('opens the current Web Playground page via "Inspect DOM"', async ({ page }) => {
    await page.goto('/lab/web-playground');
    await page.getByLabel('Start from a template').selectOption('todo');
    const discard = page.getByRole('button', { name: 'Discard changes' });
    if (await discard.isVisible().catch(() => false)) await discard.click();
    await page.getByRole('button', { name: 'Inspect DOM' }).click();
    await expect(page).toHaveURL(/dom-explorer/);
    await expect(page.getByRole('tree', { name: 'DOM tree' })).toContainText('ul#todo-list');
  });
});

test.describe('Event Visualizer', () => {
  test('records the full flow of a click with real data', async ({ page }) => {
    await page.goto('/lab/event-visualizer');
    await page.getByRole('button', { name: 'Click me' }).click();
    const flow = page.getByRole('list', { name: 'Event flow' });
    await expect(flow).toContainText('PointerEvent "click"');
    await expect(flow).toContainText('updateCounter(1) → "Clicked 1 time"');
    await expect(flow).toContainText('1 mutation');
    await expect(flow).toContainText('next frame painted');

    await flow.getByRole('button', { name: /Event listener/ }).click();
    const details = page.getByRole('region', { name: 'Step details' });
    await expect(details).toContainText("button#ev-button.addEventListener('click', handleClick)");
    await expect(page.getByRole('list', { name: 'Propagation path' })).toContainText('window');

    await flow.getByRole('button', { name: /DOM changed/ }).click();
    // textContent replaces the text node, so the browser records a childList mutation.
    await expect(details).toContainText('added "Clicked 1 time"; removed "Clicked 0 times"');
  });

  test('form submit, keyboard and change events reach history', async ({ page }) => {
    await page.goto('/lab/event-visualizer');
    await page.getByLabel('Type here').pressSequentially('Hi'); // real key presses → keydown, input, keyup
    await expect(page.locator('#ev-mirror')).toHaveText('Hi');
    await page.getByLabel('Name').fill('Al');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Hello, Al!')).toBeVisible();
    await page.getByLabel('Colour').selectOption('teal');
    await page.getByLabel('I accept the terms').check();
    await expect(page.locator('#ev-terms-note')).toHaveText('Terms accepted ✓');

    const history = page.locator('table').last();
    for (const type of ['submit', 'keydown', 'keyup', 'input', 'change']) {
      await expect(history.getByRole('button', { name: type, exact: true }).first()).toBeVisible();
    }
    await shot(page, '32-event-visualizer');
  });
});

test.describe('Form Validation Lab', () => {
  test('client validation blocks invalid data before any request', async ({ page }) => {
    await page.goto('/lab/form-lab');
    await page.getByRole('button', { name: 'Invalid data' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    const flow = page.getByRole('list', { name: 'Form submission flow' });
    await expect(flow).toContainText('request blocked');
    await expect(flow).toContainText('not sent: the browser stopped it');
    await expect(page.getByText('(browser)').first()).toBeVisible();
  });

  test('with client validation off, the server rejects the same data (422)', async ({ page }) => {
    await page.goto('/lab/form-lab');
    await page.getByRole('button', { name: 'Invalid data' }).click();
    await page.getByLabel('Client-side validation').setChecked(false, { force: true });
    await page.getByRole('button', { name: 'Submit' }).click();
    const flow = page.getByRole('list', { name: 'Form submission flow' });
    await expect(flow).toContainText('HTTP 422 VALIDATION_FAILED');
    await expect(page.getByText('(server)').first()).toBeVisible();
    await flow.getByRole('button', { name: /Server response/ }).click();
    await expect(page.getByRole('region', { name: 'Step details' })).toContainText('Unprocessable Content');
  });

  test('server-only rules: data that passes the browser can still fail on the server', async ({ page }) => {
    await page.goto('/lab/form-lab');
    await page.getByRole('button', { name: 'Passes client, fails server' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByText('This username is reserved.')).toBeVisible();
    const flow = page.getByRole('list', { name: 'Form submission flow' });
    await flow.getByRole('button', { name: /Database check/ }).click();
    await expect(page.getByRole('region', { name: 'Step details' })).toContainText('SELECT 1 AS taken FROM users WHERE email = ?');
    await shot(page, '33-form-lab');
  });

  test('valid data passes both sides', async ({ page }) => {
    await page.goto('/lab/form-lab');
    await page.getByRole('button', { name: 'Valid data', exact: true }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'All fields passed server-side validation' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Form submission flow' })).toContainText('HTTP 200 OK');
  });
});
