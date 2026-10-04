import { useState } from 'react';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { formatMs } from '../../utils/format.js';
import styles from './AjaxMonitor.module.css';

const TABS = ['flow', 'request', 'response', 'server'];

export const formatBytes = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/** The 7 stages of an AJAX round trip, built from the real log entry. */
function flowSteps(entry, uiMs) {
  const meta = entry.response?.body?.meta;
  const serverMs = meta?.durationMs;
  const processing = (meta?.trace ?? []).filter((s) => !['Request received', 'Middleware passed', 'Response generated'].includes(s.name));
  const pending = entry.state === 'pending';
  const failedNetwork = entry.state === 'error' && !entry.status;
  const httpError = entry.status >= 400;

  const step = (id, label, layer, status, summary, time) => ({ id, label, layer, status, summary, time });
  if (failedNetwork || entry.state === 'aborted') {
    return [
      step('browser', 'Browser', 'ui', 'done', 'fetch() called'),
      step('request', 'Request', 'network', 'error', entry.state === 'aborted' ? 'aborted by the user' : 'could not connect'),
      ...['server', 'processing', 'response', 'parse', 'ui'].map((id) => step(id, { server: 'Server', processing: 'Processing', response: 'Response', parse: 'Browser', ui: 'UI update' }[id], 'network', 'skipped', 'not reached')),
    ];
  }
  return [
    step('browser', 'Browser', 'ui', 'done', 'fetch() called', '0 ms'),
    step('request', 'Request', 'network', 'done', `${entry.method} ${entry.url.replace(/\?.*/, '')}`),
    step('server', 'Server', 'server', pending ? 'active' : 'done', pending ? 'waiting for PHP…' : 'PHP router + middleware'),
    step('processing', 'Processing', processing.some((s) => s.layer === 'database') ? 'database' : 'server',
      pending ? 'idle' : processing.some((s) => s.status === 'error') ? 'error' : 'done',
      pending ? null : `${processing.length} step${processing.length === 1 ? '' : 's'}`, serverMs != null ? formatMs(serverMs) : null),
    step('response', 'Response', 'network', pending ? 'idle' : httpError ? 'error' : 'done',
      pending ? null : `${entry.status} · ${formatBytes(entry.size)}`, pending ? null : formatMs(entry.durationMs)),
    step('parse', 'Browser', 'ui', pending ? 'idle' : 'done', pending ? null : 'JSON parsed'),
    step('ui', 'UI update', 'render', pending ? 'idle' : uiMs != null ? 'done' : 'skipped',
      pending ? null : uiMs != null ? 'React re-rendered' : 'not shown on screen', uiMs != null ? `+${formatMs(uiMs)}` : null),
  ];
}

function Timing({ entry, uiMs }) {
  const meta = entry.response?.body?.meta;
  if (!meta || entry.durationMs == null) return null;
  const total = entry.durationMs + (uiMs ?? 0);
  const server = Math.min(meta.durationMs, entry.durationMs);
  const network = Math.max(0, entry.durationMs - server);
  const pct = (v) => `${Math.max(0.5, (v / total) * 100)}%`;
  return (
    <div className={styles.timing}>
      <div className={styles.timingBar} role="img" aria-label={`Network ${formatMs(network)}, server ${formatMs(server)}, UI ${formatMs(uiMs ?? 0)}`}>
        <span style={{ width: pct(network), background: 'var(--layer-network)' }} />
        <span style={{ width: pct(server), background: 'var(--layer-server)' }} />
        {uiMs != null && <span style={{ width: pct(uiMs), background: 'var(--layer-render)' }} />}
      </div>
      <ul className={styles.legend}>
        <li><span style={{ background: 'var(--layer-network)' }} />Network &amp; HTTP overhead {formatMs(network)}</li>
        <li><span style={{ background: 'var(--layer-server)' }} />Server processing {formatMs(server)}</li>
        {uiMs != null && <li><span style={{ background: 'var(--layer-render)' }} />UI update {formatMs(uiMs)}</li>}
      </ul>
    </div>
  );
}

function Headers({ headers }) {
  return (
    <table className={styles.kv}>
      <tbody>
        {Object.entries(headers ?? {}).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{String(v)}</td></tr>)}
      </tbody>
    </table>
  );
}

const pretty = (value) => (value == null ? '(empty)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2));

export function RequestDetails({ entry, uiMs }) {
  const [tab, setTab] = useState('flow');
  if (!entry) {
    return <EmptyState title="Select a request">Choose a row in the network log to inspect it.</EmptyState>;
  }
  const meta = entry.response?.body?.meta;
  const steps = flowSteps(entry, uiMs);
  const qs = entry.url.includes('?') ? Object.fromEntries(new URLSearchParams(entry.url.split('?')[1])) : null;

  return (
    <div className={styles.details}>
      <div className={styles.detailTabs} role="tablist" aria-label="Request details">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={styles.detailTab} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className={styles.detailBody}>
        {tab === 'flow' && (
          <>
            <FlowPipeline steps={steps} orientation="horizontal" label="Request flow" />
            <Timing entry={entry} uiMs={uiMs} />
            {entry.error && <p className={styles.errorText}>{entry.error}</p>}
          </>
        )}

        {tab === 'request' && (
          <>
            <table className={styles.kv}>
              <tbody>
                <tr><th scope="row">Method</th><td><span className={styles[`m-${entry.method}`]}>{entry.method}</span></td></tr>
                <tr><th scope="row">URL</th><td className="mono">{entry.url}</td></tr>
                <tr><th scope="row">Initiated by</th><td>{entry.source}</td></tr>
                <tr><th scope="row">Trace ID</th><td className="mono">{entry.traceId}</td></tr>
              </tbody>
            </table>
            {qs && (<><h4 className={styles.subTitle}>Query string</h4><Headers headers={qs} /></>)}
            <h4 className={styles.subTitle}>Request headers</h4>
            <Headers headers={entry.request.headers} />
            <h4 className={styles.subTitle}>Payload</h4>
            <pre className={styles.code}>{entry.request.body == null ? '(no body: GET/DELETE send none)' : pretty(entry.request.body)}</pre>
          </>
        )}

        {tab === 'response' && (
          entry.state === 'pending' ? <p className={styles.muted}>Waiting for the response…</p>
            : !entry.response ? <p className={styles.errorText}>{entry.error ?? 'No response.'}</p> : (
              <>
                <table className={styles.kv}>
                  <tbody>
                    <tr><th scope="row">Status</th><td><span className={entry.status >= 400 ? styles.statusBad : styles.statusOk}>{entry.status} {entry.statusText}</span></td></tr>
                    <tr><th scope="row">Time</th><td>{formatMs(entry.durationMs)}</td></tr>
                    <tr><th scope="row">Size</th><td>{formatBytes(entry.size)}</td></tr>
                  </tbody>
                </table>
                <h4 className={styles.subTitle}>Response headers</h4>
                <Headers headers={entry.response.headers} />
                <h4 className={styles.subTitle}>Body</h4>
                <pre className={styles.code}>{pretty(entry.response.body)}</pre>
              </>
            )
        )}

        {tab === 'server' && (
          !meta ? <p className={styles.muted}>{entry.state === 'pending' ? 'The server has not answered yet.' : 'No server trace in this response.'}</p> : (
            <>
              <p className={styles.muted}>Recorded by PHP&apos;s ServerTracer and returned in <code>meta.trace</code>. Total server time: {formatMs(meta.durationMs)}.</p>
              <ol className={styles.serverSteps}>
                {meta.trace.map((s, i) => (
                  <li key={i} className={s.status === 'error' ? styles.stepError : undefined} style={{ '--layer': `var(--layer-${s.layer})` }}>
                    <span className={styles.stepLayer}>{s.layer}</span>
                    <span className={styles.stepName}>{s.name}</span>
                    <span className={styles.stepTime}>+{formatMs(s.startedMs)} · {formatMs(s.durationMs)}</span>
                    {s.detail?.sql && <pre className={styles.code}>{s.detail.sql}{'\n'}-- params: {JSON.stringify(s.detail.params)}</pre>}
                  </li>
                ))}
              </ol>
            </>
          )
        )}
      </div>
    </div>
  );
}
