import { useEffect, useRef, useState } from 'react';
import { Ban, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import styles from './Panels.module.css';

const LEVEL_ICONS = { warn: TriangleAlert, error: CircleAlert, info: Info };
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'log', label: 'Logs' },
  { id: 'warn', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
];

function matchesFilter(entry, filter) {
  if (filter === 'all') return true;
  if (filter === 'log') return ['log', 'info', 'debug'].includes(entry.level);
  return entry.level === filter;
}

/** Renders one serialized value produced by the sandbox bridge. */
export function ConsoleValue({ value, nested = false }) {
  switch (value.t) {
    case 'string':
      return nested ? <span className={styles.vString}>&quot;{value.v}&quot;</span> : <span className={styles.vText}>{value.v}</span>;
    case 'number':
    case 'bigint':
      return <span className={styles.vNumber}>{value.v}</span>;
    case 'boolean':
      return <span className={styles.vBoolean}>{value.v}</span>;
    case 'null':
    case 'undefined':
      return <span className={styles.vNull}>{value.t}</span>;
    case 'function':
    case 'symbol':
    case 'regexp':
    case 'date':
      return <span className={styles.vFunction}>{value.v}</span>;
    case 'error':
      return <span className={styles.vError}>{value.v}</span>;
    case 'circular':
      return <span className={styles.vNull}>[Circular]</span>;
    case 'element':
      return <span className={styles.vElement} title={value.html}>{value.v}</span>;
    case 'array':
    case 'object':
    case 'map':
    case 'set':
      return <Collapsible value={value} />;
    default:
      return <span>{String(value.v)}</span>;
  }
}

function preview(value) {
  if (value.truncated) return value.t === 'array' ? `Array(${value.size ?? '…'})` : '{…}';
  if (value.t === 'array') return `${value.ctor || 'Array'}(${value.size})`;
  if (value.t === 'map' || value.t === 'set') return `${value.t === 'map' ? 'Map' : 'Set'}(${value.size})`;
  const keys = value.entries.slice(0, 4).map(([k]) => k).join(', ');
  return `${value.ctor ? `${value.ctor} ` : ''}{${keys}${value.size > 4 ? ', …' : ''}}`;
}

function Collapsible({ value }) {
  if (value.truncated) return <span className={styles.vNull}>{preview(value)}</span>;
  const rows = value.t === 'array'
    ? value.items.map((item, i) => [String(i), item])
    : value.entries.map(([k, v], i) => (value.t === 'set' ? [String(i), v] : [k, v]));
  return (
    <details className={styles.vObject}>
      <summary>{preview(value)}</summary>
      <ul>
        {rows.map(([key, v], i) => (
          <li key={i}>
            <span className={styles.vKey}>{typeof key === 'string' ? key : <ConsoleValue value={key} nested />}</span>
            <span className={styles.vColon}>: </span>
            <ConsoleValue value={v} nested />
          </li>
        ))}
        {(value.size ?? 0) > rows.length && <li className={styles.vNull}>… {value.size - rows.length} more</li>}
      </ul>
    </details>
  );
}

export function ConsolePanel({ entries, onClear }) {
  const [filter, setFilter] = useState('all');
  const listRef = useRef(null);
  const visible = entries.filter((e) => matchesFilter(e, filter));

  // Keep the newest output in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelToolbar}>
        <div className={styles.filters} role="radiogroup" aria-label="Filter console messages">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              className={styles.filter}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" icon={Ban} onClick={onClear} disabled={!entries.length}>Clear</Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={entries.length ? 'No messages match this filter' : 'Console is empty'}>
          {entries.length ? null : 'Output from console.log(), warnings and errors in your script appear here.'}
        </EmptyState>
      ) : (
        <ol ref={listRef} className={styles.consoleList} aria-label="Console output" aria-live="polite">
          {visible.map((entry) => {
            if (entry.level === 'separator') {
              return <li key={entry.id} className={styles.separator}>{entry.text}</li>;
            }
            const Icon = LEVEL_ICONS[entry.level];
            return (
              <li key={entry.id} className={`${styles.consoleEntry} ${styles[`level-${entry.level}`] ?? ''}`}>
                <span className={styles.consoleIcon}>{Icon && <Icon size={13} aria-label={entry.level} />}</span>
                <div className={styles.consoleArgs}>
                  {entry.args.map((arg, i) => <span key={i}>{i > 0 && ' '}<ConsoleValue value={arg} /></span>)}
                </div>
                <time className={styles.consoleTime}>{entry.time}</time>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
