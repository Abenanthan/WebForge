import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, setCsrfToken } from '../services/apiClient.js';
import { clipDetail, createTrace, traceBus, traceFromNetworkEntry } from './traceBus.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createTrace', () => {
  let now;
  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  it('records spans relative to the trace start and orders them by start time', () => {
    const trace = createTrace({ module: 'execution-trace', label: 'test' });
    now = 1005;
    const span = trace.begin('validation', 'Validate');
    now = 1007.5;
    trace.step('event', 'Inner event');
    now = 1010;
    span.end({ detail: { passed: true } });
    trace.record('ui', 'Earlier click', { from: 1001 });

    const snap = trace.finish();
    expect(snap.steps.map((s) => [s.seq, s.name, s.startedMs, s.durationMs])).toEqual([
      [1, 'Earlier click', 1, 0],
      [2, 'Validate', 5, 5],
      [3, 'Inner event', 7.5, 0],
    ]);
    expect(snap.totalMs).toBe(10);
    expect(snap.status).toBe('success');
  });

  it('becomes an error trace when any step failed, and publishes to the session bus', () => {
    const trace = createTrace({ module: 'api', label: 'boom' });
    trace.step('server', 'Crash', null, 'error');
    const snap = trace.finish();
    expect(snap.status).toBe('error');
    expect(traceBus.getAll()[0].traceId).toBe(trace.id);
  });

  it('places server spans inside the network span, centred on the round trip', () => {
    const trace = createTrace({ module: 'api', label: 'merge' });
    // round trip 100 ms, server took 40 ms → 30 ms overhead each way
    trace.addServer({ durationMs: 40, trace: [{ layer: 'database', name: 'INSERT', startedMs: 10, durationMs: 5, status: 'success', detail: { sql: 'INSERT …' } }] },
      { from: 1000, to: 1100 });
    const [s] = trace.toJSON().steps;
    expect(s.startedMs).toBe(40);
    expect(s.layer).toBe('database');
    expect(s.detail).toEqual({ sql: 'INSERT …', serverOffsetMs: 10 });
  });

  it('end() is idempotent', () => {
    const trace = createTrace({ module: 'api', label: 'x' });
    const span = trace.begin('state', 'setState');
    span.end();
    span.end();
    expect(trace.steps).toHaveLength(1);
  });
});

describe('clipDetail', () => {
  it('keeps small details and truncates large ones', () => {
    expect(clipDetail({ a: 1 })).toEqual({ a: 1 });
    expect(clipDetail(undefined)).toBeUndefined();
    const big = clipDetail({ text: 'x'.repeat(20000) });
    expect(big.truncated).toBe(true);
    expect(big.preview).toHaveLength(12000);
  });
});

describe('apiRequest with a trace', () => {
  beforeEach(() => setCsrfToken('t'));
  afterEach(() => vi.restoreAllMocks());

  it('uses the trace id and records network + server spans, also for error responses', async () => {
    const body = {
      ok: false, data: null, error: { code: 'VALIDATION_FAILED', message: 'Invalid', fields: { email: 'Bad' } },
      meta: { durationMs: 2, trace: [{ layer: 'validation', name: 'Server-side validation', startedMs: 0.5, durationMs: 0.3, status: 'error', detail: {} }] },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body, 422));
    const trace = createTrace({ module: 'execution-trace', label: 'form' });

    await expect(apiRequest('/lab/db/contacts', { method: 'POST', body: { email: 'x' }, trace })).rejects.toThrow('Invalid');

    expect(fetchMock.mock.calls[0][1].headers['X-Trace-Id']).toBe(trace.id);
    const names = trace.steps.map((s) => `${s.layer}:${s.name}:${s.status}`);
    expect(names).toEqual([
      'network:HTTP POST /api/lab/db/contacts:error',
      'validation:Server-side validation:error',
      'network:Response 422:error',
    ]);
    expect(trace.steps[0].detail.headers['X-CSRF-Token']).toBe('•••• (session token)');
  });
});

describe('traceFromNetworkEntry', () => {
  it('rebuilds a trace from a logged request', () => {
    const snap = traceFromNetworkEntry({
      traceId: '11111111-2222-4333-8444-555555555555', source: 'ajax-monitor', method: 'GET', url: '/api/demo/echo?x=1',
      state: 'success', status: 200, statusText: 'OK', durationMs: 50, size: 10,
      request: { headers: {}, body: null },
      response: { headers: {}, body: { ok: true, meta: { durationMs: 10, trace: [{ layer: 'server', name: 'Request received', startedMs: 0, durationMs: 0, status: 'success', detail: {} }] } } },
    });
    expect(snap.module).toBe('ajax-monitor');
    expect(snap.steps.map((s) => s.name)).toEqual(['HTTP GET /api/demo/echo', 'Request received', 'Response 200']);
    expect(snap.steps[1].startedMs).toBe(20);
    expect(snap.totalMs).toBe(50);
  });
});
