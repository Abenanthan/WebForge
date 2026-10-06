import { formatMs } from '../../utils/format.js';
import { LAYER_NAMES } from './TraceFlow.jsx';
import styles from './ExecutionTrace.module.css';

const preciseMs = (ms) => (ms < 10 ? `${ms.toFixed(2)} ms` : formatMs(ms));

/** Timeline: each step is a bar placed at its start offset, as long as it took. */
export function TraceWaterfall({ steps, totalMs, selected, onSelect, playhead }) {
  const total = Math.max(totalMs, 0.01);
  const ticks = [0, 0.5, 1];

  return (
    <div className={styles.waterfall}>
      <div className={styles.axis} aria-hidden="true">
        <span />
        <div className={styles.axisTrack}>
          {ticks.map((t) => <span key={t} style={{ left: `${t * 100}%` }}>{preciseMs(t * total)}</span>)}
        </div>
      </div>
      <ol aria-label="Trace timeline">
        {steps.map((s, i) => (
          <li key={s.seq} style={{ '--layer': `var(--layer-${s.layer})` }}>
            <button type="button" onClick={() => onSelect(i)} aria-pressed={selected === i}
              className={[styles.wfRow, selected === i && styles.wfSelected, playhead === i && styles.wfPlaying].filter(Boolean).join(' ')}>
              <span className={styles.wfName}>
                <span className={styles.wfSeq}>{s.seq}</span>
                <span className={styles.layerChip}>{LAYER_NAMES[s.layer]}</span>
                <span className={styles.wfText}>{s.name}</span>
              </span>
              <span className={styles.wfTrack}>
                <span className={`${styles.wfBar} ${s.status === 'error' ? styles.wfBarError : ''}`}
                  style={{ left: `${(s.startedMs / total) * 100}%`, width: `max(3px, ${(s.durationMs / total) * 100}%)` }} />
              </span>
              <span className={styles.wfMs}>{preciseMs(s.durationMs)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
