import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanJsxText, compileJsx, evaluate } from './jsxCompiler.js';

const run = (source, scope) => {
  const out = compileJsx(source, Object.keys(scope));
  if (!out.ok) throw new Error(out.error.message);
  return { code: out.code, html: renderToStaticMarkup(evaluate(out.code, React, scope)) };
};

describe('compileJsx: code generation', () => {
  it('compiles elements, attributes and expressions to React.createElement', () => {
    const { code, html } = run('<h1 className="title">Hello, {user.name}!</h1>', { user: { name: 'Asha' } });
    expect(code).toContain('React.createElement(');
    expect(code).toContain('"h1"');
    expect(code).toContain('{ className: "title" }');
    expect(html).toBe('<h1 class="title">Hello, Asha!</h1>');
  });

  it('handles components, fragments, lists with keys and nested JSX inside expressions', () => {
    const Badge = ({ label }) => React.createElement('b', null, label);
    const { html } = run(
      `<>
        <Badge label="new" />
        <ul>
          {items.map((item) => <li key={item}>{item.toUpperCase()}</li>)}
        </ul>
        {isAdmin ? <em>admin</em> : <span>guest</span>}
      </>`,
      { Badge, items: ['a', 'b'], isAdmin: false },
    );
    expect(html).toBe('<b>new</b><ul><li>A</li><li>B</li></ul><span>guest</span>');
  });

  it('applies React whitespace rules to JSX text', () => {
    expect(cleanJsxText('\n    Hello\n    world  \n')).toBe('Hello world');
    expect(cleanJsxText(' a ')).toBe(' a ');
    expect(cleanJsxText('\n   \n')).toBe('');
  });

  it('supports boolean, spread and style attributes', () => {
    const { html } = run('<input disabled {...extra} style={{ color: "red" }} />', { extra: { placeholder: 'x' } });
    expect(html).toBe('<input disabled="" placeholder="x" style="color:red"/>');
  });
});

describe('compileJsx: safety', () => {
  const blocked = [
    ['<div>{window.location}</div>', /window/],
    ['<div>{fetch("/api")}</div>', /fetch/],
    ['<div>{user.constructor}</div>', /constructor/],
    ['<div>{items["map"]}</div>', /numeric indexes/],
    ['<div>{(user.name = "x")}</div>', /Assignments/],
    ['<script>alert(1)</script>', /<script> is not allowed/],
    ['<div dangerouslySetInnerHTML={{ __html: "x" }} />', /dangerouslySetInnerHTML/],
    ['<a href="javascript:alert(1)">x</a>', /javascript: URLs/],
    ['<Unknown />', /not a component/],
    ['<div>{items.map(function (i) { return i; })}</div>', /arrow functions/],
    ['<div>{new Date()}</div>', /new/],
    ['<div>{eval("1")}</div>', /eval/],
    ['<div /><div />', /Adjacent JSX elements must be wrapped/],
    ['<div />;\n<span />', /exactly one JSX expression/],
  ];
  for (const [source, message] of blocked) {
    it(`rejects ${source}`, () => {
      const out = compileJsx(source, ['user', 'items']);
      expect(out.ok).toBe(false);
      expect(out.error.message).toMatch(message);
      expect(out.error.line).toBeGreaterThanOrEqual(1);
    });
  }

  it('reports syntax errors with a location', () => {
    expect(compileJsx('<div>\n  <span>\n</div>', [])).toMatchObject({ ok: false, error: { line: 3 } });
  });
});
