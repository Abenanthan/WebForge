import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

test.describe('Component Studio', () => {
  test('inspects the live component tree: props, state, family and render reasons', async ({ page }) => {
    await page.goto('/lab/component-studio');
    const tree = page.getByRole('tree', { name: 'React component tree' });
    for (const name of ['<App>', '<Header>', '<Sidebar>', '<Dashboard>', '<Footer>']) {
      await expect(tree.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(tree.getByText('<Card>', { exact: true })).toHaveCount(3);

    // Props of a Card
    await tree.getByText('<Card>', { exact: true }).first().click();
    const inspector = page.getByRole('region', { name: 'Inspector' });
    await expect(inspector).toContainText('label"Students"');
    await expect(inspector).toContainText('Parent: <Dashboard>');

    // Its own state changes → "state changed"
    await page.getByRole('button', { name: 'Details' }).first().click();
    await expect(inspector).toContainText('expandedtrue');
    await expect(inspector).toContainText('state changed: expanded');

    // State owned by Dashboard, passed down as props to Table
    await page.getByRole('button', { name: 'Students', exact: true }).click();
    await page.getByPlaceholder('Type a name…').fill('arj'); // only Arjun matches → rows change
    await tree.getByText('<Dashboard>', { exact: true }).click();
    await expect(inspector).toContainText('query"arj"');
    await expect(page.getByRole('list', { name: 'Render log' })).toContainText('props changed: rows');
  });

  test('React.memo stops the Footer from re-rendering when its props are unchanged', async ({ page }) => {
    await page.goto('/lab/component-studio');
    await page.getByRole('button', { name: 'Students', exact: true }).click();
    await page.getByLabel(/Wrap Footer in/).check();
    const log = page.getByRole('list', { name: 'Render log' });
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByPlaceholder('Type a name…').fill('ra');
    await expect(log).toContainText('state changed: query');
    await expect(log).not.toContainText('<Footer>');
    await expect(page.getByRole('tree', { name: 'React component tree' }).getByText('memo')).toBeVisible();
  });

  test('JSX playground: JSX → createElement → element → UI, with safety checks', async ({ page }) => {
    await page.goto('/lab/component-studio/jsx?example=lists');
    await expect(page.getByLabel('Compiled JavaScript')).toContainText('React.createElement(\n  "ul"');
    await expect(page.getByLabel('Rendered output')).toContainText('CS302: Databases');
    await expect(page.getByRole('tree', { name: 'React element tree' })).toContainText('key: "CS301"');

    // Editing to something unsafe is rejected before anything runs.
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('<p>{window.location.href}</p>');
    await expect(page.getByRole('alert')).toContainText('`window` is not available in this example');
    await expect(page.getByRole('list', { name: 'JSX pipeline' })).toContainText('compile error');

    // Events with real state
    await page.goto('/lab/component-studio/jsx?example=events');
    await page.getByRole('button', { name: '+1' }).click();
    await page.getByRole('button', { name: '+1' }).click();
    await expect(page.getByLabel('Rendered output')).toContainText('Clicked 2 times');
  });

  test('props visualizer: data flows down, callbacks flow up', async ({ page }) => {
    await page.goto('/lab/component-studio/props');
    await page.getByLabel('name (state)').fill('Kavya');
    await expect(page.getByText('👤 Kavya')).toBeVisible();
    const flow = page.getByRole('list', { name: 'Data-flow log' });
    await expect(flow).toContainText('setName("Kavya") → name flows to <ProfileCard>');

    await page.getByRole('button', { name: 'Add 2 credits' }).click();
    await expect(page.getByText('20 credits')).toBeVisible();
    await expect(flow).toContainText('<CreditCounter> called onAdd(2) → parent setCredits(20)');
    await expect(flow).toContainText('level becomes "Third year"');

    // The memoised child never re-rendered.
    await expect(page.getByText('rendered 1× (React.memo)')).toBeVisible();
  });
});
