import { describe, expect, it, vi } from 'vitest';
import { constrain, drawOp, historyReducer, initialHistory, opToCode } from './canvasOps.js';

const line = { type: 'line', color: '#000', size: 2, from: [0, 0], to: [10, 10] };
const rect = { type: 'rect', color: '#f00', size: 3, fill: true, from: [5, 5], to: [25, 15] };

describe('history reducer', () => {
  it('adds, undoes and redoes operations', () => {
    let s = historyReducer(initialHistory, { type: 'add', op: line });
    s = historyReducer(s, { type: 'add', op: rect });
    s = historyReducer(s, { type: 'undo' });
    expect(s.ops).toEqual([line]);
    expect(s.redo).toEqual([rect]);
    s = historyReducer(s, { type: 'redo' });
    expect(s.ops).toEqual([line, rect]);
    expect(s.redo).toEqual([]);
  });

  it('a new operation discards the redo stack', () => {
    let s = historyReducer(initialHistory, { type: 'add', op: line });
    s = historyReducer(s, { type: 'undo' });
    s = historyReducer(s, { type: 'add', op: rect });
    expect(s).toEqual({ ops: [rect], redo: [] });
  });

  it('undo / redo with nothing to do keep the same state', () => {
    expect(historyReducer(initialHistory, { type: 'undo' })).toBe(initialHistory);
    expect(historyReducer(initialHistory, { type: 'redo' })).toBe(initialHistory);
  });
});

describe('shape helpers', () => {
  it('constrains rectangles to squares and lines to 45° steps', () => {
    expect(constrain('rect', [0, 0], [30, -10])).toEqual([30, -30]);
    const [x, y] = constrain('line', [0, 0], [10, 9]);
    expect(Math.round(x)).toBe(Math.round(y)); // snapped to the 45° diagonal
  });

  it('draws with the Canvas API calls shown to the learner', () => {
    const calls = [];
    const ctx = new Proxy({ canvas: { width: 100, height: 100 } }, {
      get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push([prop, ...args])),
      set: (target, prop, value) => { calls.push([`${String(prop)}=`, value]); return true; },
    });
    drawOp(ctx, rect);
    expect(calls).toContainEqual(['rect', 5, 5, 20, 10]);
    expect(calls).toContainEqual(['fill']);
    expect(calls).toContainEqual(['stroke']);
    expect(opToCode(rect)).toContain('ctx.rect(5, 5, 20, 10);');
    expect(opToCode({ type: 'stroke', tool: 'eraser', color: '#fff', size: 8, points: [[1, 1], [2, 2], [3, 3]] }))
      .toContain("ctx.globalCompositeOperation = 'destination-out';");
    vi.restoreAllMocks();
  });
});
