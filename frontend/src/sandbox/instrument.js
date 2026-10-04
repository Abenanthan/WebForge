import { parse } from 'acorn';
import { simple } from 'acorn-walk';

export const LOOP_GUARD_FN = '__wfLoopGuard';

const LOOP_NODES = ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'];

/**
 * Prepare user JavaScript for the sandbox.
 *  1. Parse it (acorn): syntax errors are reported with exact line/column *before* running.
 *  2. Insert a guard call at the start of every loop body, so an infinite loop throws
 *     instead of freezing the page (the sandbox iframe shares the app's main thread).
 *
 * Insertions contain no newlines, so line numbers in error reports stay exact.
 *
 * @returns {{ ok: true, code: string, loops: number } | { ok: false, error: { message: string, line: number, col: number } }}
 */
export function instrumentScript(source) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
  } catch (err) {
    return {
      ok: false,
      error: {
        message: `SyntaxError: ${String(err.message).replace(/\s*\(\d+:\d+\)$/, '')}`,
        line: err.loc?.line ?? 1,
        col: (err.loc?.column ?? 0) + 1,
      },
    };
  }

  const inserts = [];
  const visitors = Object.fromEntries(LOOP_NODES.map((type) => [type, (node) => {
    inserts.push({ pos: node.body.start, text: `{${LOOP_GUARD_FN}();` });
    inserts.push({ pos: node.body.end, text: '}' });
  }]));
  simple(ast, visitors);

  // Apply from the end so earlier positions stay valid. Inserts sharing a position
  // are identical closing braces of nested loops, so their relative order is irrelevant.
  inserts.sort((a, b) => b.pos - a.pos);
  let code = source;
  for (const { pos, text } of inserts) {
    code = code.slice(0, pos) + text + code.slice(pos);
  }
  return { ok: true, code, loops: inserts.length / 2 };
}
