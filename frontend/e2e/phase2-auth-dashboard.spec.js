import { expect, test } from '@playwright/test';

const SHOTS = process.env.WEBFORGE_SCREENSHOTS; // optional folder for review screenshots

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function loginAsDemo(page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use the demo account' }).click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
}

test('anonymous visitor is redirected to login and sees client-side validation', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await shot(page, '01-login');

  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Email is required.')).toBeVisible();
  await expect(page.getByText('Password is required.')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
});

test('wrong password shows the server error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Wrong@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
});

test('demo login shows a dashboard built from real API data, then logs out', async ({ page }) => {
  await loginAsDemo(page);
  // Totals come from the API; the demo account may already have activity from other tests.
  await expect(page.getByText(/^\d+ \/ 36$/)).toBeVisible();
  await expect(page.getByText('API online')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Concept progress' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible();
  await shot(page, '02-dashboard');

  // Live modules are links; planned modules are listed but are not links.
  await expect(page.getByRole('link', { name: /Web Playground/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /State & Hooks/ })).toHaveCount(0);

  // Theme toggle flips the theme and the choice survives a reload.
  const html = page.locator('html');
  const initial = await html.getAttribute('data-theme');
  const other = initial === 'dark' ? 'light' : 'dark';
  await page.getByRole('button', { name: `Switch to ${other} theme` }).click();
  await expect(html).toHaveAttribute('data-theme', other);
  await shot(page, `03-dashboard-${other}`);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', other);
  await page.getByRole('button', { name: `Switch to ${initial} theme` }).click();
  await expect(html).toHaveAttribute('data-theme', initial);

  // Session survives reload
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');

  // Unknown route inside the app
  await page.goto('/does/not/exist');
  await expect(page.getByText('404: no route matches this path')).toBeVisible();

  // Logout
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('register validates on the client, then creates an account and logs in', async ({ page }) => {
  const email = `e2e.${Date.now()}@webforge.test`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Eve Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('weakpass');
  await page.getByLabel('Confirm password').fill('different');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Password needs:/)).toBeVisible();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await shot(page, '04-register-errors');

  await page.getByLabel('Password', { exact: true }).fill('Strong@123');
  await page.getByLabel('Confirm password').fill('Strong@123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Eve');

  // Same email again is rejected by the server (409) and shown on the field.
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Eve Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Strong@123');
  await page.getByLabel('Confirm password').fill('Strong@123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('This email is already registered.')).toBeVisible();
});

test('mobile layout: navigation opens as a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAsDemo(page);
  await shot(page, '05-mobile-dashboard');
  const nav = page.getByRole('navigation', { name: 'Modules' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav).toBeInViewport();
  await shot(page, '06-mobile-drawer');
  await page.keyboard.press('Escape');
  await expect(nav).not.toBeInViewport();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
