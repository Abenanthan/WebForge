import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import {
  Circle, Code, Download, Eraser, History, Minus, MousePointer2, Palette, Pencil, Redo2, Save, Square, Trash2, Undo2,
} from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { projectsApi } from '../../services/projects.js';
import { recordExperimentRun } from '../../services/activity.js';
import { TOOLS, constrain, describeOp, drawOp, historyReducer, initialHistory, opToCode, render } from './canvasOps.js';
import styles from './CanvasStudio.module.css';

const WIDTH = 960;
const HEIGHT = 600;
const MAX_PNG_CHARS = 2_000_000; // server limit is 2 MB per PNG
const SWATCHES = ['#0f172a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#d946ef'];
const TOOL_ICONS = { pencil: Pencil, line: Minus, rect: Square, circle: Circle, eraser: Eraser };
const MAX_EVENTS = 8;

/** Size the backing store for the device pixel ratio so drawings stay sharp. */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Flatten the drawing onto white (eraser pixels are transparent) and encode as PNG. */
function exportPng(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out.toDataURL('image/png');
}

let eventSeq = 0;

export default function CanvasStudioPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const projectParam = params.get('project');

  const [history, dispatch] = useReducer(historyReducer, initialHistory);
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState('#6366f1');
  const [size, setSize] = useState(6);
  const [fill, setFill] = useState(false);
  const [baseImage, setBaseImage] = useState(null);
  const [project, setProject] = useState(null);
  const [savedOps, setSavedOps] = useState(initialHistory.ops);
  const [load, setLoad] = useState({ status: projectParam ? 'loading' : 'ready', error: null });
  const [saveDialog, setSaveDialog] = useState({ open: false, title: 'My drawing', saving: false, error: null });
  const [events, setEvents] = useState([]);
  const [moveCount, setMoveCount] = useState(0);
  const [cursor, setCursor] = useState(null);

  const mainRef = useRef(null);
  const previewRef = useRef(null);
  const ctxRef = useRef(null);
  const previewCtxRef = useRef(null);
  const drawing = useRef(null); // operation in progress
  const logged = useRef(false);

  const dirty = history.ops !== savedOps;
  const lastOp = history.ops[history.ops.length - 1];

  useEffect(() => {
    ctxRef.current = setupCanvas(mainRef.current);
    previewCtxRef.current = setupCanvas(previewRef.current);
  }, []);

  // Re-render from the operation list whenever it (or the base image) changes.
  useEffect(() => {
    if (ctxRef.current) render(ctxRef.current, history.ops, baseImage, WIDTH, HEIGHT);
  }, [history.ops, baseImage]);

  // ---------------------------------------------------------------- pointer input
  function toCanvas(e) {
    const rect = mainRef.current.getBoundingClientRect();
    return [((e.clientX - rect.left) * WIDTH) / rect.width, ((e.clientY - rect.top) * HEIGHT) / rect.height];
  }

  function logEvent(e, point) {
    const entry = {
      id: ++eventSeq,
      type: e.type,
      x: Math.round(point[0]),
      y: Math.round(point[1]),
      pointerType: e.pointerType,
      pressure: e.pressure.toFixed(2),
      buttons: e.buttons,
    };
    setEvents((list) => [entry, ...list].slice(0, MAX_EVENTS));
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = toCanvas(e);
    logEvent(e, point);
    setMoveCount(0);
    if (tool === 'pencil' || tool === 'eraser') {
      drawing.current = { type: 'stroke', tool, color, size, points: [point] };
    } else {
      drawing.current = { type: tool, color, size, fill: tool !== 'line' && fill, from: point, to: point };
    }
  }

  function onPointerMove(e) {
    const point = toCanvas(e);
    setCursor([Math.round(point[0]), Math.round(point[1])]);
    const op = drawing.current;
    if (!op) return;
    setMoveCount((n) => n + 1);
    if (op.type === 'stroke') {
      // Draw the new segment straight onto the canvas for zero-latency feedback.
      const prev = op.points[op.points.length - 1];
      op.points.push(point);
      drawOp(ctxRef.current, { ...op, points: [prev, point] });
    } else {
      op.to = e.shiftKey ? constrain(op.type, op.from, point) : point;
      const pctx = previewCtxRef.current;
      pctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawOp(pctx, op);
    }
  }

  function finish(e) {
    const op = drawing.current;
    if (!op) return;
    drawing.current = null;
    logEvent(e, toCanvas(e));
    previewCtxRef.current.clearRect(0, 0, WIDTH, HEIGHT);
    const isEmptyShape = op.type !== 'stroke' && Math.hypot(op.to[0] - op.from[0], op.to[1] - op.from[1]) < 2;
    if (e.type === 'pointercancel' || isEmptyShape) {
      render(ctxRef.current, history.ops, baseImage, WIDTH, HEIGHT);
      return;
    }
    dispatch({ type: 'add', op });
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('canvas-drawing', 'success', { firstTool: op.tool ?? op.type });
    }
  }

  // ---------------------------------------------------------------- commands
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const clear = useCallback(() => dispatch({ type: 'add', op: { type: 'clear' } }), []);

  useEffect(() => {
    function onKey(e) {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = TOOLS.find((x) => x.key === key);
        if (t) setTool(t.id);
        if (key === '[') setSize((s) => Math.max(1, s - 1));
        if (key === ']') setSize((s) => Math.min(40, s + 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  function download() {
    const a = document.createElement('a');
    a.href = exportPng(mainRef.current);
    a.download = `${(project?.title ?? 'drawing').replace(/[^\w-]+/g, '-')}.png`;
    a.click();
  }

  async function save(title) {
    const png = exportPng(mainRef.current);
    if (png.length > MAX_PNG_CHARS) {
      toast.error(`This drawing is ${(png.length / 1_000_000).toFixed(1)} MB as PNG; the limit is 2 MB. Simplify it or download it instead.`);
      return;
    }
    const payload = { title, type: 'canvas', files: [{ filename: 'drawing.png', content: png }] };
    setSaveDialog((d) => ({ ...d, saving: true, error: null }));
    try {
      const saved = project ? await projectsApi.save(project.id, payload) : await projectsApi.create(payload);
      setProject({ id: saved.id, title: saved.title });
      setSavedOps(history.ops);
      if (!project) setParams({ project: String(saved.id) }, { replace: true });
      setSaveDialog((d) => ({ ...d, open: false, saving: false }));
      toast.success(`Saved "${saved.title}".`);
    } catch (err) {
      setSaveDialog((d) => ({ ...d, saving: false, error: err.fields?.title ?? err.message }));
    }
  }

  // ---------------------------------------------------------------- open a saved drawing
  useEffect(() => {
    if (!projectParam || project?.id === Number(projectParam)) {
      setLoad({ status: 'ready', error: null });
      return undefined;
    }
    let cancelled = false;
    setLoad({ status: 'loading', error: null });
    projectsApi.get(projectParam).then((p) => {
      if (cancelled) return;
      const file = p.files.find((f) => f.filename === 'drawing.png');
      if (p.type !== 'canvas' || !file) {
        setLoad({ status: 'error', error: new Error(`"${p.title}" is not a Canvas Studio drawing.`) });
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setBaseImage(img);
        dispatch({ type: 'reset' });
        setSavedOps(initialHistory.ops);
        setProject({ id: p.id, title: p.title });
        setSaveDialog((d) => ({ ...d, title: p.title }));
        setLoad({ status: 'ready', error: null });
      };
      img.onerror = () => setLoad({ status: 'error', error: new Error('The saved image could not be decoded.') });
      img.src = file.content;
    }, (error) => !cancelled && setLoad({ status: 'error', error }));
    return () => { cancelled = true; };
  }, [projectParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unsaved work: warn on reload/close and on in-app navigation.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const ToolIcon = TOOL_ICONS[tool];

  return (
    <div className={styles.page}>
      <LabHeader
        icon={Palette}
        layer="dom"
        title="Canvas Studio"
        description="Draw with the HTML Canvas 2D API and Pointer Events. Every stroke is stored as an operation, which makes undo and redo exact and lets you see the Canvas calls behind it."
        concepts={['<canvas>', 'getContext("2d")', 'beginPath', 'quadraticCurveTo', 'arc', 'pointer events', 'setPointerCapture', 'toDataURL']}
        actions={(
          <>
            {project ? (dirty ? <Badge tone="warning">Unsaved changes</Badge> : <Badge tone="success">Saved</Badge>) : (dirty ? <Badge>Not saved</Badge> : null)}
            <Button icon={Download} onClick={download}>Download PNG</Button>
            <Button
              variant="primary"
              icon={Save}
              loading={saveDialog.saving && !saveDialog.open}
              disabled={Boolean(project) && !dirty}
              onClick={() => (project ? save(project.title) : setSaveDialog((d) => ({ ...d, open: true, error: null })))}
            >
              Save
            </Button>
          </>
        )}
      />

      <div className={styles.toolbar} role="toolbar" aria-label="Drawing tools">
        <div className={styles.toolGroup} role="radiogroup" aria-label="Tool">
          {TOOLS.map((t) => {
            const Icon = TOOL_ICONS[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={tool === t.id}
                className={styles.tool}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key.toUpperCase()})`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className={styles.toolLabel}>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.colors} role="group" aria-label="Colour">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.swatch}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
          <label className={styles.colorPicker} title="Custom colour">
            <span className="sr-only">Custom colour</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>

        <label className={styles.sizeControl}>
          <span>Size <strong>{size}px</strong></span>
          <input type="range" min={1} max={40} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>

        <label className={styles.fillToggle}>
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} disabled={tool !== 'rect' && tool !== 'circle'} />
          Fill shapes
        </label>

        <div className={styles.historyButtons}>
          <Button size="sm" variant="ghost" icon={Undo2} onClick={undo} disabled={!history.ops.length} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" />
          <Button size="sm" variant="ghost" icon={Redo2} onClick={redo} disabled={!history.redo.length} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)" />
          <Button size="sm" variant="danger" icon={Trash2} onClick={clear} disabled={!history.ops.length && !baseImage}>Clear</Button>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.surfaceCard}>
          {load.status === 'loading' && <div className={styles.overlay}><LoadingState label="Opening drawing…" /></div>}
          {load.status === 'error' && (
            <div className={styles.overlay}>
              <ErrorState title="Could not open this drawing" error={load.error} />
              <Button onClick={() => setParams({}, { replace: true })}>Start a new drawing</Button>
            </div>
          )}
          <div className={styles.surface} style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
            <canvas ref={mainRef} className={styles.canvas} role="img"
              aria-label={`Drawing canvas with ${history.ops.length} operation${history.ops.length === 1 ? '' : 's'}. Current tool: ${tool}.`} />
            <canvas
              ref={previewRef}
              className={`${styles.canvas} ${styles.preview}`}
              data-tool={tool}
              aria-hidden="true"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finish}
              onPointerCancel={finish}
              onPointerLeave={() => setCursor(null)}
            />
          </div>
          <p className={styles.statusLine}>
            <ToolIcon size={13} aria-hidden="true" /> {TOOLS.find((t) => t.id === tool).label}
            <span>·</span>{cursor ? `x ${cursor[0]}, y ${cursor[1]}` : 'pointer outside'}
            <span>·</span>{WIDTH} × {HEIGHT}
            <span className={styles.hint}>Shift: square / 45° · [ ] size · Ctrl+Z / Ctrl+Y</span>
          </p>
        </div>

        <div className={styles.side}>
          <Card title="Pointer events" icon={MousePointer2}>
            {events.length === 0 ? (
              <EmptyState title="Draw on the canvas">pointerdown, pointermove and pointerup appear here with their coordinates.</EmptyState>
            ) : (
              <>
                <p className={styles.moveCount}>pointermove fired <strong>{moveCount}</strong> time{moveCount === 1 ? '' : 's'} during the last stroke</p>
                <ol className={styles.events} aria-label="Recent pointer events">
                  {events.map((ev) => (
                    <li key={ev.id}>
                      <code className={styles.eventType}>{ev.type}</code>
                      <span>({ev.x}, {ev.y})</span>
                      <span className={styles.muted}>{ev.pointerType} · pressure {ev.pressure}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>

          <Card title="Canvas API calls" icon={Code}>
            {lastOp ? (
              <>
                <p className={styles.muted}>Last operation: {describeOp(lastOp)}</p>
                <pre className={styles.code}>{opToCode(lastOp)}</pre>
              </>
            ) : <EmptyState title="Nothing drawn yet">The 2D-context calls for your last stroke or shape will appear here.</EmptyState>}
          </Card>

          <Card title="History" icon={History}>
            {history.ops.length + history.redo.length === 0 ? (
              <p className={styles.muted}>{baseImage ? 'Opened drawing (base layer). New operations will be listed here.' : 'No operations yet.'}</p>
            ) : (
              <ol className={styles.historyList} aria-label="Operation history">
                {history.ops.map((op, i) => <li key={`d${i}`}>{i + 1}. {describeOp(op)}</li>)}
                {history.redo.map((op, i) => <li key={`r${i}`} className={styles.undone}>{history.ops.length + i + 1}. {describeOp(op)} <em>(undone)</em></li>)}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={saveDialog.open}
        onClose={() => setSaveDialog((d) => ({ ...d, open: false }))}
        title="Save drawing"
        description="Saved as a PNG in your projects."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSaveDialog((d) => ({ ...d, open: false }))} disabled={saveDialog.saving}>Cancel</Button>
            <Button variant="primary" icon={Save} type="submit" form="save-drawing" loading={saveDialog.saving}>Save drawing</Button>
          </>
        )}
      >
        <form id="save-drawing" noValidate onSubmit={(e) => {
          e.preventDefault();
          const title = saveDialog.title.trim();
          if (!title) setSaveDialog((d) => ({ ...d, error: 'Give your drawing a name.' }));
          else save(title);
        }}>
          <TextField label="Drawing name" value={saveDialog.title} maxLength={120} autoFocus
            onChange={(e) => setSaveDialog((d) => ({ ...d, title: e.target.value, error: null }))} error={saveDialog.error} />
        </form>
      </Modal>

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => blocker.reset?.()}>Keep drawing</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>Discard drawing</Button>
          </>
        )}
      >
        <p>Your drawing has unsaved changes. Save it as a project or download it first.</p>
      </Modal>
    </div>
  );
}
