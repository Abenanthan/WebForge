import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@webforge.local');
  await page.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
});

test.describe('Projects', () => {
  test('creates, opens, renames, filters and deletes a project', async ({ page }) => {
    const title = `P10 web ${Date.now()}`;
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Description (optional)').fill('Made by the Phase 10 test');
    await dialog.getByRole('button', { name: 'Create and open' }).click();

    // Opens in the Web Playground with the starter template
    await expect(page).toHaveURL(/\/lab\/web-playground\?project=\d+$/);
    await expect(page.getByText(`Created "${title}".`)).toBeVisible();

    await page.goto('/projects');
    await page.getByLabel('Search projects').fill(title);
    const card = page.getByRole('list', { name: 'Projects' }).locator('li');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Made by the Phase 10 test');
    await expect(card).toContainText('3 files');

    await page.getByRole('button', { name: `Rename ${title}` }).click();
    await dialog.getByLabel('Title').fill(`${title} renamed`);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Project updated.')).toBeVisible();
    await expect(card).toContainText(`${title} renamed`);

    await page.getByRole('radio', { name: /^Canvas/ }).click();
    await expect(page.getByText('No projects match')).toBeVisible();
    await page.getByRole('radio', { name: /^Web/ }).click();
    await expect(card).toHaveCount(1);

    await page.getByRole('button', { name: `Delete ${title} renamed` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(`Deleted "${title} renamed".`)).toBeVisible();
    await expect(page.getByText('No projects match')).toBeVisible();
  });

  test('saves a JSX Playground example as a project and reopens it', async ({ page }) => {
    const title = `P10 jsx ${Date.now()}`;
    await page.goto('/lab/component-studio/jsx?example=lists');
    await page.getByRole('button', { name: 'Save as project' }).click();
    await page.getByRole('dialog').getByLabel('Title').fill(title);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`Project ${title} · saved`)).toBeVisible();
    await expect(page).toHaveURL(/example=lists&project=\d+/);

    await page.goto('/projects');
    await page.getByRole('radio', { name: /^JSX/ }).click();
    await page.getByLabel('Search projects').fill(title);
    await page.getByRole('button', { name: 'Open in JSX Playground' }).click();
    await expect(page.getByText(`Project ${title} · saved`)).toBeVisible();
    await expect(page.getByRole('tab', { name: /list/i, selected: true })).toBeVisible();

    // Clean up
    await page.goto('/projects');
    await page.getByLabel('Search projects').fill(title);
    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(`Deleted "${title}".`)).toBeVisible();
  });
});

test.describe('Learn & Assess', () => {
  test('a lab links to its quiz; a perfect attempt is graded on the server', async ({ page }) => {
    await page.goto('/lab/js-playground');
    await page.getByRole('link', { name: 'Take the quiz' }).click();
    await expect(page).toHaveURL(/\/learn\/quiz\/javascript-core$/);
    await expect(page.getByRole('heading', { name: 'JavaScript Core' })).toBeVisible();

    const next = () => page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Your answer').fill('object'); await next();
    await page.getByLabel('Your answer').fill('"123"'); await next(); // quotes are ignored
    await page.getByRole('radio', { name: '0 == ""', exact: true }).check(); await next();
    await page.getByRole('radio', { name: 'A const variable cannot be reassigned' }).check(); await next();
    await page.getByLabel('Your answer').fill('[20, 40]'); await next();
    await page.getByRole('radio', { name: 'False' }).check(); await next();
    await page.getByLabel('map').selectOption('New array of transformed items');
    await page.getByLabel('filter').selectOption('New array of matching items');
    await page.getByLabel('find').selectOption('First matching element');
    await page.getByLabel('reduce').selectOption('Single accumulated value');
    await expect(page.getByText('7 of 7 answered')).toBeVisible();
    await page.getByRole('button', { name: 'Submit answers' }).click();

    await expect(page).toHaveURL(/\/learn\/attempts\/\d+$/);
    await expect(page.getByText('7 / 7')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Score 100%' })).toBeVisible();
    await expect(page.getByText('Perfect score.', { exact: false })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recommended labs' })).toHaveCount(0);

    // Progress reflects the latest answers
    await page.getByRole('link', { name: 'Progress' }).click();
    const js = page.getByRole('list', { name: 'JavaScript concepts' }).locator('li', { hasText: 'JavaScript Fundamentals' });
    await expect(js).toContainText('Quiz 4/4 correct');

    // History lists the attempt and links back to it
    await page.getByRole('link', { name: 'History' }).click();
    await page.getByRole('radio', { name: 'Assessments' }).click();
    const first = page.getByRole('list', { name: 'Activity' }).locator('li').first();
    await expect(first).toContainText('JavaScript Core');
    await expect(first).toContainText('score 7/7');
    await first.getByRole('link', { name: 'JavaScript Core' }).click();
    await expect(page.getByText('7 / 7')).toBeVisible();
  });

  test('unanswered questions need confirmation and wrong answers recommend labs', async ({ page }) => {
    await page.goto('/learn');
    await page.getByRole('link', { name: /^(Start|Retake) HTML & CSS Fundamentals$/ }).click();
    await page.getByRole('radio', { name: '<section>' }).check();
    await page.getByRole('button', { name: 'Question 6' }).click();
    await page.getByRole('button', { name: 'Submit answers' }).click();

    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('5 questions are unanswered and will be marked wrong.');
    await confirm.getByRole('button', { name: 'Submit anyway' }).click();

    await expect(page.getByText('0 / 6')).toBeVisible();
    const recommended = page.getByRole('list', { name: 'Recommended labs' });
    await expect(recommended).toContainText('HTML Document Structure');
    await expect(recommended).toContainText('CSS Selectors & Styling');
    const review = page.getByRole('list', { name: 'Answer review' });
    await expect(review.locator('li').first()).toContainText('<section>');
    await expect(review.locator('li').first()).toContainText('<main>'); // the correct answer is shown
    await expect(review.getByText('not answered')).toHaveCount(5);

    await recommended.getByRole('link', { name: 'Open the lab →' }).first().click();
    await expect(page).toHaveURL(/\/lab\/web-playground$/);
  });
});
