import { useEffect, useState } from 'react';
import { ChartNoAxesGantt, Download, Pause, Play, Trash2, Waypoints } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { formatMs } from '../../utils/format.js';
import { LANE_ORDER, LAYER_NAMES, TraceFlow } from './TraceFlow.jsx';
import { TraceWaterfall } from './TraceWaterfall.jsx';
import { StepDetail } from './StepDetail.jsx';
import styles from './ExecutionTrace.module.css';

const REPLAY_MS = 450;

function download(trace) {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `trace-${trace.traceId}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Flow graph / waterfall of one trace, replay, and the selected step's details. */
export function TraceViewer({ trace, onDelete }) {
  const [view, setView] = useState('flow');
  const [selected, setSelected] = useState(0);
  const [playhead, setPlayhead] = useState(null);
  const steps = trace.steps;

  useEffect(() => {
    setSelected(0);
    setPlayhead(null);
  }, [trace.traceId]);

  // Replay: walk through the steps in order, selecting each one.
  useEffect(() => {
    if (playhead === null) return undefined;
    setSelected(playhead);
    if (playhead >= steps.length - 1) {
      const t = setTimeout(() => setPlayhead(null), REPLAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPlayhead((p) => (p === null ? null : p + 1)), REPLAY_MS);
    return () => clearTimeout(t);
  }, [playhead, steps.length]);

  const layers = LANE_ORDER.map((l) => [l, steps.filter((s) => s.layer === l).length]).filter(([, n]) => n);
  const errors = steps.filter((s) => s.status === 'error').length;
  const step = steps[Math.min(selected, steps.length - 1)];
  const select = (i) => { setPlayhead(null); setSelected(i); };

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerHead}>
        <div className={styles.viewerTitle}>
          <h2>{trace.label}</h2>
          <p>
            <Badge tone={trace.status === 'error' ? 'danger' : 'success'}>{trace.status}</Badge>
            <span>{trace.module}</span>
            <span>{steps.length} steps</span>
            <span>{formatMs(trace.totalMs)} total</span>
            {errors > 0 && <span className={styles.statusError}>{errors} failed</span>}
          </p>
        </div>
        <div className={styles.viewerActions}>
          <Button size="sm" icon={playhead === null ? Play : Pause} onClick={() => setPlayhead(playhead === null ? 0 : null)}>
            {playhead === null ? 'Replay' : 'Stop'}
          </Button>
          <Button size="sm" variant="ghost" icon={Download} onClick={() => download(trace)}>Export JSON</Button>
          {onDelete && <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete}>Delete</Button>}
        </div>
      </div>

      <ul className={styles.layerSummary} aria-label="Layers in this trace">
        {layers.map(([l, n]) => (
          <li key={l} style={{ '--layer': `var(--layer-${l})` }}><span className={styles.dot} />{LAYER_NAMES[l]} <strong>{n}</strong></li>
        ))}
      </ul>

      <div className={styles.viewToggle} role="tablist" aria-label="Trace view">
        <button type="button" role="tab" aria-selected={view === 'flow'} onClick={() => setView('flow')}><Waypoints size={14} aria-hidden="true" /> Flow</button>
        <button type="button" role="tab" aria-selected={view === 'waterfall'} onClick={() => setView('waterfall')}><ChartNoAxesGantt size={14} aria-hidden="true" /> Waterfall</button>
      </div>

      {view === 'flow'
        ? <TraceFlow steps={steps} selected={selected} onSelect={select} playhead={playhead} />
        : <TraceWaterfall steps={steps} totalMs={trace.totalMs} selected={selected} onSelect={select} playhead={playhead} />}

      {step && <StepDetail step={step} total={steps.length} />}
    </div>
  );
}
