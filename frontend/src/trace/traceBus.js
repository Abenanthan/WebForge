import { api, ApiError, newTraceId } from '../services/apiClient.js';

/**
 * TraceBus: records one operation as a list of timed spans across layers.
 *
 *   const trace = createTrace({ module: 'execution-trace', label: 'Submit form' });
 *   trace.step('event', 'submit event', { type: 'submit' });
 *   const span = trace.begin('validation', 'Client-side validation');
 *   …; span.end({ detail: { errors } });
 *   await apiRequest('/lab/db/contacts', { method: 'POST', body, trace }); // adds network + server spans
 *   trace.finish('success');
 *
 * Times are milliseconds from the trace start (performance.now() timebase).
 * Subscribers are notified on every new span, so a UI can show a trace while it is recorded.
 */

export const LAYERS = ['ui', 'event', 'validation', 'state', 'render', 'dom', 'router', 'network', 'server', 'database'];
const MAX_DETAIL_CHARS = 12000;

const round = (n) => Math.round(n * 100) / 100;

/** Keep span details small enough to store (the server accepts 16 KB per step). */
export function clipDetail(detail) {
  if (detail == null) return undefined;
  let json;
  try {
    json = JSON.stringify(detail);
  } catch {
    return { note: 'detail could not be serialised' };
  }
  if (json === undefined) return undefined;
  if (json.length <= MAX_DETAIL_CHARS) return JSON.parse(json);
  return { truncated: true, note: `Detail was ${json.length} characters; the first ${MAX_DETAIL_CHARS} are kept.`, preview: json.slice(0, MAX_DETAIL_CHARS) };
}

export function createTrace({ module, label, startedAt = performance.now(), id = newTraceId() }) {
  const listeners = new Set();
  const steps = [];
  let status = 'recording';

  const emit = () => {
    for (const fn of listeners) fn(trace);
  };
  const offset = (t) => round(Math.max(0, t - startedAt));

  function push(step) {
    steps.push({ status: 'success', ...step, detail: clipDetail(step.detail) });
    emit();
    return step;
  }

  const trace = {
    id,
    module,
    label,
    startedAt,
    get steps() {
      return steps;
    },
    get status() {
      return status;
    },

    /** Record a span that has already happened (absolute performance.now() times). */
    record(layer, name, { from, to = from, detail, status: s = 'success' } = {}) {
      return push({ layer, name, startedMs: offset(from), durationMs: round(Math.max(0, to - from)), detail, status: s });
    },

    /** Record an instantaneous step happening now. */
    step(layer, name, detail, s = 'success') {
      const now = performance.now();
      return trace.record(layer, name, { from: now, detail, status: s });
    },

    /** Start a span now; call end() when it finishes. */
    begin(layer, name, detail) {
      const from = performance.now();
      let done = false;
      return {
        from,
        end({ detail: more, status: s = 'success', name: finalName } = {}) {
          if (done) return null;
          done = true;
          return trace.record(layer, finalName ?? name, { from, to: performance.now(), detail: more ? { ...detail, ...more } : detail, status: s });
        },
      };
    },

    /**
     * Merge the server's own spans (meta.trace) into this trace.
     * The server clock is separate, so its spans are placed inside the network span,
     * centred: the gap before and after is the network/HTTP overhead each way (an estimate).
     */
    addServer(meta, network) {
      if (!meta?.trace?.length || !network) return;
      const serverMs = meta.durationMs ?? 0;
      const roundTrip = network.to - network.from;
      const base = network.from + Math.max(0, (roundTrip - serverMs) / 2);
      for (const s of meta.trace) {
        push({
          layer: LAYERS.includes(s.layer) ? s.layer : 'server',
          name: s.name,
          startedMs: offset(base + s.startedMs),
          durationMs: round(s.durationMs),
          status: s.status === 'error' ? 'error' : 'success',
          detail: { ...s.detail, serverOffsetMs: s.startedMs },
        });
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Seal the trace and return a plain, ordered snapshot. */
    finish(final) {
      status = final ?? (steps.some((s) => s.status === 'error') ? 'error' : 'success');
      emit();
      traceBus.publish(trace.toJSON());
      return trace.toJSON();
    },

    toJSON() {
      const ordered = steps
        .map((s, i) => ({ ...s, i }))
        .sort((a, b) => a.startedMs - b.startedMs || a.i - b.i)
        .map(({ i, ...s }, n) => ({ ...s, seq: n + 1 }));
      const totalMs = ordered.reduce((m, s) => Math.max(m, s.startedMs + s.durationMs), 0);
      return { traceId: id, module, label, status: status === 'recording' ? 'success' : status, totalMs: round(totalMs), steps: ordered };
    },
  };
  return trace;
}

/** Store a finished trace. Resolves to the saved trace id (also when it was already saved). */
export async function saveTrace(snapshot) {
  try {
    await api.post('/traces', {
      traceId: snapshot.traceId,
      module: snapshot.module,
      label: snapshot.label.slice(0, 160),
      status: snapshot.status,
      steps: snapshot.steps.map(({ layer, name, startedMs, durationMs, status, detail }) => ({
        layer, name: name.slice(0, 120), startedMs, durationMs, status, ...(detail ? { detail } : {}),
      })),
    }, { source: 'execution-trace' });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'TRACE_EXISTS')) throw err;
  }
  return snapshot.traceId;
}

/**
 * Build a trace from a request recorded in networkLog (any API call made in this session).
 * Client spans: request sent → response received; server spans: from meta.trace.
 */
export function traceFromNetworkEntry(entry) {
  const t0 = 0;
  const trace = createTrace({
    id: entry.traceId,
    module: /^[a-z0-9-]{2,40}$/.test(entry.source ?? '') ? entry.source : 'api',
    label: `${entry.method} ${entry.url}`,
    startedAt: t0,
  });
  const end = entry.durationMs ?? 0;
  const body = entry.response?.body;
  trace.record('network', `HTTP ${entry.method} ${entry.url.replace(/\?.*/, '')}`, {
    from: 0,
    to: end,
    detail: { method: entry.method, url: entry.url, headers: entry.request?.headers, body: entry.request?.body ?? null },
  });
  trace.addServer(body?.meta, { from: 0, to: end });
  const failed = entry.state !== 'success';
  trace.record('network', `Response ${entry.status ?? entry.state}`, {
    from: end,
    detail: { status: entry.status, statusText: entry.statusText, size: entry.size, headers: entry.response?.headers, body },
    status: failed ? 'error' : 'success',
  });
  return trace.finish(failed ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// Session bus: traces finished in this browser tab (newest first).

const MAX_SESSION = 20;
let finished = [];
const busListeners = new Set();

export const traceBus = {
  publish(snapshot) {
    finished = [snapshot, ...finished.filter((t) => t.traceId !== snapshot.traceId)].slice(0, MAX_SESSION);
    for (const fn of busListeners) fn(finished);
  },
  getAll: () => finished,
  subscribe(fn) {
    busListeners.add(fn);
    return () => busListeners.delete(fn);
  },
};
