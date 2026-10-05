import { Parser } from 'acorn';
import jsx from 'acorn-jsx';

/**
 * Controlled JSX: one JSX expression, checked against a whitelist, then compiled
 * to React.createElement calls by this file (so learners can see exactly what JSX becomes).
 *
 * Only these names are reachable: the example's scope, arrow-function parameters and
 * a few harmless globals. No assignment, `new`, `this`, statements, regex, or access to
 * properties like `constructor`. That makes evaluating the result safe without a sandbox.
 */

const JsxParser = Parser.extend(jsx());

const ALLOWED_NODES = new Set([
  'Program', 'ExpressionStatement',
  'JSXElement', 'JSXOpeningElement', 'JSXClosingElement', 'JSXAttribute', 'JSXSpreadAttribute', 'JSXIdentifier',
  'JSXExpressionContainer', 'JSXEmptyExpression', 'JSXText', 'JSXFragment', 'JSXOpeningFragment', 'JSXClosingFragment',
  'Literal', 'TemplateLiteral', 'TemplateElement', 'Identifier', 'MemberExpression', 'CallExpression',
  'ArrowFunctionExpression', 'ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'UnaryExpression',
  'ObjectExpression', 'Property', 'ArrayExpression', 'SpreadElement', 'ChainExpression',
]);

/** Methods that only read or build new values. */
export const SAFE_METHODS = new Set([
  'map', 'filter', 'find', 'some', 'every', 'join', 'slice', 'concat', 'includes', 'indexOf',
  'toUpperCase', 'toLowerCase', 'trim', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'split',
  'toFixed', 'toString', 'toLocaleString', 'round', 'floor', 'ceil', 'max', 'min', 'abs',
]);
const BLOCKED_PROPERTIES = new Set(['constructor', '__proto__', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', 'call', 'apply', 'bind']);
const ALLOWED_GLOBALS = new Set(['undefined', 'NaN', 'Infinity', 'Math']);
const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'base', 'form', 'frame', 'frameset']);
const BLOCKED_ATTRIBUTES = new Set(['dangerouslySetInnerHTML', 'ref', 'srcDoc', 'formAction']);

export class JsxError extends Error {
  constructor(message, node) {
    super(message);
    this.line = node?.loc?.start.line ?? 1;
    this.col = (node?.loc?.start.column ?? 0) + 1;
  }
}

function children(node) {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) value.forEach((v) => v && typeof v.type === 'string' && out.push(v));
    else if (value && typeof value.type === 'string') out.push(value);
  }
  return out;
}

/** Throws JsxError at the first construct that is not allowed. */
function validate(node, scope, locals = new Set()) {
  if (!ALLOWED_NODES.has(node.type)) {
    const friendly = {
      AssignmentExpression: 'Assignments (=) are not allowed: JSX should describe UI, not change variables.',
      UpdateExpression: '++ / -- are not allowed here. Use the setter function from the example instead.',
      NewExpression: '`new` is not available in this playground.',
      FunctionExpression: 'Use arrow functions, e.g. () => setCount(count + 1).',
      ThisExpression: '`this` is not available here.',
      TaggedTemplateExpression: 'Tagged templates are not allowed.',
      SequenceExpression: 'Comma expressions are not allowed.',
      JSXMemberExpression: 'Member components (<A.B />) are not supported here.',
      JSXSpreadChild: 'Spread children are not supported.',
    }[node.type];
    throw new JsxError(friendly ?? `${node.type} is not allowed in this playground.`, node);
  }

  switch (node.type) {
    case 'Literal':
      if (node.regex) throw new JsxError('Regular expressions are not allowed here.', node);
      return;
    case 'Identifier':
      if (!scope.has(node.name) && !locals.has(node.name) && !ALLOWED_GLOBALS.has(node.name)) {
        throw new JsxError(`\`${node.name}\` is not available in this example. Available: ${[...scope].join(', ')}.`, node);
      }
      return;
    case 'MemberExpression': {
      validate(node.object, scope, locals);
      if (node.computed) {
        if (node.property.type !== 'Literal' || typeof node.property.value !== 'number') {
          throw new JsxError('Only numeric indexes like items[0] are allowed in brackets.', node.property);
        }
      } else if (BLOCKED_PROPERTIES.has(node.property.name)) {
        throw new JsxError(`Access to .${node.property.name} is blocked.`, node.property);
      }
      return;
    }
    case 'CallExpression': {
      const callee = node.callee;
      const ok = (callee.type === 'Identifier' && (scope.has(callee.name) || locals.has(callee.name)))
        || (callee.type === 'MemberExpression' && !callee.computed && SAFE_METHODS.has(callee.property.name));
      if (!ok) {
        const name = callee.type === 'MemberExpression' ? `.${callee.property.name}()` : `${callee.name ?? 'this'}()`;
        throw new JsxError(`Calling ${name} is not allowed. Allowed methods: ${[...SAFE_METHODS].slice(0, 12).join(', ')}…`, callee);
      }
      validate(callee, scope, locals);
      node.arguments.forEach((a) => validate(a, scope, locals));
      return;
    }
    case 'ArrowFunctionExpression': {
      if (node.async || node.generator) throw new JsxError('Async functions are not allowed.', node);
      if (node.body.type === 'BlockStatement') throw new JsxError('Use a concise arrow body: (x) => <li>{x}</li>.', node.body);
      const inner = new Set(locals);
      for (const p of node.params) {
        if (p.type !== 'Identifier') throw new JsxError('Use simple parameter names, e.g. (item, index) =>', p);
        inner.add(p.name);
      }
      validate(node.body, scope, inner);
      return;
    }
    case 'UnaryExpression':
      if (node.operator === 'delete') throw new JsxError('delete is not allowed.', node);
      break;
    case 'Property':
      if (node.computed || node.kind !== 'init' || node.method) throw new JsxError('Only plain object properties are allowed.', node);
      validate(node.value, scope, locals); // keys are names, not references
      return;
    case 'JSXOpeningElement': {
      const name = node.name.name;
      if (/^[a-z]/.test(name)) {
        if (BLOCKED_TAGS.has(name)) throw new JsxError(`<${name}> is not allowed in this playground.`, node);
      } else if (!scope.has(name)) {
        throw new JsxError(`<${name}> is not a component in this example. Available: ${[...scope].filter((s) => /^[A-Z]/.test(s)).join(', ') || 'none'}.`, node);
      }
      node.attributes.forEach((a) => validate(a, scope, locals));
      return;
    }
    case 'JSXClosingElement':
      return;
    case 'JSXAttribute': {
      const attr = node.name.name;
      if (BLOCKED_ATTRIBUTES.has(attr)) throw new JsxError(`The ${attr} attribute is not allowed.`, node);
      if (node.value?.type === 'Literal' && /^\s*javascript:/i.test(String(node.value.value))) {
        throw new JsxError('javascript: URLs are blocked.', node.value);
      }
      if (node.value) validate(node.value, scope, locals);
      return;
    }
    default:
      break;
  }
  children(node).forEach((c) => validate(c, scope, locals));
}

// ---------------------------------------------------------------- code generation

const isJsx = (n) => n.type === 'JSXElement' || n.type === 'JSXFragment';
const pad = (n) => '  '.repeat(n);
const propKey = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

/** React's JSX whitespace rules: trim around line breaks, collapse lines with a space. */
export function cleanJsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let out = '';
  lines.forEach((line, i) => {
    let text = line.replace(/\t/g, ' ');
    if (i !== 0) text = text.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) text = text.replace(/[ ]+$/, '');
    if (text) out += (out ? ' ' : '') + text;
  });
  return out;
}

function outermostJsx(node, found = []) {
  for (const child of children(node)) {
    if (isJsx(child)) found.push(child);
    else outermostJsx(child, found);
  }
  return found;
}

function makeGenerator(source) {
  // JS source of a non-JSX node, with any JSX inside it compiled.
  function rewrite(node, indent) {
    if (isJsx(node)) return gen(node, indent);
    let code = source.slice(node.start, node.end);
    const inner = outermostJsx(node).sort((a, b) => b.start - a.start);
    for (const j of inner) {
      code = code.slice(0, j.start - node.start) + gen(j, indent) + code.slice(j.end - node.start);
    }
    return code;
  }

  function gen(node, indent) {
    const isFragment = node.type === 'JSXFragment';
    let type = 'React.Fragment';
    let props = 'null';
    if (!isFragment) {
      const name = node.openingElement.name.name;
      type = /^[a-z]/.test(name) ? JSON.stringify(name) : name;
      const attrs = node.openingElement.attributes.map((a) => {
        if (a.type === 'JSXSpreadAttribute') return `...${rewrite(a.argument, indent + 1)}`;
        const key = propKey(a.name.name);
        if (!a.value) return `${key}: true`;
        if (a.value.type === 'Literal') return `${key}: ${JSON.stringify(a.value.value)}`;
        return `${key}: ${rewrite(a.value.expression, indent + 1)}`;
      });
      if (attrs.length) props = `{ ${attrs.join(', ')} }`;
    }
    const kids = [];
    for (const c of node.children) {
      if (c.type === 'JSXText') {
        const text = cleanJsxText(c.value);
        if (text) kids.push(JSON.stringify(text));
      } else if (c.type === 'JSXExpressionContainer') {
        if (c.expression.type !== 'JSXEmptyExpression') kids.push(rewrite(c.expression, indent + 1));
      } else {
        kids.push(gen(c, indent + 1));
      }
    }
    if (!kids.length) return `React.createElement(${type}, ${props})`;
    const inside = pad(indent + 1);
    return `React.createElement(\n${inside}${type},\n${inside}${props},\n${kids.map((k) => inside + k).join(',\n')}\n${pad(indent)})`;
  }

  return { rewrite };
}

/**
 * @param {string} source       a single JSX expression
 * @param {Iterable<string>} scopeNames  variables and components the example provides
 * @returns {{ ok: true, code: string } | { ok: false, error: { message: string, line: number, col: number } }}
 */
export function compileJsx(source, scopeNames) {
  let ast;
  try {
    ast = JsxParser.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (err) {
    return { ok: false, error: { message: `SyntaxError: ${String(err.message).replace(/\s*\(\d+:\d+\)$/, '')}`, line: err.loc?.line ?? 1, col: (err.loc?.column ?? 0) + 1 } };
  }
  try {
    if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement') {
      throw new JsxError('Write exactly one JSX expression (wrap siblings in <>…</>).', ast.body[1] ?? ast.body[0] ?? ast);
    }
    validate(ast, new Set(scopeNames));
  } catch (err) {
    if (err instanceof JsxError) return { ok: false, error: { message: err.message, line: err.line, col: err.col } };
    throw err;
  }
  const { rewrite } = makeGenerator(source);
  return { ok: true, code: rewrite(ast.body[0].expression, 0) };
}

/** Evaluate compiled code with only React and the example's scope in reach. */
export function evaluate(code, React, scope) {
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const fn = new Function('React', ...names, `"use strict";\nreturn (${code});`);
  return fn(React, ...names.map((n) => scope[n]));
}
