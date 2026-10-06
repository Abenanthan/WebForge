import { networkLog } from './networkLog.js';

/**
 * Single gateway to the PHP API.
 *  - Same-origin /api requests with the session cookie
 *  - Attaches X-CSRF-Token on mutating requests (refreshes it once if rejected)
 *  - Attaches X-Trace-Id so client and server spans share one trace
 *  - Unwraps the { ok, data, error, meta } envelope; throws ApiError on failure
 *  - Records every request/response in networkLog
 */

// '/api' in development and preview (proxied by Vite); '/webforge/api' in the Apache build (base /webforge/).
export const API_BASE = `${import.meta.env.BASE_URL}api`;
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const AUTH_LOST_CODES = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED']);

let csrfToken = null;
const unauthorizedListeners = new Set();

export function setCsrfToken(token) {
  csrfToken = token;
}

/** Notified when a protected call reports the session is gone (401). */
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

export class ApiError extends Error {
  constructor({ status, code, message, fields = {}, meta = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.meta = meta;
  }
}

export function newTraceId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function refreshCsrf() {
  const res = await fetch(`${API_BASE}/auth/csrf`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const json = await res.json();
  csrfToken = json?.data?.csrfToken ?? null;
}

/**
 * Perform a request and return the full envelope { data, meta }.
 * @param {string} path  e.g. '/auth/login'
 * @param {{method?: string, body?: unknown, signal?: AbortSignal, traceId?: string, source?: string}} [options]
 */
export async function apiRequest(path, options = {}, isRetry = false) {
  const method = (options.method ?? 'GET').toUpperCase();
  const { trace } = options; // optional TraceBus trace: records network + server spans
  const traceId = options.traceId ?? trace?.id ?? newTraceId();
  const url = `${API_BASE}${path}`;

  const headers = { Accept: 'application/json', 'X-Trace-Id': traceId };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!SAFE_METHODS.has(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const logId = `${traceId}${isRetry ? ':retry' : ''}`;
  const startedAt = performance.now();
  networkLog.start({
    id: logId,
    traceId,
    method,
    url,
    source: options.source ?? 'app',
    startedAt: Date.now(),
    request: {
      // Never show the CSRF token value in the inspector UI.
      headers: { ...headers, ...(headers['X-CSRF-Token'] ? { 'X-CSRF-Token': '•••• (session token)' } : {}) },
      body: options.body ?? null,
    },
  });

  const span = trace?.begin('network', `HTTP ${method} ${url}`, {
    method,
    url,
    headers: { ...headers, ...(headers['X-CSRF-Token'] ? { 'X-CSRF-Token': '•••• (session token)' } : {}) },
    body: options.body ?? null,
    ...(isRetry ? { retry: 'sent again with a fresh CSRF token' } : {}),
  });

  let res;
  let json = null;
  let size = 0;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
    const text = await res.text();
    size = new TextEncoder().encode(text).length;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    networkLog.finish(logId, {
      state: aborted ? 'aborted' : 'error',
      durationMs: performance.now() - startedAt,
      error: aborted ? 'Request aborted' : 'Network error — is the API server running?',
    });
    span?.end({ status: 'error', detail: { error: aborted ? 'aborted' : 'network error' } });
    if (aborted) throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check that Apache is running.' });
  }

  const durationMs = performance.now() - startedAt;
  if (trace) {
    const to = performance.now();
    const failed = !(res.ok && json?.ok);
    span.end({ status: failed ? 'error' : 'success', detail: { status: res.status } });
    trace.addServer(json?.meta, { from: span.from, to });
    trace.record('network', `Response ${res.status} ${res.statusText}`.trim(), {
      from: to,
      status: failed ? 'error' : 'success',
      detail: { status: res.status, size, headers: Object.fromEntries(res.headers.entries()), body: json && { ok: json.ok, data: json.data, error: json.error } },
    });
  }
  networkLog.finish(logId, {
    state: res.ok && json?.ok ? 'success' : 'error',
    status: res.status,
    statusText: res.statusText,
    durationMs,
    size,
    response: {
      headers: Object.fromEntries(res.headers.entries()),
      body: json,
    },
  });

  if (!json || typeof json.ok !== 'boolean') {
    throw new ApiError({ status: res.status, code: 'BAD_RESPONSE', message: `Unexpected response from server (HTTP ${res.status}).` });
  }

  if (!json.ok) {
    const { code, message, fields } = json.error ?? {};
    if (res.status === 403 && code === 'CSRF_INVALID' && !isRetry) {
      await refreshCsrf();
      return apiRequest(path, { ...options, traceId }, true);
    }
    // Only the app's own authentication codes mean "your WebForge session is gone". Labs return
    // 401 for their own reasons (e.g. the Session Demonstrator's separate login), which must
    // not log the user out of WebForge.
    if (res.status === 401 && AUTH_LOST_CODES.has(code) && !path.startsWith('/auth/')) {
      for (const fn of unauthorizedListeners) fn(code);
    }
    throw new ApiError({ status: res.status, code, message, fields: fields ?? {}, meta: json.meta });
  }

  return { data: json.data, meta: json.meta };
}

/** Convenience helpers that return only `data`. */
export const api = {
  get: (path, opts) => apiRequest(path, { ...opts, method: 'GET' }).then((r) => r.data),
  post: (path, body, opts) => apiRequest(path, { ...opts, method: 'POST', body }).then((r) => r.data),
  put: (path, body, opts) => apiRequest(path, { ...opts, method: 'PUT', body }).then((r) => r.data),
  patch: (path, body, opts) => apiRequest(path, { ...opts, method: 'PATCH', body }).then((r) => r.data),
  delete: (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' }).then((r) => r.data),
};
