import { api } from './apiClient.js';

const MIN_INTERVAL_MS = 5000;
const lastLogged = new Map();

/**
 * Record that the user ran an experiment (dashboard stats + activity history).
 * Fire-and-forget and throttled per experiment, so it never blocks or spams.
 */
export function recordExperimentRun(slug, status, input) {
  const now = Date.now();
  if (now - (lastLogged.get(slug) ?? 0) < MIN_INTERVAL_MS) return;
  lastLogged.set(slug, now);
  api.post(`/experiments/${slug}/runs`, { status, input }, { source: 'activity' }).catch(() => {
    lastLogged.delete(slug); // allow a retry on the next run
  });
}
