import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Heart, History, Power, RefreshCw, Timer, Trash2, UserRound } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { recordExperimentRun } from '../../services/activity.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import styles from './StateLab.module.css';

const KIND_LAYER = { render: 'render', mount: 'ui', effect: 'state', cleanup: 'event', request: 'network', response: 'network', abort: 'validation', state: 'state' };
const MAX_LOG = 60;

/**
 * The component under study. Memoised, with stable props, so the lab's own log
 * updates never re-render it: every render and effect in the log is caused by it.
 */
const ProfileWidget = memo(function ProfileWidget({ userId, tick, timerOn, log, onStateCycle }) {
  const [likes, setLikes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [profile, setProfile] = useState({ status: 'idle' });
  const renders = useRef(0);
  renders.current += 1;
  const prevLikes = useRef(likes);

  // useState cycle: report after the render caused by setLikes has committed.
  useLayoutEffect(() => {
    if (prevLikes.current !== likes) {
      onStateCycle({ before: prevLikes.current, after: likes, render: renders.current });
      prevLikes.current = likes;
    }
  });

  // 1. Empty dependency array: runs once after mount, cleanup on unmount.
  useEffect(() => {
    const onResize = () => log('effect', 'resize listener fired', `window is ${window.innerWidth}px wide`);
    window.addEventListener('resize', onResize);
    log('effect', 'useEffect(…, [])  ran after mount', 'window.addEventListener("resize", onResize)');
    return () => {
      window.removeEventListener('resize', onResize);
      log('cleanup', 'useEffect(…, [])  cleanup on unmount', 'window.removeEventListener("resize", onResize)');
    };
  }, [log]);

  // 2. [userId]: re-runs when userId changes; cleanup aborts the previous request.
  useEffect(() => {
    const controller = new AbortController();
    log('effect', `useEffect(…, [userId])  ran with userId = ${userId}`, `fetch /api/demo/echo?userId=${userId}`);
    setProfile({ status: 'loading', userId });
    apiRequest(`/demo/echo?userId=${userId}&delay=700`, { signal: controller.signal, source: 'hooks-lab' }).then(
      ({ meta }) => {
        log('response', `response for userId = ${userId}`, `HTTP ${meta.status} in ${Math.round(meta.durationMs)} ms (server)`);
        setProfile({ status: 'done', userId });
      },
      (err) => {
        if (err.name === 'AbortError') log('abort', `request for userId = ${userId} aborted`, 'its cleanup ran before the response arrived');
        else setProfile({ status: 'error', userId, message: err.message });
      },
    );
    return () => {
      log('cleanup', `useEffect(…, [userId])  cleanup (userId was ${userId})`, 'controller.abort()');
      controller.abort();
    };
  }, [userId, log]);

  // 3. [timerOn]: an interval that must be cleared.
  useEffect(() => {
    if (!timerOn) return undefined;
    log('effect', 'useEffect(…, [timerOn])  started an interval', 'setInterval(tick, 1000)');
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(id);
      log('cleanup', 'useEffect(…, [timerOn])  cleanup', 'clearInterval(id)');
    };
  }, [timerOn, log]);

  // 4. No dependency array: runs after every render.
  useEffect(() => {
    log('render', `render #${renders.current} committed`, 'useEffect(() => …)  (no array) ran again');
  });

  return (
    <div className={styles.widget}>
      <p className={styles.widgetTitle}><UserRound size={16} aria-hidden="true" /> &lt;ProfileWidget userId={userId} /&gt;</p>
      <p>
        Profile:{' '}
        {profile.status === 'loading' ? `loading user ${profile.userId}…`
          : profile.status === 'done' ? `user ${profile.userId} loaded`
            : profile.status === 'error' ? `error: ${profile.message}` : '—'}
      </p>
      <p>Timer: {timerOn ? `${seconds}s` : 'off'} · parent tick prop: {tick}</p>
      <button type="button" className={styles.likeButton} onClick={() => { log('state', `setLikes(${likes} + 1)`, 'state update requested'); setLikes(likes + 1); }}>
        <Heart size={14} aria-hidden="true" /> Like ({likes})
      </button>
    </div>
  );
});

const LIFECYCLE = [
  { id: 'mount', label: 'Mount', layer: 'ui' },
  { id: 'effect', label: 'Effect', layer: 'state' },
  { id: 'deps', label: 'Deps change', layer: 'event' },
  { id: 'rerun', label: 'Re-run', layer: 'state' },
  { id: 'cleanup', label: 'Cleanup', layer: 'validation' },
];

let logSeq = 0;

export default function HooksTab() {
  const [mounted, setMounted] = useState(true);
  const [userId, setUserId] = useState(1);
  const [tick, setTick] = useState(0);
  const [timerOn, setTimerOn] = useState(false);
  const [log, setLog] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [phases, setPhases] = useState(() => new Set(['mount']));
  const [active, setActive] = useState('mount');
  const depsChanged = useRef(false);
  const logged = useRef(false);
  const narrow = useMediaQuery('(max-width: 520px)');

  const addLog = useCallback((kind, title, detail) => {
    // Build the entry now: the updater runs later, when logSeq may have moved on.
    logSeq += 1;
    const entry = { id: logSeq, kind, title, detail, time: new Date().toLocaleTimeString([], { hour12: false }) };
    setLog((l) => [entry, ...l].slice(0, MAX_LOG));
    if (kind === 'effect' && title.startsWith('useEffect')) {
      const phase = depsChanged.current ? 'rerun' : 'effect';
      depsChanged.current = false;
      setPhases((p) => new Set([...p, phase]));
      setActive(phase);
    } else if (kind === 'cleanup') {
      setPhases((p) => new Set([...p, 'cleanup']));
      setActive('cleanup');
    }
  }, []);

  const onStateCycle = useCallback((c) => setCycle({ ...c, seq: Date.now() }), []);

  function changeUser(id) {
    depsChanged.current = true;
    setPhases((p) => new Set([...p, 'deps']));
    setActive('deps');
    addLog('mount', `dependency changed: userId ${userId} → ${id}`, 'React will clean up, then re-run effects that list userId');
    setUserId(id);
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('hooks-effect', 'success', { action: 'dependency change' });
    }
  }

  function toggleMount() {
    if (mounted) {
      addLog('mount', '<ProfileWidget> unmounting', 'every effect cleanup will run');
    } else {
      setPhases(new Set(['mount']));
      setActive('mount');
      addLog('mount', '<ProfileWidget> mounting', 'effects run after the first render');
    }
    setMounted((m) => !m);
  }

  const lifecycle = LIFECYCLE.map((s) => ({ ...s, status: s.id === active ? 'active' : phases.has(s.id) ? 'done' : 'idle' }));
  const stateSteps = [
    { id: 'initial', label: 'Initial state', layer: 'state', status: cycle ? 'done' : 'idle', summary: cycle ? `likes = ${cycle.before}` : 'likes = 0' },
    { id: 'action', label: 'Action', layer: 'event', status: cycle ? 'done' : 'idle', summary: cycle ? 'click on Like' : null },
    { id: 'set', label: 'setState', layer: 'state', status: cycle ? 'done' : 'idle', summary: cycle ? `setLikes(${cycle.before} + 1)` : null },
    { id: 'render', label: 'Re-render', layer: 'render', status: cycle ? 'done' : 'idle', summary: cycle ? `render #${cycle.render} · likes = ${cycle.after}` : null },
  ];

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card title="Controls">
          <div className={styles.controls}>
            <Button icon={Power} variant={mounted ? 'danger' : 'primary'} onClick={toggleMount}>{mounted ? 'Unmount component' : 'Mount component'}</Button>
            <div className={styles.segment} role="radiogroup" aria-label="userId prop">
              <span>userId</span>
              {[1, 2, 3].map((id) => (
                <button key={id} type="button" role="radio" aria-checked={userId === id} disabled={!mounted} onClick={() => userId !== id && changeUser(id)}>{id}</button>
              ))}
            </div>
            <Button icon={RefreshCw} disabled={!mounted} onClick={() => { addLog('mount', `parent re-rendered (tick ${tick} → ${tick + 1})`, 'userId unchanged: only the no-array effect re-runs'); setTick((t) => t + 1); }}>
              Re-render parent
            </Button>
            <Button icon={Timer} disabled={!mounted} onClick={() => { depsChanged.current = true; setTimerOn((t) => !t); }}>
              {timerOn ? 'Stop timer' : 'Start timer'}
            </Button>
          </div>
          <div className={styles.stage}>
            {mounted ? <ProfileWidget userId={userId} tick={tick} timerOn={timerOn} log={addLog} onStateCycle={onStateCycle} />
              : <p className={styles.muted}>&lt;ProfileWidget&gt; is not mounted.</p>}
          </div>
          {import.meta.env.DEV && (
            <p className={styles.muted}>Development build: React StrictMode mounts effects twice on purpose to reveal missing cleanups.</p>
          )}
        </Card>

        <Card title="useState">
          <FlowPipeline steps={stateSteps} orientation="horizontal" label="useState cycle" />
          <p className={styles.muted}>Click “Like”: setLikes schedules an update and React re-renders the component with the new value.</p>
        </Card>

        <Card title="useEffect lifecycle">
          <FlowPipeline steps={lifecycle} orientation={narrow ? 'vertical' : 'horizontal'} compact={narrow} label="useEffect lifecycle" />
        </Card>
      </div>

      <Card title="Hook timeline" icon={History}
        actions={<Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLog([])} disabled={!log.length}>Clear</Button>}>
        {log.length === 0 ? <EmptyState title="Nothing yet">Mount the component, change userId or click Like.</EmptyState> : (
          <ol className={styles.timeline} aria-label="Hook timeline">
            {log.map((e) => (
              <li key={e.id} style={{ '--layer': `var(--layer-${KIND_LAYER[e.kind]})` }}>
                <span className={styles.kind}>{e.kind}</span>
                <span className={styles.entryTitle}>{e.title}</span>
                <code className={styles.entryDetail}>{e.detail}</code>
                <time className={styles.time}>{e.time}</time>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
