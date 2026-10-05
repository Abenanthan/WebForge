import { useCallback, useLayoutEffect, useRef } from 'react';

let actionSeq = 0;
const NO_RENDER_WAIT_MS = 80;
/** Snapshot for display: later in-place mutation must not change what we recorded. */
const snapshot = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * Measures what really happens after a state update:
 *   before → setState call(s) → commit (after value, renders, render time) → next frame (UI updated).
 *
 * record(label, code, perform): runs `perform` (which calls the setter) and reports one entry
 * to onRecord when React has committed (or reports "no re-render" if React bailed out).
 */
export function useActionRecorder(value, onRecord) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const renders = useRef(0);
  renders.current += 1;
  const renderStart = performance.now();
  const pending = useRef(null);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  const finish = useCallback((entry) => {
    pending.current = null;
    requestAnimationFrame(() => {
      const { beforeRef: _ref, timer: _timer, ...clean } = entry;
      onRecordRef.current({ ...clean, uiMs: entry.rendered ? performance.now() - entry.startedAt : null });
    });
  }, []);

  // Runs after every commit of the component using this hook.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || p.committed) return;
    p.committed = true;
    clearTimeout(p.timer);
    finish({
      ...p,
      after: snapshot(valueRef.current),
      sameReference: valueRef.current === p.beforeRef,
      rendered: true,
      renders: renders.current - p.rendersBefore,
      renderMs: performance.now() - renderStart,
      commitMs: performance.now() - p.startedAt,
    });
  });

  return useCallback((label, code, perform, meta = {}) => {
    actionSeq += 1;
    const entry = {
      id: actionSeq,
      label,
      code,
      ...meta,
      before: snapshot(valueRef.current),
      beforeRef: valueRef.current,
      startedAt: performance.now(),
      rendersBefore: renders.current,
      time: new Date().toLocaleTimeString([], { hour12: false }),
    };
    pending.current = entry;
    perform();
    // If React bails out (Object.is says nothing changed) there is no commit to wait for.
    entry.timer = setTimeout(() => {
      if (pending.current === entry && !entry.committed) {
        entry.committed = true;
        finish({ ...entry, after: snapshot(valueRef.current), sameReference: valueRef.current === entry.beforeRef, rendered: false, renders: 0, renderMs: null, commitMs: null });
      }
    }, NO_RENDER_WAIT_MS);
  }, [finish]);
}
