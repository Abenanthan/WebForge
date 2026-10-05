import { memo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, History, Table2 } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import styles from './ComponentStudio.module.css';

/** Count real renders of a component instance. */
function useRenderCount() {
  const count = useRef(0);
  count.current += 1;
  return count.current;
}

function ProfileCard({ name, level }) {
  const renders = useRenderCount();
  return (
    <div className={styles.childBody}>
      <p className={styles.childOutput}>👤 {name || <em>no name</em>}</p>
      <p className={styles.muted}>{level}</p>
      <p className={styles.renders}>rendered {renders}×</p>
    </div>
  );
}

function ThemeBadge({ theme }) {
  const renders = useRenderCount();
  return (
    <div className={styles.childBody}>
      <p className={`${styles.childOutput} ${styles[`theme-${theme}`]}`}>{theme} theme</p>
      <p className={styles.renders}>rendered {renders}×</p>
    </div>
  );
}

function CreditCounter({ credits, onAdd }) {
  const renders = useRenderCount();
  return (
    <div className={styles.childBody}>
      <p className={styles.childOutput}>{credits} credits</p>
      <button type="button" className={styles.childButton} onClick={() => onAdd(2)}>Add 2 credits</button>
      <p className={styles.renders}>rendered {renders}×</p>
    </div>
  );
}

const StaticNote = memo(function StaticNote({ text }) {
  const renders = useRenderCount();
  return (
    <div className={styles.childBody}>
      <p className={styles.childOutput}>{text}</p>
      <p className={styles.renders}>rendered {renders}× (React.memo)</p>
    </div>
  );
});

const CHILDREN = [
  { component: 'ProfileCard', props: [['name', 'data'], ['level', 'data']] },
  { component: 'ThemeBadge', props: [['theme', 'data']] },
  { component: 'CreditCounter', props: [['credits', 'data'], ['onAdd', 'callback']] },
  { component: 'StaticNote', props: [['text', 'data']] },
];

let logSeq = 0;
// Function names are minified in production builds, so the callback is labelled explicitly.
const show = (v) => (typeof v === 'function' ? 'ƒ addCredits(amount)' : JSON.stringify(v));

/**
 * The parent owns all state. Data flows DOWN as props; the only way a child changes
 * the parent's data is by calling a function the parent passed down (a callback prop).
 */
export default function PropsTab() {
  const [name, setName] = useState('Asha');
  const [theme, setTheme] = useState('light');
  const [credits, setCredits] = useState(18);
  const [change, setChange] = useState(null); // { keys: ['ProfileCard.name'], callback?: 'CreditCounter.onAdd', seq }
  const [log, setLog] = useState([]);
  const renders = useRenderCount();
  const logged = useRef(false);

  const level = credits >= 24 ? 'Final year' : credits >= 20 ? 'Third year' : 'Second year';
  const note = 'This text never changes';

  function record(keys, message, callback) {
    logSeq += 1;
    setChange({ keys, callback, seq: logSeq });
    const entry = { id: logSeq, message, time: new Date().toLocaleTimeString([], { hour12: false }) };
    setLog((l) => [entry, ...l].slice(0, 12));
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('props-flow', 'success');
    }
  }

  function addCredits(amount) {
    const next = credits + amount;
    const nextLevel = next >= 24 ? 'Final year' : next >= 20 ? 'Third year' : 'Second year';
    setCredits(next);
    const keys = ['CreditCounter.credits', ...(nextLevel !== level ? ['ProfileCard.level'] : [])];
    record(keys, `<CreditCounter> called onAdd(${amount}) → parent setCredits(${next}) → credits flows back down${nextLevel !== level ? `, level becomes "${nextLevel}"` : ''}`, 'CreditCounter.onAdd');
  }
  const values = {
    ProfileCard: { name, level },
    ThemeBadge: { theme },
    CreditCounter: { credits, onAdd: addCredits },
    StaticNote: { text: note },
  };
  const isChanged = (key) => change?.keys.includes(key);

  return (
    <div className={styles.propsPage}>
      <Card>
        <div className={styles.parentBox}>
          <div className={styles.parentHead}>
            <span className={styles.componentName}>&lt;CourseDashboard&gt;</span>
            <span className={styles.muted}>parent · owns the state · rendered {renders}×</span>
          </div>
          <div className={styles.parentControls}>
            <label>
              <span>name (state)</span>
              <input value={name} onChange={(e) => { setName(e.target.value); record(['ProfileCard.name'], `Parent setName(${JSON.stringify(e.target.value)}) → name flows to <ProfileCard>`); }} />
            </label>
            <label>
              <span>theme (state)</span>
              <select value={theme} onChange={(e) => { setTheme(e.target.value); record(['ThemeBadge.theme'], `Parent setTheme("${e.target.value}") → theme flows to <ThemeBadge>`); }}>
                <option>light</option><option>dark</option><option>high-contrast</option>
              </select>
            </label>
            <p className={styles.muted}>credits (state): <strong>{credits}</strong></p>
          </div>
        </div>

        <div className={styles.childrenRow}>
          {CHILDREN.map((child) => (
            <div key={child.component} className={styles.childColumn}>
              <div className={styles.edges}>
                {child.props.map(([prop, kind]) => {
                  const key = `${child.component}.${prop}`;
                  const isCallback = kind === 'callback';
                  const active = isCallback ? change?.callback === key : isChanged(key);
                  return (
                    <span key={`${key}-${active ? change.seq : 0}`} className={`${styles.edge} ${isCallback ? styles.edgeUp : ''} ${active ? styles.edgeActive : ''}`}>
                      {isCallback ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
                      <code>{prop}</code>
                      <span className={styles.edgeValue}>{isCallback ? 'calls parent' : show(values[child.component][prop])}</span>
                    </span>
                  );
                })}
              </div>
              <div className={styles.childBox}>
                <span className={styles.componentName}>&lt;{child.component}&gt;</span>
                {child.component === 'ProfileCard' && <ProfileCard name={name} level={level} />}
                {child.component === 'ThemeBadge' && <ThemeBadge theme={theme} />}
                {child.component === 'CreditCounter' && <CreditCounter credits={credits} onAdd={addCredits} />}
                {child.component === 'StaticNote' && <StaticNote text={note} />}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className={styles.propsGrid}>
        <Card title="Props right now" icon={Table2}>
          <table className={styles.propsTable}>
            <thead>
              <tr><th scope="col">Prop</th><th scope="col">Value</th><th scope="col">From → To</th><th scope="col">Kind</th></tr>
            </thead>
            <tbody>
              {CHILDREN.flatMap((child) => child.props.map(([prop, kind]) => {
                const key = `${child.component}.${prop}`;
                return (
                  <tr key={key} className={isChanged(key) || change?.callback === key ? styles.rowChanged : undefined}>
                    <td><code>{prop}</code></td>
                    <td><code className={styles.json}>{show(values[child.component][prop])}</code></td>
                    <td>CourseDashboard → {child.component}</td>
                    <td>{kind === 'callback' ? 'callback (child → parent)' : 'data (parent → child)'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
          <p className={styles.muted}>Props are read-only in the child. To change data, a child calls a callback the parent provided.</p>
        </Card>

        <Card title="Data-flow log" icon={History}>
          {log.length === 0 ? <EmptyState title="Change something">Edit the parent&apos;s state or click “Add 2 credits” in the child.</EmptyState> : (
            <ol className={styles.flowLog} aria-label="Data-flow log">
              {log.map((l) => <li key={l.id}><time>{l.time}</time> {l.message}</li>)}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
