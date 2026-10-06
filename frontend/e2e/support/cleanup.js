/**
 * Delete a project created by a test, through the real API, using the page's own
 * session cookie and CSRF token (so tests leave the demo account as they found it).
 */
export async function deleteProject(page, projectId) {
  const status = await page.evaluate(async (id) => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()).data.csrfToken;
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } });
    return res.status;
  }, projectId);
  if (status !== 200) throw new Error(`Could not delete test project ${projectId} (HTTP ${status})`);
}

/** The ?project=<id> of the current URL. */
export const projectIdFrom = (page) => Number(new URL(page.url()).searchParams.get('project'));
