import { useEffect, useMemo, useRef } from 'react';
import { ConsoleValue } from '../web-playground/ConsolePanel.jsx';
import styles from './JsPlayground.module.css';

const KIND_META = {
  var: { label: 'assign', layer: 'state' },
  cond: { label: 'check', layer: 'validation' },
  call: { label: 'call', layer: 'network' },
  return: { label: 'return', layer: 'render' },
  log: { label: 'output', layer: 'ui' },
};

function Pairs({ pairs, separator = ' = ' }) {
  return pairs.map(([name, value], i) => (
    <span key={name} className={styles.pair}>
      {i > 0 && ', '}
      <span className={styles.varName}>{name}</span>{separator}<ConsoleValue value={value} nested />
    </span>
  ));
}

export function describeEvent(event) {
  switch (event.kind) {
    case 'var':
      return <Pairs pairs={event.vars} />;
    case 'cond':
      return (
        <>
          <code className={styles.source}>{event.source}</code>
          <span className={styles.arrow}> → </span>
          <span className={event.result ? styles.true : styles.false}>{event.result ? 'true' : 'false'}</span>
        </>
      );
    case 'call':
      return (
        <>
          <span className={styles.fnName}>{event.name}</span>(<Pairs pairs={event.args} separator=": " />)
        </>
      );
    case 'return':
      return (
        <>
          <span className={styles.fnName}>{event.name}</span> returned <ConsoleValue value={event.value} nested />
        </>
      );
    case 'log':
      return event.args.map((a, i) => <span key={i}>{i > 0 && ' '}<ConsoleValue value={a} /></span>);
    default:
      return null;
  }
}

/** Ordered list of real execution events; the current step is highlighted and kept in view. */
export function ExecutionTimeline({ events, current, onSelect }) {
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <ol ref={listRef} className={styles.timeline} aria-label="Execution timeline">
      {events.map((event, index) => {
        const meta = KIND_META[event.kind];
        return (
          <li key={event.seq} aria-current={index === current ? 'step' : undefined}>
            <button
              type="button"
              className={`${styles.event} ${index === current ? styles.eventCurrent : ''} ${index > current ? styles.eventFuture : ''}`}
              style={{ '--layer': `var(--layer-${meta.layer})` }}
              onClick={() => onSelect(index)}
            >
              <span className={styles.eventIndex}>{index + 1}</span>
              <span className={styles.kind}>{meta.label}</span>
              <span className={styles.eventLine}>{event.line ? `L${event.line}` : ''}</span>
              <span className={styles.eventText}>{describeEvent(event)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Latest value of every variable after the current step (the program's "memory"). */
export function VariablesPanel({ events, current }) {
  const variables = useMemo(() => {
    const map = new Map();
    events.slice(0, current + 1).forEach((event, index) => {
      if (event.kind === 'var') event.vars.forEach(([name, value]) => map.set(name, { value, step: index }));
    });
    return [...map.entries()];
  }, [events, current]);

  if (!variables.length) return <p className={styles.muted}>No variables assigned yet at this step.</p>;
  return (
    <table className={styles.varTable}>
      <thead>
        <tr><th scope="col">Variable</th><th scope="col">Value</th></tr>
      </thead>
      <tbody>
        {variables.map(([name, { value, step }]) => (
          <tr key={name} className={step === current ? styles.changed : undefined}>
            <th scope="row" className={styles.varName}>{name}</th>
            <td><ConsoleValue value={value} nested /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
