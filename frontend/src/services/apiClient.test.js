import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, apiRequest, onUnauthorized, setCsrfToken } from './apiClient.js';
import { networkLog } from './networkLog.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ok = (data, meta = {}) => ({ ok: true, data, error: null, meta: { traceId: 't', durationMs: 1, trace: [], ...meta } });
const fail = (code, message, fields = {}) => ({ ok: false, data: null, error: { code, message, fields }, meta: { trace: [] } });

describe('apiClient', () => {
  beforeEach(() => {
    setCsrfToken('token-1');
    networkLog.clear();
  });

  it('unwraps data and returns meta from the envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(ok({ hello: 'world' }, { durationMs: 12 })));
    const { data, meta } = await apiRequest('/health');
    expect(data).toEqual({ hello: 'world' });
    expect(meta.durationMs).toBe(12);
  });

  it('sends the CSRF token and a trace id on mutating requests only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(jsonResponse(ok(null))));
    await api.get('/x');
    await api.post('/y', { a: 1 });

    const getHeaders = fetchMock.mock.calls[0][1].headers;
    const postInit = fetchMock.mock.calls[1][1];
    expect(getHeaders['X-CSRF-Token']).toBeUndefined();
    expect(postInit.headers['X-CSRF-Token']).toBe('token-1');
    expect(postInit.headers['X-Trace-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(postInit.body).toBe('{"a":1}');
    expect(postInit.credentials).toBe('same-origin');
  });

  it('throws ApiError with per-field messages on validation failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(fail('VALIDATION_FAILED', 'Invalid', { email: 'Bad email' }), 422));
    const error = await api.post('/auth/login', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.fields).toEqual({ email: 'Bad email' });
  });

  it('refreshes an expired CSRF token once and retries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(fail('CSRF_INVALID', 'expired'), 403))
      .mockResolvedValueOnce(jsonResponse(ok({ csrfToken: 'token-2' })))
      .mockResolvedValueOnce(jsonResponse(ok({ saved: true })));

    await expect(api.post('/things', {})).resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers['X-CSRF-Token']).toBe('token-2');
  });

  it('notifies listeners when a protected endpoint returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(fail('SESSION_EXPIRED', 'expired'), 401));
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    await api.get('/stats/dashboard').catch(() => {});
    off();
    expect(listener).toHaveBeenCalledWith('SESSION_EXPIRED');
  });

  it('reports a network failure as a NETWORK_ERROR ApiError and logs it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await api.get('/health').catch((e) => e);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(networkLog.getAll()[0].state).toBe('error');
  });

  it('records request and response in the network log without exposing the CSRF token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(ok({ id: 1 }), 201));
    await api.post('/items', { name: 'x' });
    const [entry] = networkLog.getAll();
    expect(entry).toMatchObject({ method: 'POST', url: '/api/items', status: 201, state: 'success' });
    expect(entry.request.headers['X-CSRF-Token']).not.toBe('token-1');
    expect(entry.response.body.data).toEqual({ id: 1 });
  });
});
