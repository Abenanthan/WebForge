/**
 * Canvas Studio drawing model.
 * A drawing is a list of operations (vector history), not pixel snapshots:
 *   { type: 'stroke', tool: 'pencil' | 'eraser', color, size, points: [[x, y], ...] }
 *   { type: 'line' | 'rect' | 'circle', color, size, fill, from: [x, y], to: [x, y] }
 *   { type: 'clear' }
 * Undo/redo moves operations between two stacks; the canvas is re-rendered from them.
 */

export const TOOLS = [
  { id: 'pencil', label: 'Pencil', key: 'p' },
  { id: 'line', label: 'Line', key: 'l' },
  { id: 'rect', label: 'Rectangle', key: 'r' },
  { id: 'circle', label: 'Circle', key: 'c' },
  { id: 'eraser', label: 'Eraser', key: 'e' },
];

const round = (n) => Math.round(n * 10) / 10;

/** Constrain a shape while Shift is held: square rectangles, 45° lines. */
export function constrain(type, from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (type === 'rect') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return [from[0] + Math.sign(dx || 1) * side, from[1] + Math.sign(dy || 1) * side];
  }
  if (type === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length];
  }
  return to;
}

function applyStyle(ctx, op) {
  ctx.globalCompositeOperation = op.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Draw one operation onto a 2D context. */
export function drawOp(ctx, op) {
  if (op.type === 'clear') {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  ctx.save();
  applyStyle(ctx, op);
  ctx.beginPath();
  if (op.type === 'stroke') {
    const pts = op.points;
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) {
      // A single tap: draw a dot.
      ctx.arc(pts[0][0], pts[0][1], op.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Smooth the stroke with quadratic curves through segment midpoints.
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  } else if (op.type === 'line') {
    ctx.moveTo(op.from[0], op.from[1]);
    ctx.lineTo(op.to[0], op.to[1]);
    ctx.stroke();
  } else if (op.type === 'rect') {
    ctx.rect(op.from[0], op.from[1], op.to[0] - op.from[0], op.to[1] - op.from[1]);
    if (op.fill) ctx.fill();
    ctx.stroke();
  } else if (op.type === 'circle') {
    const r = Math.hypot(op.to[0] - op.from[0], op.to[1] - op.from[1]);
    ctx.arc(op.from[0], op.from[1], r, 0, Math.PI * 2);
    if (op.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Redraw everything: optional base image (an opened drawing) followed by every operation. */
export function render(ctx, ops, baseImage, width, height) {
  ctx.clearRect(0, 0, width, height);
  if (baseImage) ctx.drawImage(baseImage, 0, 0, width, height);
  for (const op of ops) drawOp(ctx, op);
}

/** The Canvas API calls that produce an operation, as a learner would write them. */
export function opToCode(op) {
  if (op.type === 'clear') return 'ctx.clearRect(0, 0, canvas.width, canvas.height);';
  const lines = [
    `ctx.globalCompositeOperation = '${op.tool === 'eraser' ? 'destination-out' : 'source-over'}';${op.tool === 'eraser' ? '  // erase pixels' : ''}`,
    `ctx.strokeStyle = '${op.color}';`,
    ...(op.fill ? [`ctx.fillStyle = '${op.color}';`] : []),
    `ctx.lineWidth = ${op.size};`,
    "ctx.lineCap = 'round';",
    'ctx.beginPath();',
  ];
  if (op.type === 'stroke') {
    const [x, y] = op.points[0];
    lines.push(`ctx.moveTo(${round(x)}, ${round(y)});`);
    const segments = Math.max(0, op.points.length - 2);
    op.points.slice(1, Math.min(op.points.length - 1, 4)).forEach((p, i) => {
      const next = op.points[i + 2];
      lines.push(`ctx.quadraticCurveTo(${round(p[0])}, ${round(p[1])}, ${round((p[0] + next[0]) / 2)}, ${round((p[1] + next[1]) / 2)});`);
    });
    if (segments > 3) lines.push(`// … ${segments - 3} more quadraticCurveTo() calls (one per pointermove)`);
    const last = op.points[op.points.length - 1];
    lines.push(`ctx.lineTo(${round(last[0])}, ${round(last[1])});`, 'ctx.stroke();');
  } else if (op.type === 'line') {
    lines.push(`ctx.moveTo(${round(op.from[0])}, ${round(op.from[1])});`, `ctx.lineTo(${round(op.to[0])}, ${round(op.to[1])});`, 'ctx.stroke();');
  } else if (op.type === 'rect') {
    lines.push(`ctx.rect(${round(op.from[0])}, ${round(op.from[1])}, ${round(op.to[0] - op.from[0])}, ${round(op.to[1] - op.from[1])});`);
    if (op.fill) lines.push('ctx.fill();');
    lines.push('ctx.stroke();');
  } else if (op.type === 'circle') {
    const r = Math.hypot(op.to[0] - op.from[0], op.to[1] - op.from[1]);
    lines.push(`ctx.arc(${round(op.from[0])}, ${round(op.from[1])}, ${round(r)}, 0, Math.PI * 2);`);
    if (op.fill) lines.push('ctx.fill();');
    lines.push('ctx.stroke();');
  }
  return lines.join('\n');
}

export function describeOp(op) {
  if (op.type === 'clear') return 'Clear canvas';
  if (op.type === 'stroke') return `${op.tool === 'eraser' ? 'Eraser' : 'Pencil'} stroke · ${op.points.length} points`;
  return `${{ line: 'Line', rect: 'Rectangle', circle: 'Circle' }[op.type]}${op.fill ? ' (filled)' : ''}`;
}

// ---------------------------------------------------------------- history

export const initialHistory = { ops: [], redo: [] };

export function historyReducer(state, action) {
  switch (action.type) {
    case 'add':
      return { ops: [...state.ops, action.op], redo: [] };
    case 'undo':
      if (!state.ops.length) return state;
      return { ops: state.ops.slice(0, -1), redo: [state.ops[state.ops.length - 1], ...state.redo] };
    case 'redo':
      if (!state.redo.length) return state;
      return { ops: [...state.ops, state.redo[0]], redo: state.redo.slice(1) };
    case 'reset':
      return initialHistory;
    default:
      throw new Error(`Unknown history action ${action.type}`);
  }
}
