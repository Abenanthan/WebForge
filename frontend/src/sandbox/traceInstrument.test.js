import { describe, expect, it } from 'vitest';
import { instrumentForTrace, TRACE_OBJECT } from './traceInstrument.js';
import { LOOP_GUARD_FN } from './instrument.js';

/** Execute instrumented code with a recording tracer; returns { events, result }. */
function run(source, resultExpr = 'undefined') {
  const out = instrumentForTrace(source);
  if (!out.ok) throw new Error(out.error.message);
  const events = [];
  const tracer = {
    v: (line, names, values) => events.push(['v', line, Object.fromEntries(names.map((n, i) => [n, values[i]]))]),
    c: (line, src, value) => { events.push(['c', line, src, Boolean(value)]); return value; },
    f: (line, name, params, values) => events.push(['f', line, name, Object.fromEntries(params.map((p, i) => [p, values[i]]))]),
    r: (line, name, value) => { events.push(['r', line, name, value]); return value; },
  };
  // eslint-disable-next-line no-new-func
  const result = new Function(TRACE_OBJECT, LOOP_GUARD_FN, `${out.code}\nreturn ${resultExpr};`)(tracer, () => {});
  return { events, result, code: out.code };
}

describe('instrumentForTrace', () => {
  it('records declarations and changes with their current values', () => {
    const { events } = run('let a = 2;\nconst { b, c: [d] } = { b: a * 3, c: [4] };\na++;\na += 10;');
    expect(events).toEqual([
      ['v', 1, { a: 2 }],
      ['v', 2, { b: 6, d: 4 }],
      ['v', 3, { a: 3 }],
      ['v', 4, { a: 13 }],
    ]);
  });

  it('records conditions, loop checks, calls and returns', () => {
    const src = [
      'function grade(score) {',
      '  if (score >= 50) return "pass";',
      '  return "fail";',
      '}',
      'let total = 0;',
      'for (let i = 0; i < 2; i++) { total += i; }',
      'const label = grade(total);',
    ].join('\n');
    const { events, result } = run(src, 'label');
    expect(result).toBe('fail');
    expect(events).toEqual([
      ['v', 5, { total: 0 }],
      ['c', 6, 'i < 2', true],
      ['v', 6, { total: 0 }],
      ['c', 6, 'i < 2', true],
      ['v', 6, { total: 1 }],
      ['c', 6, 'i < 2', false],
      ['f', 1, 'grade', { score: 1 }],
      ['c', 2, 'score >= 50', false],
      ['r', 3, 'grade', 'fail'],
      ['v', 7, { label: 'fail' }],
    ]);
  });

  it('handles concise arrows, ternaries and nested closures without changing results', () => {
    const src = [
      'const sign = (x) => x > 0 ? "pos" : "neg";',
      'function makeDoubler() { return (n) => n * 2; }',
      'const results = [sign(3), sign(-1), makeDoubler()(21)];',
    ].join('\n');
    const { events, result, code } = run(src, 'results');
    expect(result).toEqual(['pos', 'neg', 42]);
    expect(code.split('\n')).toHaveLength(3); // line numbers preserved
    expect(events.filter((e) => e[0] === 'r').map((e) => [e[2], e[3]])).toEqual([
      ['sign', 'pos'], ['sign', 'neg'], ['makeDoubler', expect.any(Function)], ['(arrow function)', 42],
    ]);
  });

  it('records in-place mutations through methods and properties', () => {
    const { events } = run('const list = [];\nlist.push(1);\nconst user = {};\nuser.name = "A";\nlist.map(String);');
    expect(events.map((e) => [e[1], Object.keys(e[2])[0]])).toEqual([[1, 'list'], [2, 'list'], [3, 'user'], [4, 'user']]);
  });

  it('reports syntax errors with location', () => {
    expect(instrumentForTrace('let x = ;')).toMatchObject({ ok: false, error: { line: 1, col: 9 } });
  });
});
