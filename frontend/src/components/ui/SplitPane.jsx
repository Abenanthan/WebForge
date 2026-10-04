import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './SplitPane.module.css';

const KEY_STEP = 0.03;

function readStored(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return v > 0 && v < 1 ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Two resizable panes.
 * direction="horizontal" → side by side; "vertical" → stacked.
 * The divider is a focusable ARIA separator: drag it, or use the arrow keys / Home / End.
 */
export function SplitPane({ direction = 'horizontal', initial = 0.5, minSize = 120, storageKey, label, children, className = '' }) {
  const [first, second] = children;
  const containerRef = useRef(null);
  const [fraction, setFraction] = useState(() => (storageKey ? readStored(storageKey, initial) : initial));
  const [dragging, setDragging] = useState(false);
  const horizontal = direction === 'horizontal';

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(fraction));
    } catch {
      /* preference only */
    }
  }, [fraction, storageKey]);

  const clamp = useCallback((value) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const total = rect ? (horizontal ? rect.width : rect.height) : 1000;
    const min = Math.min(0.45, minSize / total);
    return Math.min(1 - min, Math.max(min, value));
  }, [horizontal, minSize]);

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = horizontal ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
    setFraction(clamp(pos));
  }

  function onKeyDown(e) {
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    const next = {
      [dec]: fraction - KEY_STEP,
      [inc]: fraction + KEY_STEP,
      Home: 0,
      End: 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setFraction(clamp(next));
  }

  const template = `minmax(0, ${fraction}fr) 6px minmax(0, ${1 - fraction}fr)`;
  return (
    <div
      ref={containerRef}
      className={`${styles.split} ${horizontal ? styles.horizontal : styles.vertical} ${className}`}
      style={horizontal ? { gridTemplateColumns: template } : { gridTemplateRows: template }}
      data-dragging={dragging || undefined}
    >
      <div className={styles.pane}>{first}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className={styles.divider}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.pane}>{second}</div>
    </div>
  );
}
