import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code, History, MousePointerClick, Pin, PinOff, Workflow } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import { EventStage } from './EventStage.jsx';
import { DEMOS, EVENT_CATEGORIES } from './demos.js';
import styles from './EventVisualizer.module.css';

const STEPS = [
  { id: 'action', label: 'User action', layer: 'ui' },
  { id: 'created', label: 'Event created', layer: 'event' },
  { id: 'listener', label: 'Event listener', layer: 'event' },
  { id: 'handler', label: 'Handler executed', layer: 'state' },
  { id: 'function', label: 'Function executed', layer: 'state' },
  { id: 'dom', label: 'DOM changed', layer: 'dom' },
  { id: 'ui', label: 'UI updated', layer: 'render' },
];
const STEP_INTERVAL_MS = 170;
const MAX_HISTORY = 25;

const ms = (value) => `${value < 0.1 ? '<0.1' : value.toFixed(value < 10 ? 2 : 1)} ms`;
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));

function stepSummary(record, id) {
  const call = record.calls[0];
  switch (id) {
    case 'action': return record.action;
    case 'created': return `${record.properties.constructor} "${record.type}"`;
    case 'listener': return `${record.listener.currentTarget} · ${record.listener.phase}`;
    case 'handler': return `${record.handler.name}()`;
    case 'function': return call ? `${call.name}(${call.args.map(show).join(', ')}) → ${show(call.result)}` : 'no function called';
    case 'dom': return record.mutations.length ? `${record.mutations.length} mutation${record.mutations.length > 1 ? 's' : ''}` : 'no change';
    case 'ui': return 'next frame painted';
    default: return '';
  }
}

function stepTime(record, id) {
  const since = (t) => `+${ms(Math.max(0, t - record.created))}`;
  switch (id) {
    case 'created': return '0 ms';
    case 'listener': return since(record.listenerAt);
    case 'handler': return since(record.handler.startedAt);
    case 'dom': return since(record.handler.startedAt + record.handler.ms);
    case 'ui': return since(record.paintedAt);
    default: return null;
  }
}

function KeyValues({ data }) {
  return (
    <table className={styles.kv}>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}><th scope="row">{k}</th><td>{v === null || v === undefined ? <em>null</em> : String(v)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function StepDetails({ record, stepId }) {
  const call = record.calls[0];
  switch (stepId) {
    case 'action':
      return <p>{record.action}. The browser turns this physical input into an event object.</p>;
    case 'created':
      return (
        <>
          <p>The browser created a <code>{record.properties.constructor}</code> and dispatched it to <code>{record.target}</code>.</p>
          <KeyValues data={record.properties} />
        </>
      );
    case 'listener':
      return (
        <>
          <p>
            <code>{record.listener.currentTarget}.addEventListener(&apos;{record.type}&apos;, {record.handler.name})</code> matched while the event was{' '}
            <strong>{record.listener.phase}</strong>.
          </p>
          <p className={styles.detailLabel}>Propagation path (target → window)</p>
          <ol className={styles.path} aria-label="Propagation path">
            {record.listener.path.map((node, i) => (
              <li key={`${node}-${i}`} className={node === record.listener.currentTarget ? styles.pathActive : undefined}>{node}</li>
            ))}
          </ol>
          {!record.properties.bubbles && <p className={styles.note}>“{record.type}” does not bubble, so only listeners on the target itself run.</p>}
        </>
      );
    case 'handler':
      return (
        <KeyValues data={{
          handler: `${record.handler.name}(event)`,
          duration: ms(record.handler.ms),
          'event.defaultPrevented': record.handler.defaultPrevented,
          error: record.handler.error ?? 'none',
        }}
        />
      );
    case 'function':
      return call ? (
        <KeyValues data={{
          function: call.name,
          arguments: call.args.map(show).join(', ') || '(none)',
          'return value': show(call.result),
          duration: ms(call.ms),
        }}
        />
      ) : <p>The handler did not call a helper function.</p>;
    case 'dom':
      return record.mutations.length ? (
        <ul className={styles.mutations}>
          {record.mutations.map((m, i) => (
            <li key={i}><span className={styles.mutationType}>{m.type}</span> <code>{m.target}</code> {m.detail}</li>
          ))}
        </ul>
      ) : <p>The handler ran but did not change the DOM, so nothing needs repainting.</p>;
    case 'ui':
      return (
        <p>
          The handler finished, the browser recalculated styles and painted. The next animation frame started{' '}
          <strong>{ms(record.paintedAt - record.created)}</strong> after the event was created.
        </p>
      );
    default:
      return null;
  }
}

let recordSeq = 0;

export default function EventVisualizerPage() {
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [animIndex, setAnimIndex] = useState(STEPS.length);
  const [selectedStep, setSelectedStep] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [categories, setCategories] = useState(() => new Set(['pointer', 'hover', 'keyboard', 'form']));
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const logged = useRef(false);

  const onRecord = useCallback((record) => {
    const category = Object.keys(EVENT_CATEGORIES).find((c) => EVENT_CATEGORIES[c].includes(record.type));
    if (!categoriesRef.current.has(category)) return;
    const entry = { ...record, id: ++recordSeq, time: new Date().toLocaleTimeString([], { hour12: false }) };
    setHistory((list) => [entry, ...list].slice(0, MAX_HISTORY));
    if (!pinnedRef.current) {
      setActiveId(entry.id);
      setAnimIndex(0);
      setSelectedStep(null);
    }
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('event-flow', 'success', { firstEvent: record.type });
    }
  }, []);

  // Walk through the recorded steps one by one so the flow can be followed.
  useEffect(() => {
    if (animIndex >= STEPS.length) return undefined;
    const timer = setTimeout(() => setAnimIndex((i) => i + 1), STEP_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [animIndex]);

  const active = history.find((h) => h.id === activeId) ?? null;
  const shownStep = selectedStep ?? STEPS[Math.min(animIndex, STEPS.length - 1)].id;

  const steps = useMemo(() => (active ? STEPS.map((s, i) => ({
    ...s,
    status: i < animIndex ? (s.id === 'handler' && active.handler.error ? 'error' : 'done') : i === animIndex ? 'active' : 'idle',
    summary: i <= animIndex ? stepSummary(active, s.id) : null,
    time: i <= animIndex ? stepTime(active, s.id) : null,
  })) : STEPS.map((s) => ({ ...s, status: 'idle' }))), [active, animIndex]);

  function toggleCategory(cat) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className={styles.page}>
      <LabHeader
        icon={MousePointerClick}
        layer="event"
        title="Event Visualizer"
        description="Interact with real elements. Each event is recorded as it travels from your action, through its listener and handler, to the DOM change and the repaint."
        concepts={['addEventListener', 'event object', 'propagation', 'bubbling', 'preventDefault', 'MutationObserver', 'requestAnimationFrame']}
      />

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card title="Interaction stage" icon={MousePointerClick}>
            <fieldset className={styles.filters}>
              <legend className="sr-only">Record these events</legend>
              {Object.entries(EVENT_CATEGORIES).map(([cat, types]) => (
                <label key={cat} className={styles.filter}>
                  <input type="checkbox" checked={categories.has(cat)} onChange={() => toggleCategory(cat)} />
                  {types.join(', ')}
                </label>
              ))}
            </fieldset>
            <EventStage onRecord={onRecord} />
          </Card>

          <Card title="Listener code" icon={Code}>
            {active ? (
              <>
                <p className={styles.codeCaption}>{DEMOS[active.demo].title}: listeners for {DEMOS[active.demo].events.map((e) => <code key={e}>{e}</code>).reduce((a, b) => [a, ', ', b])}</p>
                <pre className={styles.code}>{DEMOS[active.demo].code}</pre>
              </>
            ) : (
              <EmptyState title="Trigger an event">The JavaScript that handles it will appear here.</EmptyState>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <Card
            title="Event flow"
            icon={Workflow}
            actions={active && (
              <Button size="sm" variant={pinned ? 'primary' : 'ghost'} icon={pinned ? PinOff : Pin} onClick={() => setPinned((p) => !p)} aria-pressed={pinned}>
                {pinned ? 'Unpin' : 'Pin'}
              </Button>
            )}
          >
            {active ? (
              <p className={styles.flowCaption} aria-live="polite">
                <strong>{active.type}</strong> on <code>{active.target}</code> at {active.time}
                {pinned && <span className={styles.pinnedNote}> · pinned (new events go to history only)</span>}
              </p>
            ) : (
              <p className={styles.flowCaption}>Waiting for an event: click, hover, type, choose or submit in the stage.</p>
            )}
            <div className={styles.flow}>
              <FlowPipeline
                steps={steps}
                label="Event flow"
                selectedId={active ? shownStep : null}
                onSelect={active ? (id) => setSelectedStep(id) : undefined}
                compact
              />
              <section className={styles.details} aria-label="Step details">
                {active ? (
                  <>
                    <h3 className={styles.detailTitle}>{STEPS.find((s) => s.id === shownStep).label}</h3>
                    <StepDetails record={active} stepId={shownStep} />
                  </>
                ) : (
                  <EmptyState title="No event yet">Select a step after an event to see the real data recorded for it.</EmptyState>
                )}
              </section>
            </div>
          </Card>

          <Card title="Event history" icon={History}>
            {history.length === 0 ? (
              <EmptyState icon={History} title="No events recorded">The last {MAX_HISTORY} events are kept here.</EmptyState>
            ) : (
              <table className={styles.history}>
                <thead>
                  <tr><th scope="col">Time</th><th scope="col">Event</th><th scope="col">Target</th><th scope="col">Handler</th><th scope="col">DOM</th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className={h.id === activeId ? styles.historyActive : undefined}>
                      <td>{h.time}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.historyLink}
                          onClick={() => {
                            setActiveId(h.id);
                            setAnimIndex(STEPS.length);
                            setSelectedStep(null);
                            setPinned(true);
                          }}
                        >
                          {h.type}
                        </button>
                      </td>
                      <td><code>{h.target}</code></td>
                      <td>{ms(h.handler.ms)}</td>
                      <td>{h.mutations.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
