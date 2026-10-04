import { BRIDGE_SOURCE } from './bridgeRuntime.js';
import { instrumentScript, LOOP_GUARD_FN } from './instrument.js';

export const LOOP_LIMIT_MS = 1500;

/**
 * Content-Security-Policy of every preview document. The iframe is also sandboxed
 * (allow-scripts allow-modals only: no same-origin, forms, popups or top navigation).
 */
export const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'font-src data: https:',
  'media-src data: blob: https:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const LINK_TAG = /<link\b[^>]*>/gi;
const SCRIPT_SRC_TAG = /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi;

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return m ? m[1] : null;
}

const isExternal = (url) => /^(https?:)?\/\//i.test(url);
const escapeStyle = (css) => css.replace(/<\/style/gi, '<\\/style');
const escapeScript = (js) => js.replace(/<\/script/gi, '<\\/script');
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Turn the project's files into one self-contained srcdoc document, the way a
 * browser would load index.html with its linked style.css and script.js.
 *
 * @param {Record<string,string>} files  filename → content (must include index.html)
 * @returns {{ srcdoc: string, diagnostics: Array<{severity:'error'|'warning'|'info', kind:string, file:string, line?:number, col?:number, message:string}>, stats: object }}
 */
export function buildDocument(files, { runId, parentOrigin }) {
  const diagnostics = [];
  const linked = new Set();
  let html = files['index.html'] ?? '';
  let loops = 0;

  // <link rel="stylesheet" href="style.css">  →  <style>…</style>
  html = html.replace(LINK_TAG, (tag) => {
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!rel.split(/\s+/).includes('stylesheet') || !href || isExternal(href)) return tag;
    const name = href.replace(/^\.\//, '');
    if (!(name in files)) {
      diagnostics.push({ severity: 'warning', kind: 'link', file: 'index.html', message: `"${href}" is linked from index.html but does not exist in this project.` });
      return `<!-- missing stylesheet: ${escapeAttr(href)} -->`;
    }
    linked.add(name);
    return `<style data-webforge-file="${escapeAttr(name)}">\n${escapeStyle(files[name])}\n</style>`;
  });

  // <script src="script.js"></script>  →  inline, instrumented script
  html = html.replace(SCRIPT_SRC_TAG, (tag, before, src) => {
    if (isExternal(src)) {
      diagnostics.push({ severity: 'warning', kind: 'link', file: 'index.html', message: `External script "${src}" is not allowed in the sandbox. Only project files can run.` });
      return `<!-- blocked external script: ${escapeAttr(src)} -->`;
    }
    const name = src.replace(/^\.\//, '');
    if (!(name in files)) {
      diagnostics.push({ severity: 'warning', kind: 'link', file: 'index.html', message: `"${src}" is referenced by a <script> tag but does not exist in this project.` });
      return `<!-- missing script: ${escapeAttr(src)} -->`;
    }
    linked.add(name);
    const result = instrumentScript(files[name]);
    if (!result.ok) {
      diagnostics.push({ severity: 'error', kind: 'syntax', file: name, line: result.error.line, col: result.error.col, message: result.error.message });
      return `<!-- ${escapeAttr(name)} not executed: syntax error -->`;
    }
    loops += result.loops;
    return `<script data-webforge-file="${escapeAttr(name)}">${escapeScript(result.code)}\n//# sourceURL=${name}\n</script>`;
  });

  // Teach the linking model: files only apply when index.html references them.
  for (const [name, content] of Object.entries(files)) {
    if (name === 'index.html' || linked.has(name) || !content.trim()) continue;
    const hint = name.endsWith('.css')
      ? `<link rel="stylesheet" href="${name}">`
      : `<script src="${name}"></script>`;
    diagnostics.push({ severity: 'info', kind: 'unlinked', file: name, message: `${name} is not used: index.html does not reference it. Add ${hint}.` });
  }

  if (!/^\s*<!doctype html>/i.test(html)) {
    diagnostics.push({ severity: 'info', kind: 'doctype', file: 'index.html', line: 1, message: 'index.html has no <!DOCTYPE html>, so the browser renders it in quirks mode.' });
  }

  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`,
    `<script>(${BRIDGE_SOURCE})(${JSON.stringify(runId)}, ${JSON.stringify(parentOrigin)}, ${JSON.stringify(LOOP_GUARD_FN)}, ${LOOP_LIMIT_MS});</script>`,
  ].join('');

  // The policy and bridge must come before any user markup.
  let srcdoc;
  if (/<head\b[^>]*>/i.test(html)) srcdoc = html.replace(/<head\b[^>]*>/i, (m) => m + head);
  else if (/<html\b[^>]*>/i.test(html)) srcdoc = html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${head}</head>`);
  else srcdoc = head + html;

  return { srcdoc, diagnostics, stats: { loopsGuarded: loops, linkedFiles: [...linked] } };
}
