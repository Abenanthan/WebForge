import styles from './ExecutionTrace.module.css';

/** Lane order: from the user, down through the browser, out to the server and database. */
export const LANE_ORDER = ['ui', 'event', 'validation', 'state', 'render', 'dom', 'router', 'network', 'server', 'database'];
export const LAYER_NAMES = {
  ui: 'UI', event: 'Event', validation: 'Validation', state: 'State', render: 'Render', dom: 'DOM',
  router: 'Router', network: 'Network', server: 'Server', database: 'Database',
};

const COL = 128;
const LANE = 58;
const NODE_W = 112;
const NODE_H = 40;
const PAD = 12;

/**
 * Swimlane graph: one lane per layer, one column per step in time order.
 * The connecting line shows the path the operation takes between layers.
 */
export function TraceFlow({ steps, selected, onSelect, playhead }) {
  const lanes = LANE_ORDER.filter((l) => steps.some((s) => s.layer === l));
  const laneOf = (layer) => lanes.indexOf(layer);
  const pos = steps.map((s, i) => ({ x: PAD + i * COL + NODE_W / 2, y: laneOf(s.layer) * LANE + LANE / 2 }));
  const width = PAD * 2 + Math.max(0, steps.length - 1) * COL + NODE_W;
  const height = lanes.length * LANE;

  const path = pos.slice(1).map((p, i) => {
    const a = pos[i];
    const x1 = a.x + NODE_W / 2;
    const x2 = p.x - NODE_W / 2;
    const mid = (x1 + x2) / 2;
    return `M${x1},${a.y} C${mid},${a.y} ${mid},${p.y} ${x2},${p.y}`;
  });

  return (
    <div className={styles.flow}>
      <ol className={styles.laneLabels} aria-hidden="true" style={{ height }}>
        {lanes.map((l) => (
          <li key={l} style={{ height: LANE, '--layer': `var(--layer-${l})` }}>{LAYER_NAMES[l]}</li>
        ))}
      </ol>
      <div className={styles.flowScroll}>
        <div className={styles.flowCanvas} style={{ width, height }}>
          {lanes.map((l, i) => (
            <div key={l} className={styles.laneBg} style={{ top: i * LANE, height: LANE }} />
          ))}
          <svg className={styles.flowLines} width={width} height={height} aria-hidden="true">
            {path.map((d, i) => (
              <path key={i} d={d} className={playhead != null && i < playhead ? styles.lineDone : undefined} />
            ))}
          </svg>
          <ol className={styles.nodes} aria-label="Trace steps in order">
            {steps.map((s, i) => {
              const cls = [
                styles.node,
                s.status === 'error' && styles.nodeError,
                selected === i && styles.nodeSelected,
                playhead === i && styles.nodePlaying,
              ].filter(Boolean).join(' ');
              return (
                <li key={s.seq} style={{ left: pos[i].x - NODE_W / 2, top: pos[i].y - NODE_H / 2, width: NODE_W, height: NODE_H, '--layer': `var(--layer-${s.layer})` }}>
                  <button type="button" className={cls} onClick={() => onSelect(i)} aria-pressed={selected === i}
                    title={`${s.seq}. ${LAYER_NAMES[s.layer]}: ${s.name}`}>
                    <span className={styles.nodeSeq}>{s.seq}</span>
                    <span className={styles.nodeName}>{s.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
