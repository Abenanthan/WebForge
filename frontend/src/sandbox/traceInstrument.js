import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';
import { LOOP_GUARD_FN } from './instrument.js';

/** Global object installed by the bridge (bridgeRuntime.js) when tracing is enabled. */
export const TRACE_OBJECT = '__wfTrace';

const STATEMENT_LISTS = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchCase']);
const LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** Identifiers bound by a declaration pattern: `x`, `{ a, b: c }`, `[d, ...e]`. */
function boundNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier': out.push(pattern.name); break;
    case 'ObjectPattern': pattern.properties.forEach((p) => boundNames(p.type === 'RestElement' ? p.argument : p.value, out)); break;
    case 'ArrayPattern': pattern.elements.forEach((el) => boundNames(el, out)); break;
    case 'RestElement': boundNames(pattern.argument, out); break;
    case 'AssignmentPattern': boundNames(pattern.left, out); break;
    default: break;
  }
  return out;
}

const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear']);

/** The variable an expression statement changes: `x = …`, `x++`, `obj.a = …`, `list.push(…)`. */
function changedName(expr) {
  if (expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression' && !expr.callee.computed
    && MUTATING_METHODS.has(expr.callee.property.name) && expr.callee.object.type === 'Identifier') {
    return expr.callee.object.name;
  }
  const target = expr.type === 'AssignmentExpression' ? expr.left : expr.type === 'UpdateExpression' ? expr.argument : null;
  if (!target) return null;
  if (target.type === 'Identifier') return target.name;
  if (target.type === 'MemberExpression') {
    let obj = target;
    while (obj.type === 'MemberExpression') obj = obj.object;
    return obj.type === 'Identifier' ? obj.name : null;
  }
  return null;
}

function functionName(fn, ancestors) {
  if (fn.id?.name) return fn.id.name;
  const parent = ancestors[ancestors.length - 2];
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if (parent?.type === 'Property' || parent?.type === 'MethodDefinition') return parent.key.name ?? parent.key.value ?? 'method';
  if (parent?.type === 'AssignmentExpression' && parent.left.type === 'Identifier') return parent.left.name;
  return fn.type === 'ArrowFunctionExpression' ? '(arrow function)' : '(anonymous)';
}

const nearestFunction = (ancestors) => {
  for (let i = ancestors.length - 2; i >= 0; i--) if (FUNCTIONS.has(ancestors[i].type)) return ancestors[i];
  return null;
};

/**
 * Instrument user JavaScript for the JS Playground's execution timeline:
 *   T.v(line, names, values)   after a statement that declares/changes variables
 *   T.c(line, source, value)   wraps if/loop conditions (returns the value)
 *   T.f(line, name, params, values) at function entry
 *   T.r(line, name, value)     wraps return values (returns the value)
 * plus the infinite-loop guard. All insertions are single-line so positions stay exact.
 *
 * @returns {{ ok: true, code: string } | { ok: false, error: { message, line, col } }}
 */
export function instrumentForTrace(source) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (err) {
    return {
      ok: false,
      error: { message: `SyntaxError: ${String(err.message).replace(/\s*\(\d+:\d+\)$/, '')}`, line: err.loc?.line ?? 1, col: (err.loc?.column ?? 0) + 1 },
    };
  }

  const T = TRACE_OBJECT;
  const inserts = [];
  let seq = 0;
  const open = (pos, text) => inserts.push({ pos, text, open: true, seq: seq++ });
  const close = (pos, text) => inserts.push({ pos, text, open: false, seq: seq++ });
  const src = (node) => JSON.stringify(source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 80));
  const inStatementList = (ancestors) => STATEMENT_LISTS.has(ancestors[ancestors.length - 2]?.type);
  const report = (node, names) => {
    if (!names.length) return;
    close(node.end, `;${T}.v(${node.loc.start.line},${JSON.stringify(names)},[${names.join(',')}]);`);
  };

  ancestor(ast, {
    VariableDeclaration(node, _state, ancestors) {
      if (inStatementList(ancestors)) report(node, node.declarations.flatMap((d) => boundNames(d.id)));
    },
    ExpressionStatement(node, _state, ancestors) {
      const name = changedName(node.expression);
      if (name && inStatementList(ancestors)) report(node, [name]);
    },
    IfStatement(node) {
      open(node.test.start, `${T}.c(${node.test.loc.start.line},${src(node.test)},`);
      close(node.test.end, ')');
    },
    ConditionalExpression(node) {
      open(node.test.start, `${T}.c(${node.test.loc.start.line},${src(node.test)},`);
      close(node.test.end, ')');
    },
    ReturnStatement(node, _state, ancestors) {
      if (!node.argument) return;
      const fn = nearestFunction(ancestors);
      open(node.argument.start, `${T}.r(${node.loc.start.line},${JSON.stringify(fn ? functionName(fn, ancestors.slice(0, ancestors.indexOf(fn) + 1)) : '?')},`);
      close(node.argument.end, ')');
    },
    ...Object.fromEntries([...LOOPS].map((type) => [type, (node) => {
      if (node.test && type !== 'ForInStatement' && type !== 'ForOfStatement') {
        open(node.test.start, `${T}.c(${node.test.loc.start.line},${src(node.test)},`);
        close(node.test.end, ')');
      }
      open(node.body.start, `{${LOOP_GUARD_FN}();`);
      close(node.body.end, '}');
    }])),
    ...Object.fromEntries([...FUNCTIONS].map((type) => [type, (node, _state, ancestors) => {
      const name = JSON.stringify(functionName(node, ancestors));
      const params = node.params.flatMap((p) => boundNames(p));
      const entry = `${T}.f(${node.loc.start.line},${name},${JSON.stringify(params)},[${params.join(',')}]);`;
      if (node.body.type === 'BlockStatement') {
        open(node.body.start + 1, entry);
      } else {
        // Concise arrow body: record the call and the returned value.
        open(node.body.start, `(${entry.slice(0, -1)},${T}.r(${node.body.loc.start.line},${name},`);
        close(node.body.end, '))');
      }
    }])),
  });

  // Apply from the end. At the same position the text must read: closes (inner → outer),
  // then opens (outer → inner). The single walk runs callbacks post-order (inner first), so:
  inserts.sort((a, b) => (b.pos - a.pos)
    || (a.open === b.open ? (a.open ? a.seq - b.seq : b.seq - a.seq) : (a.open ? -1 : 1)));
  let code = source;
  for (const { pos, text } of inserts) code = code.slice(0, pos) + text + code.slice(pos);
  return { ok: true, code };
}
