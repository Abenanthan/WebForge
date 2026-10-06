import { CircleCheck, CircleX } from 'lucide-react';
import { LAYER_NAMES } from './TraceFlow.jsx';
import styles from './ExecutionTrace.module.css';

const ms = (v) => `${Number(v).toFixed(2)} ms`;

/** What happened in one step: timing plus the real data it carried. */
export function StepDetail({ step, total }) {
  const { sql, params, headers, body, before, after, ...rest } = step.detail ?? {};
  const hasRest = Object.keys(rest).length > 0;

  return (
    <div className={styles.stepDetail} style={{ '--layer': `var(--layer-${step.layer})` }}>
      <div className={styles.stepHead}>
        <span className={styles.layerChip}>{LAYER_NAMES[step.layer]}</span>
        <h3>{step.seq} of {total}. {step.name}</h3>
        {step.status === 'error'
          ? <span className={styles.statusError}><CircleX size={14} aria-hidden="true" /> error</span>
          : <span className={styles.statusOk}><CircleCheck size={14} aria-hidden="true" /> success</span>}
      </div>
      <table className={styles.kv}>
        <tbody>
          <tr><th scope="row">Starts at</th><td>+{ms(step.startedMs)} after the trace began</td></tr>
          <tr><th scope="row">Took</th><td>{ms(step.durationMs)}</td></tr>
        </tbody>
      </table>

      {sql && (
        <>
          <p className={styles.detailLabel}>SQL (prepared statement)</p>
          <pre className={styles.code}>{sql}</pre>
          {params?.length > 0 && (
            <>
              <p className={styles.detailLabel}>Bound parameters</p>
              <ol className={styles.params}>
                {params.map((p, i) => <li key={i}><code>?{i + 1}</code> = <code>{JSON.stringify(p)}</code></li>)}
              </ol>
            </>
          )}
        </>
      )}
      {before !== undefined && (
        <div className={styles.compare}>
          <div><p className={styles.detailLabel}>Before</p><pre className={styles.code}>{JSON.stringify(before, null, 2)}</pre></div>
          <div><p className={styles.detailLabel}>After</p><pre className={styles.code}>{JSON.stringify(after, null, 2)}</pre></div>
        </div>
      )}
      {headers && (
        <>
          <p className={styles.detailLabel}>Headers</p>
          <table className={styles.kv}>
            <tbody>
              {Object.entries(headers).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td><code>{String(v)}</code></td></tr>)}
            </tbody>
          </table>
        </>
      )}
      {body !== undefined && (
        <>
          <p className={styles.detailLabel}>Body</p>
          <pre className={styles.code}>{JSON.stringify(body, null, 2)}</pre>
        </>
      )}
      {hasRest && (
        <>
          <p className={styles.detailLabel}>Details</p>
          <pre className={styles.code}>{JSON.stringify(rest, null, 2)}</pre>
        </>
      )}
      {!sql && before === undefined && !headers && body === undefined && !hasRest && (
        <p className={styles.muted}>This step carries no extra data.</p>
      )}
    </div>
  );
}
