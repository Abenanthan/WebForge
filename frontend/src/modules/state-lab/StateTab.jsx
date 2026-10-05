import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, History, RotateCcw, TriangleAlert } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import { formatMs } from '../../utils/format.js';
import { CounterExample, ProfileExample, TodoExample } from './stateExamples.jsx';
import styles from './StateLab.module.css';

const EXAMPLES = [
  { id: 'counter', title: 'Counter (number)', component: CounterExample },
  { id: 'todos', title: 'To-do list (array)', component: TodoExample },
  { id: 'profile', title: 'Profile (object)', component: ProfileExample },
];
const STEPS = [
  { id: 'before', label: 'State before', layer: 'state' },
  { id: 'action', label: 'Action', layer: 'event' },
  { id: 'update', label: 'State update', layer: 'state' },
  { id: 'after', label: 'State after', layer: 'state' },
  { id: 'render', label: 'Render', layer: 'render' },
  { id: 'ui', label: 'UI update', layer: 'dom' },
];
const STEP_MS = 160;
const MAX_HISTORY = 30;

const compact = (v) => {
  const s = JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

export default function StateTab() {
  const [exampleId, setExampleId] = useState('counter');
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [anim, setAnim] = useState(STEPS.length);
  const logged = useRef(false);

  const onRecord = useCallback((entry) => {
    setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
    setSelectedId(entry.id);
    setAnim(0);
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('state-update', 'success', { action: entry.label });
    }
  }, []);

  useEffect(() => {
    if (anim >= STEPS.length) return undefined;
    const t = setTimeout(() => setAnim((a) => a + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [anim]);

  const entry = history.find((h) => h.id === selectedId) ?? null;
  const Example = EXAMPLES.find((e) => e.id === exampleId).component;

  const summary = entry && {
    before: compact(entry.before),
    action: entry.label,
    update: entry.code.split('\n')[0] + (entry.code.includes('\n') ? ' …' : ''),
    after: compact(entry.after),
    render: entry.rendered ? `${entry.renders} render · ${formatMs(entry.renderMs)}` : 'skipped (no change)',
    ui: entry.rendered ? `painted +${formatMs(entry.uiMs)}` : 'nothing to paint',
  };
  const steps = STEPS.map((s, i) => {
    if (!entry) return { ...s, status: 'idle' };
    const skipped = !entry.rendered && (s.id === 'render' || s.id === 'ui');
    return {
      ...s,
      status: i > anim ? 'idle' : i === anim ? 'active' : skipped ? 'skipped' : 'done',
      summary: i <= anim ? summary[s.id] : null,
    };
  });

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card title="Component with state" icon={Activity}>
          <div className={styles.exampleTabs} role="tablist" aria-label="State examples">
            {EXAMPLES.map((e) => (
              <button key={e.id} type="button" role="tab" aria-selected={exampleId === e.id} className={styles.exampleTab}
                onClick={() => { setExampleId(e.id); setHistory([]); setSelectedId(null); }}>
                {e.title}
              </button>
            ))}
          </div>
          <div className={styles.stage}>
            <Example key={exampleId} onRecord={onRecord} />
          </div>
        </Card>

        <Card title="State history" icon={History}>
          {history.length === 0 ? <EmptyState title="No updates yet">Each state update is recorded here. Restore any earlier state.</EmptyState> : (
            <ol className={styles.history} aria-label="State history">
              {history.map((h) => (
                <li key={h.id} className={h.id === selectedId ? styles.historySelected : undefined}>
                  <button type="button" className={styles.historyMain} onClick={() => { setSelectedId(h.id); setAnim(STEPS.length); }}>
                    <span className={styles.historyLabel}>{h.label}</span>
                    <span className={styles.historyValues}>{compact(h.before)} → {compact(h.after)}</span>
                    <span className={h.rendered ? styles.rendered : styles.notRendered}>{h.rendered ? `re-rendered ×${h.renders}` : 'no re-render'}</span>
                  </button>
                  {h.restore && (
                    <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => h.restore(h.after)} aria-label={`Restore state after "${h.label}"`}>Restore</Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className={styles.column}>
        <Card title="What happened">
          <FlowPipeline steps={steps} label="State update flow" compact />
        </Card>

        <Card title="Details">
          {!entry ? <EmptyState title="Click a button in the component">The real values before and after, the code that ran and the render it caused.</EmptyState> : (
            <div className={styles.details}>
              <p className={styles.detailLabel}>Code that ran</p>
              <pre className={styles.code}>{entry.code}</pre>
              <div className={styles.compare}>
                <div>
                  <p className={styles.detailLabel}>Before</p>
                  <pre className={styles.code}>{JSON.stringify(entry.before, null, 2)}</pre>
                </div>
                <div>
                  <p className={styles.detailLabel}>After</p>
                  <pre className={styles.code}>{JSON.stringify(entry.after, null, 2)}</pre>
                </div>
              </div>
              <table className={styles.kv}>
                <tbody>
                  <tr><th scope="row">Re-rendered</th><td>{entry.rendered ? `yes, ${entry.renders} time(s) for this action` : 'no: React bailed out'}</td></tr>
                  <tr><th scope="row">Render took</th><td>{entry.rendered ? formatMs(entry.renderMs) : '—'}</td></tr>
                  <tr><th scope="row">Click → commit</th><td>{entry.rendered ? formatMs(entry.commitMs) : '—'}</td></tr>
                  <tr><th scope="row">Click → next frame</th><td>{entry.rendered ? formatMs(entry.uiMs) : '—'}</td></tr>
                  <tr><th scope="row">Same reference?</th><td>{entry.sameReference ? 'yes: Object.is(old, new) is true' : 'no: a new value'}</td></tr>
                </tbody>
              </table>
              {entry.lesson && <p className={styles.lesson}><TriangleAlert size={14} aria-hidden="true" /> {entry.lesson}</p>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
