import { expect, test } from '@playwright/test';
import { deleteProject, projectIdFrom } from './support/cleanup.js';

const SHOTS = process.env.WEBFORGE_SCREENSHOTS;
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
}

async function openPlayground(page, template = 'starter') {
  await page.goto('/lab/web-playground');
  // Start from a known template (clears any local draft).
  const select = page.getByLabel('Start from a template');
  await select.selectOption(template);
  const discard = page.getByRole('button', { name: 'Discard changes' });
  if (await discard.isVisible().catch(() => false)) await discard.click();
}

const preview = (page) => page.frameLocator('iframe[title="Preview of index.html"]');

async function replaceFile(page, file, text) {
  await page.getByRole('tab', { name: new RegExp(`^${file.replace('.', '\\.')}`) }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('runs the starter page: live preview, console capture and events inside the sandbox', async ({ page }) => {
  await openPlayground(page);
  await expect(preview(page).getByRole('heading', { name: 'Hello, WebForge!' })).toBeVisible();
  await expect(page.getByLabel('Console output')).toContainText('script.js loaded');

  await preview(page).getByRole('button', { name: /Clicked 0 times/ }).click();
  await expect(preview(page).getByRole('button', { name: 'Clicked 1 time' })).toBeVisible();
  await expect(page.getByLabel('Console output')).toContainText('click #1');
  await shot(page, '10-playground');

  // Device emulation
  await page.getByRole('radio', { name: 'Mobile' }).click();
  await expect(page.getByText(/^375 × 667/)).toBeVisible();
  await page.getByRole('radio', { name: 'Responsive' }).click();
});

test('reports a syntax error with its location and jumps to it', async ({ page }) => {
  await openPlayground(page);
  await replaceFile(page, 'script.js', 'const ok = 1;\nconst broken = ;\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const problems = page.getByRole('list', { name: 'Problems' });
  await expect(problems).toContainText('SyntaxError: Unexpected token');
  await problems.getByRole('button', { name: 'script.js:2:16' }).click();
  await expect(page.locator('.cm-lintRange-error')).toBeVisible();
  await shot(page, '11-syntax-error');
});

test('stops an infinite loop instead of freezing the app', async ({ page }) => {
  await openPlayground(page);
  await replaceFile(page, 'script.js', 'let n = 0;\nwhile (true) { n++; }\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // The guard stops the loop after 1.5 s; the error reaches the console and the Problems tab.
  await expect(page.getByLabel('Console output')).toContainText('Potential infinite loop', { timeout: 10_000 });
  await page.getByRole('tab', { name: /^Problems/ }).click();
  await expect(page.getByRole('list', { name: 'Problems' })).toContainText('Potential infinite loop');
  await expect(page.getByRole('list', { name: 'Problems' }).getByRole('button', { name: /^script.js:2:/ })).toBeVisible();
});

test('sandbox isolation: no access to the parent page or the network', async ({ page }) => {
  await openPlayground(page);
  await replaceFile(page, 'script.js', [
    'try { console.log("parent:", window.parent.document.title); } catch (e) { console.log("parent blocked:", e.name); }',
    'try { console.log("cookie:", document.cookie); } catch (e) { console.log("cookie blocked:", e.name); }',
    'fetch("/api/projects").catch((e) => console.log("fetch failed:", e.name));',
  ].join('\n'));
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  const output = page.getByLabel('Console output');
  await expect(output).toContainText('parent blocked: SecurityError');
  await expect(output).toContainText('cookie blocked: SecurityError');
  await expect(output).toContainText('fetch failed: TypeError');
  await expect(output).toContainText('Network request (fetch/XHR/WebSocket) blocked');
});

test('debugging template: linking problems and a runtime error with its line', async ({ page }) => {
  await openPlayground(page, 'debugging');
  await page.getByRole('tab', { name: /^Problems/ }).click();
  const problems = page.getByRole('list', { name: 'Problems' });
  await expect(problems).toContainText('"styles.css" is linked from index.html but does not exist');
  await expect(problems).toContainText('style.css is not used');
  await expect(problems).toContainText('no <!DOCTYPE html>');
  await expect(problems).toContainText('totl is not defined');
  await expect(problems.getByRole('button', { name: /^script\.js:16:/ })).toBeVisible();
  await shot(page, '12-debugging');
});

test('save as project, reload it, and guard unsaved changes', async ({ page }) => {
  await openPlayground(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click(); // manual run → activity log

  const title = `E2E project ${Date.now()}`;
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as project' });
  await dialog.getByLabel('Project name').fill(title);
  await dialog.getByRole('button', { name: 'Save project' }).click();
  await expect(page).toHaveURL(/\?project=\d+/);
  const projectId = projectIdFrom(page);
  await expect(page.getByText(/^Saved (just now|.+ ago)$/)).toBeVisible();

  // Edit, save with Ctrl+S, reload: the change persists from the database.
  await replaceFile(page, 'index.html', '<!DOCTYPE html><html><body><h1>Persisted!</h1></body></html>');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.keyboard.press('Control+S');
  await expect(page.getByText(/^Saved (just now|.+ ago)$/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(preview(page).getByRole('heading', { name: 'Persisted!' })).toBeVisible();

  // Unsaved changes block in-app navigation.
  await replaceFile(page, 'style.css', 'h1 { color: red; }');
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/$/);

  // The dashboard reflects the saved project and the run.
  await expect(page.getByRole('region', { name: 'Recent projects' }).getByText(title)).toBeVisible();
  await expect(page.getByText('Run a web page in the live preview').first()).toBeVisible();
  await deleteProject(page, projectId);
});

test('compact layout switches between code, preview and output', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlayground(page);
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('radio', { name: 'Preview' }).click();
  await expect(preview(page).getByRole('heading', { name: 'Hello, WebForge!' })).toBeVisible();
  await page.getByRole('radio', { name: 'Output' }).click();
  await expect(page.getByLabel('Console output')).toContainText('script.js loaded');
  await shot(page, '13-playground-mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
