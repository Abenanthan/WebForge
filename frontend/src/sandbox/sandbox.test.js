import { describe, expect, it } from 'vitest';
import { instrumentScript, LOOP_GUARD_FN } from './instrument.js';
import { buildDocument, SANDBOX_CSP } from './buildDocument.js';

const opts = { runId: 'run-1', parentOrigin: 'http://localhost:5173' };

describe('instrumentScript', () => {
  it('reports syntax errors with 1-based line and column, without running', () => {
    const result = instrumentScript('const a = 1;\nconst b = ;\n');
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ line: 2, col: 11 });
    expect(result.error.message).toMatch(/^SyntaxError: Unexpected token$/);
  });

  it('guards every kind of loop, including brace-less and nested bodies', () => {
    const src = 'for (;;) x++;\nwhile (a) { b(); }\ndo y(); while (c);\nfor (const k in o) for (const v of k) z(v);';
    const result = instrumentScript(src);
    expect(result.ok).toBe(true);
    expect(result.loops).toBe(5);
    expect(result.code.split(`${LOOP_GUARD_FN}()`).length - 1).toBe(5);
    // Instrumented code still parses and keeps the same number of lines.
    expect(instrumentScript(result.code).ok).toBe(true);
    expect(result.code.split('\n')).toHaveLength(4);
  });

  it('stops a real infinite loop when executed', () => {
    const { code } = instrumentScript('let n = 0; while (true) { n++; }');
    let tripped = 0;
    const guard = () => { if (++tripped > 1000) throw new RangeError('Potential infinite loop'); };
    expect(() => new Function(LOOP_GUARD_FN, code)(guard)).toThrow(/infinite loop/);
  });
});

describe('buildDocument', () => {
  const files = {
    'index.html': '<!DOCTYPE html>\n<html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hi</h1><script src="script.js"></script></body></html>',
    'style.css': 'h1 { color: red; }',
    'script.js': 'console.log("</script>"); for (;;) {}',
  };

  it('inlines linked files and injects CSP + bridge before user markup', () => {
    const { srcdoc, diagnostics, stats } = buildDocument(files, opts);
    expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<h1>'));
    expect(srcdoc).toContain(SANDBOX_CSP);
    expect(srcdoc).toContain('h1 { color: red; }');
    expect(srcdoc).toContain('//# sourceURL=script.js');
    expect(srcdoc).toContain('"<\\/script>"'); // cannot close the script element early
    expect(srcdoc).not.toContain('src="script.js"');
    expect(stats).toEqual({ loopsGuarded: 1, linkedFiles: ['style.css', 'script.js'] });
    expect(diagnostics).toEqual([]);
  });

  it('explains unlinked files, missing files, missing doctype and external scripts', () => {
    const { diagnostics } = buildDocument({
      'index.html': '<p>x</p><link rel="stylesheet" href="theme.css"><script src="https://cdn.example.com/x.js"></script>',
      'style.css': 'p{}',
      'script.js': 'alert(1)',
    }, opts);
    const kinds = diagnostics.map((d) => `${d.kind}:${d.file}`);
    expect(kinds).toEqual(expect.arrayContaining([
      'link:index.html', 'unlinked:style.css', 'unlinked:script.js', 'doctype:index.html',
    ]));
    expect(diagnostics.filter((d) => d.kind === 'link')).toHaveLength(2);
  });

  it('does not run a script with a syntax error and reports where it is', () => {
    const { srcdoc, diagnostics } = buildDocument({ ...files, 'script.js': 'const = 5;' }, opts);
    expect(srcdoc).toContain('not executed: syntax error');
    expect(diagnostics[0]).toMatchObject({ severity: 'error', kind: 'syntax', file: 'script.js', line: 1 });
  });
});
