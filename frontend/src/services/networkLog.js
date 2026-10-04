/**
 * In-memory log of every request made through apiClient.
 * Keeps the most recent entries and notifies subscribers on each change.
 * Read by the AJAX Monitor and the Execution Trace.
 */
const MAX_ENTRIES = 100;
let entries = [];
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(entries);
}

export const networkLog = {
  /** @returns {() => void} unsubscribe */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getAll() {
    return entries;
  },

  start(entry) {
    entries = [{ ...entry, state: 'pending' }, ...entries].slice(0, MAX_ENTRIES);
    emit();
  },

  finish(id, patch) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    emit();
  },

  clear() {
    entries = [];
    emit();
  },
};
