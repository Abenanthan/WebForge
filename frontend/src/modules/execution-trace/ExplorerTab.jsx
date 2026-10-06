import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, ListTree, Radar } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useNetworkLog } from '../../hooks/useNetworkLog.js';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { API_BASE, api } from '../../services/apiClient.js';
import { networkLog } from '../../services/networkLog.js';
import { saveTrace, traceFromNetworkEntry } from '../../trace/traceBus.js';
import { formatMs, relativeTime } from '../../utils/format.js';
import { TraceViewer } from './TraceViewer.jsx';
import styles from './ExecutionTrace.module.css';

const traceable = (e) => e.state !== 'pending' && e.response?.body?.meta?.trace && !e.url.startsWith(`${API_BASE}/traces`);

export default function ExplorerTab() {
  const [params, setParams] = useSearchParams();
  const [module, setModule] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [capturing, setCapturing] = useState(null);
  const toast = useToast();
  const requests = useNetworkLog().filter(traceable).slice(0, 8);

  const list = useApi((signal) => api.get(`/traces${module ? `?module=${encodeURIComponent(module)}` : ''}`, { signal }), [module]);
  const traces = list.data?.traces ?? [];
  const selectedId = params.get('id') ?? traces[0]?.traceId ?? null;
  const detail = useApi((signal) => (selectedId ? api.get(`/traces/${selectedId}`, { signal }) : Promise.resolve(null)), [selectedId]);

  const select = (id) => setParams(id ? { id } : {}, { replace: false });

  async function capture(entry) {
    if (traces.some((t) => t.traceId === entry.traceId)) {
      select(entry.traceId); // already saved (e.g. the Full-stack form's own request)
      return;
    }
    setCapturing(entry.id);
    try {
      const id = await saveTrace(traceFromNetworkEntry(entry));
      setModule('');
      list.reload();
      select(id);
    } catch (err) {
      toast.error(err.message ?? 'Could not save the trace.');
    } finally {
      setCapturing(null);
    }
  }

  // /trace?request=<networkLog id> (from the AJAX Monitor): trace that request once.
  const requested = params.get('request');
  const handled = useRef(null);
  useEffect(() => {
    if (!requested || handled.current === requested) return;
    handled.current = requested;
    const entry = networkLog.getAll().find((e) => e.id === requested);
    if (entry && traceable(entry)) capture(entry);
    else {
      toast.error('That request is no longer in this session’s network log.');
      select(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  async function remove() {
    setConfirm(false);
    try {
      await api.delete(`/traces/${selectedId}`);
      toast.success('Trace deleted.');
      select(null);
      list.reload();
    } catch (err) {
      toast.error(err.message ?? 'Could not delete the trace.');
    }
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.sidebar}>
        <Card title="Saved traces" icon={ListTree}>
          <div className={styles.filter}>
            <label htmlFor="trace-module">Module</label>
            <select id="trace-module" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">All modules</option>
              {(list.data?.modules ?? []).map((m) => <option key={m.module} value={m.module}>{m.module} ({m.count})</option>)}
            </select>
          </div>
          {list.status === 'loading' && !list.data ? <LoadingState label="Loading traces…" />
            : list.status === 'error' ? <ErrorState error={list.error} onRetry={list.reload} />
              : traces.length === 0 ? (
                <EmptyState icon={Radar} title="No traces yet">Run the Full-stack form, or trace one of your recent requests below.</EmptyState>
              ) : (
                <ol className={styles.traceList} aria-label="Saved traces">
                  {traces.map((t) => (
                    <li key={t.traceId}>
                      <button type="button" aria-current={t.traceId === selectedId ? 'true' : undefined} onClick={() => select(t.traceId)}>
                        <span className={`${styles.statusDot} ${t.status === 'error' ? styles.statusDotError : ''}`} role="img" aria-label={t.status} />
                        <span className={styles.traceLabel}>{t.label}</span>
                        <span className={styles.traceMeta}>{t.module} · {t.steps} steps · {formatMs(t.totalMs)}</span>
                        <time className={styles.traceTime} dateTime={t.createdAt}>{relativeTime(t.createdAt)}</time>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
        </Card>

        <Card title="Recent requests" icon={Activity}>
          {requests.length === 0 ? (
            <p className={styles.muted}>API calls made in this browser tab appear here (from any lab). Trace one to see its server steps.</p>
          ) : (
            <ol className={styles.requestList} aria-label="Recent requests">
              {requests.map((e) => (
                <li key={e.id}>
                  <span className={styles.reqMethod}>{e.method}</span>
                  <code className={styles.reqUrl} title={e.url}>{e.url.replace(/^\/api/, '')}</code>
                  <span className={e.status >= 400 ? styles.statusError : styles.reqStatus}>{e.status}</span>
                  <Button size="sm" variant="ghost" loading={capturing === e.id} onClick={() => capture(e)} aria-label={`Trace ${e.method} ${e.url}`}>Trace</Button>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className={styles.main}>
        {!selectedId ? <EmptyState icon={Radar} title="Select a trace">Pick a saved trace to see the path it took through every layer.</EmptyState>
          : detail.status === 'error' ? <ErrorState error={detail.error} onRetry={detail.reload} />
            : !detail.data || detail.data.traceId !== selectedId ? <LoadingState label="Loading trace…" />
              : <TraceViewer trace={detail.data} onDelete={() => setConfirm(true)} />}
      </Card>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this trace?" size="sm"
        description="The trace and all of its steps are removed from your history."
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>} />
    </div>
  );
}

