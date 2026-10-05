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

test.describe('Server Lab', () => {
  test('runs a fixed PHP experiment with validated input and shows steps, output and source', async ({ page }) => {
    await page.goto('/lab/server-lab?experiment=php-loops');
    await page.getByLabel(/Times table for/).fill('9');
    await page.getByLabel(/Rows/).fill('3');
    await page.getByRole('button', { name: 'Run on server' }).click();
    await expect(page.getByText('9 x 3 = 27')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'for: $i = 1 → $n * $i' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'The PHP that runs' })).toContainText('public function run(array $in, Steps $show): mixed');

    // Server-side validation of the input
    await page.getByLabel(/Rows/).fill('99');
    await page.getByRole('button', { name: 'Run on server' }).click();
    await expect(page.getByText('Rows must be between 1 and 12.')).toBeVisible();
    await shot(page, '50-server-experiments');
  });

  test('form processing escapes HTML and reports filter_var errors', async ({ page }) => {
    await page.goto('/lab/server-lab/form');
    await page.getByRole('button', { name: 'XSS attempt' }).click();
    await page.getByRole('button', { name: 'Submit to PHP' }).click();
    await expect(page.getByRole('cell', { name: /&lt;script&gt;alert/ })).toBeVisible();
    // The escaped page renders the tag as harmless text.
    await expect(page.frameLocator('iframe[title="Escaped response rendered"]').getByText('<script>alert("stolen cookies")</script>')).toBeVisible();

    await page.getByRole('button', { name: 'Invalid data' }).click();
    await page.getByRole('button', { name: 'Submit to PHP' }).click();
    await expect(page.getByText('filter_var(FILTER_VALIDATE_EMAIL) rejected this address.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Form processing stages' })).toContainText('3 error(s)');
    await shot(page, '51-server-form');
  });

  test('session lifecycle in a separate session that does not affect the real login', async ({ page }) => {
    await page.goto('/lab/server-lab/sessions');
    await page.getByRole('button', { name: 'Open the members-only page' }).click();
    await expect(page.getByText(/HTTP 401/).first()).toBeVisible();

    await page.getByLabel(/Your WebForge password/).fill('Demo@1234');
    await page.getByRole('button', { name: 'Log in to the lab session' }).click();
    await expect(page.getByText('logged in', { exact: true })).toBeVisible();
    await expect(page.getByText('session_regenerate_id(true)')).toBeVisible();

    await page.getByRole('button', { name: 'Open the members-only page' }).click();
    await expect(page.getByText(/Welcome back, Demo Student/)).toBeVisible();

    await page.getByLabel('Key').fill('course');
    await page.getByLabel('Value').fill('web-programming');
    await page.getByRole('button', { name: 'Save to $_SESSION' }).click();
    await expect(page.getByText('"web-programming"')).toBeVisible();

    await page.getByRole('button', { name: 'Log out and destroy the session' }).click();
    await expect(page.getByText('session_destroy()')).toBeVisible();
    await expect(page.getByText(/The session was destroyed/)).toBeVisible();
    await shot(page, '52-server-sessions');

    // The user's real WebForge session is untouched.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
  });

  test('file handling: create, append, overwrite, read and delete inside the sandbox', async ({ page }) => {
    const name = `e2e-${Date.now()}.txt`;
    await page.goto('/lab/server-lab/files');
    await page.getByLabel('File name').fill('../secrets.txt');
    await expect(page.getByText('Use letters, digits, - or _, ending in .txt')).toBeVisible();

    await page.getByLabel('File name').fill(name);
    await page.getByLabel('Initial content').fill('first line\n');
    await page.getByRole('button', { name: /^fopen\(/ }).click();
    const contents = page.getByLabel('File contents');
    await expect(contents).toHaveText('first line');

    await page.getByLabel('Text to write').fill('second line\n');
    await page.getByRole('button', { name: /^Append/ }).click();
    await expect(contents).toHaveText(/first line\s+second line/);
    await expect(page.getByText('fopen("' + name + '", "a")')).toBeVisible();

    await page.getByLabel('Text to write').fill('replaced');
    await page.getByRole('button', { name: /^Overwrite/ }).click();
    await expect(contents).toHaveText('replaced');
    await shot(page, '53-server-files');

    await page.getByRole('button', { name: 'unlink()' }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  });
});

test.describe('Database Lab', () => {
  test('SELECT, INSERT, UPDATE and DELETE with prepared statements', async ({ page }) => {
    await page.goto('/lab/database-lab');
    await page.getByRole('button', { name: 'Reset sample data' }).click();
    const sql = page.getByRole('region', { name: 'SQL executed' });
    await expect(sql).toContainText('INSERT INTO lab_contacts'); // the reset has finished
    const table = page.getByRole('table', { name: 'lab_contacts rows' });
    await expect(table.locator('tbody tr')).toHaveCount(5);

    // SELECT with a condition
    await page.getByLabel('City').selectOption('Chennai');
    await page.getByRole('button', { name: 'Run SELECT' }).click();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(sql).toContainText('AND city = ?');
    await expect(sql.getByRole('list', { name: 'Bound parameters' })).toContainText("'Chennai'");

    // SQL injection attempt is just data
    await page.getByLabel('City').selectOption('');
    await page.getByLabel('Name or email contains').fill("' OR 1=1 --");
    await page.getByRole('button', { name: 'Run SELECT' }).click();
    await expect(page.getByText('No rows match these conditions.')).toBeVisible();
    await page.getByLabel('Name or email contains').fill('');
    await page.getByRole('button', { name: 'Run SELECT' }).click();

    // INSERT
    await page.getByRole('tab', { name: 'INSERT' }).click();
    await page.getByLabel('Name *').fill('Kavya Sundar');
    await page.getByLabel('Email *').fill('kavya@example.com');
    await page.getByLabel('Age').fill('20');
    await page.getByLabel('City').fill('Madurai');
    await page.getByRole('button', { name: 'Run INSERT' }).click();
    await expect(table).toContainText('Kavya Sundar');
    await expect(sql).toContainText('lastInsertId');

    // UPDATE the inserted row
    await table.getByRole('radio', { name: 'Select Kavya Sundar' }).check();
    await page.getByRole('tab', { name: 'UPDATE' }).click();
    await page.getByLabel('City').fill('Coimbatore');
    await page.getByRole('button', { name: 'Run UPDATE' }).click();
    await expect(table).toContainText('Coimbatore');
    await expect(sql).toContainText('1 row(s) affected');
    await shot(page, '54-database-lab');

    // DELETE it
    await page.getByRole('tab', { name: 'DELETE' }).click();
    await page.getByRole('button', { name: 'Run DELETE' }).click();
    await expect(table).not.toContainText('Kavya Sundar');
    await expect(sql).toContainText('DELETE FROM lab_contacts');

    // Server-side validation on INSERT
    await page.getByRole('tab', { name: 'INSERT' }).click();
    await page.getByLabel('Name *').fill('X');
    await page.getByLabel('Email *').fill('nope');
    await page.getByRole('button', { name: 'Run INSERT' }).click();
    await expect(page.getByText('Email must be a valid email address.')).toBeVisible();
  });
});
