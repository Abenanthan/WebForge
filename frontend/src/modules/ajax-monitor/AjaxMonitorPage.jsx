import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Ban, Code, Network, Plus, Send, Square, Trash2, X } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { networkLog } from '../../services/networkLog.js';
import { recordExperimentRun } from '../../services/activity.js';
import { useNetworkLog } from '../../hooks/useNetworkLog.js';
import { formatMs } from '../../utils/format.js';
import { BODY_METHODS, METHODS, PATH_PATTERN, PRESETS, buildPath, fetchSnippet } from './presets.js';
import { RequestDetails, formatBytes } from './RequestDetails.jsx';
import styles from './AjaxMonitor.module.css';

const SOURCE = 'ajax-monitor';
const FILTERS = [
  { id: 'lab', label: 'This lab' },
  { id: 'all', label: 'All app traffic' },
  { id: 'errors', label: 'Errors' },
];

function useElapsed(active) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    setMs(0);
    const timer = setInterval(() => setMs(performance.now() - start), 50);
    return () => clearInterval(timer);
  }, [active]);
  return ms;
}

export default function AjaxMonitorPage() {
  const log = useNetworkLog();
  const [form, setForm] = useState(() => ({ ...PRESETS[0], delay: 0, fail: false }));
  const [filter, setFilter] = useState('lab');
  const [selectedId, setSelectedId] = useState(null);
  const [pending, setPending] = useState(null); // { id, controller }
  const [result, setResult] = useState(null);   // { id, ok, status, message, receivedAt }
  const [uiTimes, setUiTimes] = useState({});
  const [showCode, setShowCode] = useState(false);
  const elapsed = useElapsed(Boolean(pending));
  const loggedStatus = useRef(false);

  const hasBody = BODY_METHODS.has(form.method);
  const bodyError = useMemo(() => {
    if (!hasBody || !form.body.trim()) return null;
    try {
      JSON.parse(form.body);
      return null;
    } catch (e) {
      return `Invalid JSON: ${e.message}`;
    }
  }, [hasBody, form.body]);
  const pathError = PATH_PATTERN.test(form.path) ? null : 'Use letters, digits, - and _ separated by /';
  const path = buildPath(form);
  const url = `/api${path}`;

  // UI-update time: from the moment the response arrived until React committed the result.
  useEffect(() => {
    if (!result?.receivedAt) return;
    const ui = performance.now() - result.receivedAt;
    setUiTimes((t) => ({ ...t, [result.id]: ui }));
  }, [result]);

  const entries = useMemo(() => log.filter((e) => (
    filter === 'all' ? true : filter === 'lab' ? e.source === SOURCE : (e.state === 'error' || e.status >= 400)
  )), [log, filter]);
  const selected = log.find((e) => e.id === selectedId) ?? null;

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function applyPreset(preset) {
    setForm({ ...preset, query: preset.query.map((q) => [...q]), delay: preset.delay ?? 0, fail: Boolean(preset.fail) });
  }

  async function send(e) {
    e.preventDefault();
    if (bodyError || pathError || pending) return;
    const controller = new AbortController();
    const traceId = crypto.randomUUID();
    setPending({ id: traceId, controller });
    setSelectedId(traceId);
    setResult(null);
    let outcome;
    try {
      const { data, meta } = await apiRequest(path, {
        method: form.method,
        body: hasBody && form.body.trim() ? JSON.parse(form.body) : undefined,
        signal: controller.signal,
        traceId,
        source: SOURCE,
      });
      const message = data?.message ?? data?.meaning ?? (data?.count != null ? `${data.count} item(s) returned from the database` : 'Success');
      outcome = { ok: true, status: meta.status, message };
    } catch (err) {
      outcome = err.name === 'AbortError'
        ? { ok: false, aborted: true, message: 'Request cancelled. fetch() rejected with AbortError.' }
        : { ok: false, status: err.status, message: err.message, code: err.code };
    }
    setPending(null);
    setResult({ id: traceId, ...outcome, receivedAt: performance.now() });
    if (!outcome.aborted) {
      recordExperimentRun('ajax-request', outcome.ok ? 'success' : 'error', { method: form.method, path: form.path });
      if (form.path.startsWith('status/') && !loggedStatus.current) {
        loggedStatus.current = true;
        recordExperimentRun('http-status', 'success', { status: outcome.status });
      }
    }
  }

  return (
    <div className={styles.page}>
      <LabHeader
        icon={ArrowLeftRight}
        layer="network"
        title="AJAX Monitor"
        description="Send real asynchronous requests to the PHP server and inspect every part of the round trip: method, URL, headers, payload, status, response and timing."
        concepts={['fetch()', 'async / await', 'HTTP methods', 'status codes', 'JSON', 'headers', 'AbortController', 'CSRF token']}
      />

      <div className={styles.grid}>
        <Card title="Request builder" icon={Send} className={styles.builderCard}>
          <div className={styles.presets} role="group" aria-label="Example requests">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" className={styles.preset} onClick={() => applyPreset(p)}>
                <span className={styles[`m-${p.method}`]}>{p.method}</span> {p.label}
              </button>
            ))}
          </div>

          <form className={styles.builder} onSubmit={send} noValidate>
            <div className={styles.urlRow}>
              <label className="sr-only" htmlFor="req-method">Method</label>
              <select id="req-method" className={`${styles.input} ${styles.method}`} value={form.method} onChange={(e) => update({ method: e.target.value })}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <span className={styles.prefix} aria-hidden="true">/api/demo/</span>
              <label className="sr-only" htmlFor="req-path">Endpoint path</label>
              <input
                id="req-path"
                className={`${styles.input} ${styles.path}`}
                value={form.path}
                onChange={(e) => update({ path: e.target.value.trim() })}
                aria-invalid={pathError ? 'true' : undefined}
                aria-describedby="req-url"
                spellCheck={false}
              />
            </div>
            <p id="req-url" className={styles.urlPreview}>{pathError ?? url}</p>

            <fieldset className={styles.fieldset}>
              <legend>Query parameters</legend>
              {form.query.map(([k, v], i) => (
                <div key={i} className={styles.queryRow}>
                  <input className={styles.input} aria-label={`Parameter ${i + 1} name`} placeholder="name" value={k}
                    onChange={(e) => update({ query: form.query.map((q, j) => (j === i ? [e.target.value, q[1]] : q)) })} />
                  <input className={styles.input} aria-label={`Parameter ${i + 1} value`} placeholder="value" value={v}
                    onChange={(e) => update({ query: form.query.map((q, j) => (j === i ? [q[0], e.target.value] : q)) })} />
                  <Button size="sm" variant="ghost" icon={X} aria-label={`Remove parameter ${i + 1}`} onClick={() => update({ query: form.query.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => update({ query: [...form.query, ['', '']] })}>Add parameter</Button>
            </fieldset>

            {hasBody && (
              <div className={styles.bodyField}>
                <label htmlFor="req-body" className={styles.label}>JSON body</label>
                <textarea id="req-body" className={`${styles.textarea} mono`} rows={5} value={form.body} spellCheck={false}
                  onChange={(e) => update({ body: e.target.value })} aria-invalid={bodyError ? 'true' : undefined} aria-describedby="req-body-error" />
                {bodyError && <p id="req-body-error" className={styles.errorText}>{bodyError}</p>}
              </div>
            )}

            <fieldset className={styles.fieldset}>
              <legend>Server behaviour</legend>
              <label className={styles.slider}>
                <span>Processing delay: <strong>{form.delay} ms</strong></span>
                <input type="range" min={0} max={3000} step={250} value={form.delay} onChange={(e) => update({ delay: Number(e.target.value) })} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={form.fail} onChange={(e) => update({ fail: e.target.checked })} />
                Make the server fail (HTTP 500)
              </label>
            </fieldset>

            <div className={styles.sendRow}>
              {/* Distinct keys: React must not reuse the cancel <button> as the submit button,
                  or the browser's default click action would submit the form again. */}
              {pending ? (
                <Button
                  key="cancel"
                  variant="danger"
                  icon={Square}
                  onClick={(e) => {
                    e.preventDefault();
                    pending.controller.abort();
                  }}
                >
                  Cancel request
                </Button>
              ) : (
                <Button key="send" type="submit" variant="primary" icon={Send} disabled={Boolean(bodyError || pathError)}>Send request</Button>
              )}
              <Button variant="ghost" icon={Code} onClick={() => setShowCode((s) => !s)} aria-expanded={showCode}>{showCode ? 'Hide' : 'Show'} fetch() code</Button>
            </div>

            <div className={styles.result} aria-live="polite">
              {pending && <p className={styles.loading}><Spinner size={14} /> Waiting for the server… {formatMs(elapsed)}</p>}
              {!pending && result && (
                <p className={result.ok ? styles.success : result.aborted ? styles.muted : styles.failure}>
                  {result.status ? <strong>{result.status}</strong> : null} {result.message}
                </p>
              )}
            </div>

            {showCode && <pre className={styles.code}>{fetchSnippet(form.method, url, hasBody && form.body.trim() ? form.body : '')}</pre>}
          </form>
        </Card>

        <div className={styles.column}>
          <Card
            title="Network log"
            icon={Network}
            actions={<Button size="sm" variant="ghost" icon={Trash2} onClick={() => { networkLog.clear(); setSelectedId(null); }} disabled={!log.length}>Clear</Button>}
            bodyClassName={styles.logBody}
          >
            <div className={styles.filters} role="radiogroup" aria-label="Show requests">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className={styles.filter} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {entries.length === 0 ? (
              <EmptyState icon={Ban} title="No requests yet">
                {filter === 'lab' ? 'Send a request with the builder.' : 'Requests made by WebForge itself will appear here.'}
              </EmptyState>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Network requests">
                  <thead>
                    <tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Status</th><th scope="col">Time</th><th scope="col">Size</th></tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className={e.id === selectedId ? styles.rowSelected : undefined}>
                        <td><span className={styles[`m-${e.method}`]}>{e.method}</span></td>
                        <td>
                          <button type="button" className={styles.rowLink} onClick={() => setSelectedId(e.id)} title={e.url}>
                            {e.url.replace(/^\/api/, '')}
                          </button>
                        </td>
                        <td>
                          {e.state === 'pending' ? <Spinner size={12} label="pending" />
                            : e.state === 'aborted' ? <span className={styles.muted}>cancelled</span>
                              : <span className={e.status >= 400 || !e.status ? styles.statusBad : styles.statusOk}>{e.status || 'failed'}</span>}
                        </td>
                        <td>{e.durationMs != null ? formatMs(e.durationMs) : '…'}</td>
                        <td>{formatBytes(e.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Inspector" bodyClassName={styles.inspectorBody}>
            <RequestDetails key={selected?.id} entry={selected} uiMs={selected ? uiTimes[selected.traceId] : null} />
          </Card>
        </div>
      </div>
    </div>
  );
}
