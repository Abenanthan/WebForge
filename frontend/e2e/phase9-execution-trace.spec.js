import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

/** Keep the lab table under its 50-row quota between runs. */
async function resetContacts(page) {
  await page.goto('/lab/database-lab');
  await page.getByRole('button', { name: 'Reset sample data' }).click();
  await expect(page.getByText('Meera Pillai').first()).toBeVisible();
}

test.describe('Execution Trace: full-stack form', () => {
  test('records every layer of a real insert, saves it and opens it in the explorer', async ({ page }) => {
    await resetContacts(page);
    await page.goto('/trace/form');
    await page.getByRole('button', { name: 'Fill sample' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();

    await expect(page.getByText(/^Saved as row #\d+ in lab_contacts\.$/)).toBeVisible();
    await expect(page.locator('tr', { hasText: 'kavya.nair@example.com' })).toBeVisible();
    await expect(page.getByText(/^Saved\. /)).toBeVisible();

    const recorded = page.getByRole('list', { name: 'Recorded steps' });
    for (const name of ['User submitted the form', 'submit event → onSubmit handler', 'Client-side validation', "setState({ status: 'submitting' })",
      'HTTP POST /api/lab/db/contacts', 'Server-side validation', 'INSERT lab_contacts', 'Response 201 Created',
      "setState({ status: 'success' })", 'React re-rendered <FullStackForm>', 'New <tr> inserted into the table', 'Browser painted the update']) {
      await expect(recorded).toContainText(name);
    }

    // The server spans carry the real prepared statement and its bound values.
    await page.getByRole('list', { name: 'Trace steps in order' }).getByRole('button', { name: /INSERT lab_contacts/ }).click();
    await expect(page.getByText('SQL (prepared statement)')).toBeVisible();
    await expect(page.locator('pre', { hasText: 'INSERT INTO lab_contacts (user_id, name, email, age, city) VALUES (?, ?, ?, ?, ?)' })).toBeVisible();
    await expect(page.locator('li', { hasText: '?2' }).filter({ hasText: '"Kavya Nair"' })).toBeVisible(); // bound parameter

    // Saved: open it in the explorer
    await page.getByRole('link', { name: 'Open in the explorer' }).click();
    await expect(page).toHaveURL(/\/trace\?id=[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'Full-stack form: add "Kavya Nair"' })).toBeVisible();
    // Step count depends on the server work done (e.g. progress updates), so read it from the viewer.
    const stepsText = await page.getByText(/^\d+ steps$/).first().textContent();
    const total = Number(stepsText.split(' ')[0]);
    expect(total).toBeGreaterThanOrEqual(21);

    await page.getByRole('tab', { name: 'Waterfall' }).click();
    const timeline = page.getByRole('list', { name: 'Trace timeline' });
    await expect(timeline.locator('li')).toHaveCount(total);
    await timeline.getByRole('button', { name: /Response generated/ }).click();
    await expect(page.getByRole('heading', { level: 3 })).toContainText('Response generated');

    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { level: 3 })).toContainText(`${total} of ${total}`);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    expect((await download).suggestedFilename()).toMatch(/^trace-[0-9a-f-]{36}\.json$/);
  });

  test('client validation stops the request; skipping it lets the server reject the data', async ({ page }) => {
    await page.goto('/trace/form');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('Fix the highlighted fields. Nothing was sent to the server.')).toBeVisible();
    await expect(page.getByText('Name is required.')).toBeVisible();
    const recorded = page.getByRole('list', { name: 'Recorded steps' });
    await expect(recorded).toContainText('Error messages shown next to the fields');
    await expect(recorded).not.toContainText('HTTP POST');
    await expect(page.getByText(/^Saved\. /)).toBeVisible();

    await page.getByLabel('Name').fill('Ravi');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel(/Skip client-side validation/).check();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Some fields are invalid.' })).toBeVisible();
    await expect(page.getByText('Email must be a valid email address.')).toBeVisible();
    await expect(recorded).toContainText('Client-side validation skipped');
    await expect(recorded).toContainText('Server-side validation');
    await expect(recorded).toContainText('Response 422');
    await expect(page.getByText('error', { exact: true }).first()).toBeVisible();
  });
});

test.describe('Execution Trace: explorer', () => {
  test('traces any recent API request, filters by module and deletes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('API online')).toBeVisible();
    await page.getByRole('navigation', { name: 'Modules' }).getByRole('link', { name: /Execution Trace/ }).click();

    await page.getByRole('button', { name: 'Trace GET /api/stats/dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'GET /api/stats/dashboard', exact: true })).toBeVisible();
    const flow = page.getByRole('list', { name: 'Trace steps in order' });
    await expect(flow).toContainText('HTTP GET /api/stats/dashboard');
    await expect(flow).toContainText('Request received');
    await expect(flow).toContainText('Response 200');

    await page.getByLabel('Module', { exact: true }).selectOption('app');
    await expect(page.getByRole('list', { name: 'Saved traces' }).locator('li').first()).toContainText('GET /api/stats/dashboard');

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Trace deleted.')).toBeVisible();
  });

  test('the AJAX Monitor and the dashboard link into the explorer', async ({ page }) => {
    await page.goto('/lab/ajax-monitor');
    await page.getByRole('button', { name: /Search the database/ }).click();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText(/^200 1 item\(s\) returned from the database$/)).toBeVisible();
    await page.getByRole('link', { name: 'Open in Execution Trace →' }).click();

    await expect(page.getByRole('heading', { name: /^GET \/api\/demo\/concepts/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Trace steps in order' })).toContainText('SELECT');

    await page.goto('/');
    await page.getByRole('link', { name: /^GET \/api\/demo\/concepts/ }).first().click();
    await expect(page).toHaveURL(/\/trace\?id=/);
    await expect(page.getByRole('heading', { name: /^GET \/api\/demo\/concepts/ })).toBeVisible();
  });
});
