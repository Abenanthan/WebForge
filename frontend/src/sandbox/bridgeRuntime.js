/**
 * Runtime injected as the first script of every sandboxed preview document.
 * It runs INSIDE the iframe (opaque origin) and reports to the app via postMessage:
 *   console  — console.log/info/warn/error/debug/table/clear, with serialized values
 *   error    — uncaught errors, unhandled promise rejections, failed resources
 *   notice   — sandbox-specific hints (e.g. blocked form submission)
 *   ready    — DOMContentLoaded, with time since navigation start
 *
 * Kept as a plain ES5 function: it is stringified into the document, never bundled.
 */
// eslint-disable-next-line no-unused-vars
function webforgeBridge(RUN_ID, PARENT_ORIGIN, LOOP_GUARD_FN, LOOP_LIMIT_MS, TRACE_OBJECT, MAX_TRACE_EVENTS) {
  var parentWindow = window.parent;
  var nativeConsole = {};

  function post(type, payload) {
    try {
      parentWindow.postMessage({ __webforge: 'sandbox', runId: RUN_ID, type: type, payload: payload, at: Date.now() }, PARENT_ORIGIN);
    } catch (e) {
      /* value could not be cloned; ignore */
    }
  }

  // ---------- value serialization (structured, depth-limited, cycle-safe) ----------
  var MAX_DEPTH = 3;
  var MAX_ENTRIES = 50;

  function describeElement(el) {
    var s = '<' + el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList && el.classList.length) s += '.' + Array.prototype.join.call(el.classList, '.');
    return s + '>';
  }

  function serialize(value, depth, seen) {
    var type = typeof value;
    if (value === null) return { t: 'null' };
    if (type === 'undefined') return { t: 'undefined' };
    if (type === 'string') return { t: 'string', v: value.length > 2000 ? value.slice(0, 2000) + '…' : value };
    if (type === 'number' || type === 'boolean') return { t: type, v: String(value) };
    if (type === 'bigint') return { t: 'bigint', v: value.toString() + 'n' };
    if (type === 'symbol') return { t: 'symbol', v: value.toString() };
    if (type === 'function') return { t: 'function', v: 'ƒ ' + (value.name || 'anonymous') + '()' };
    if (value instanceof Error) return { t: 'error', v: value.name + ': ' + value.message };
    if (typeof Node !== 'undefined' && value instanceof Node) {
      if (value.nodeType === 1) return { t: 'element', v: describeElement(value), html: value.outerHTML.slice(0, 300) };
      if (value.nodeType === 3) return { t: 'string', v: '#text "' + value.textContent + '"' };
      return { t: 'object', ctor: value.nodeName, entries: [] };
    }
    if (value instanceof Date) return { t: 'date', v: value.toISOString() };
    if (value instanceof RegExp) return { t: 'regexp', v: String(value) };
    if (seen.indexOf(value) !== -1) return { t: 'circular' };
    if (depth >= MAX_DEPTH) return { t: Array.isArray(value) ? 'array' : 'object', truncated: true, size: Array.isArray(value) ? value.length : undefined };

    seen = seen.concat([value]);
    if (Array.isArray(value) || (typeof NodeList !== 'undefined' && value instanceof NodeList)) {
      var items = [];
      for (var i = 0; i < value.length && i < MAX_ENTRIES; i++) items.push(serialize(value[i], depth + 1, seen));
      return { t: 'array', ctor: Array.isArray(value) ? '' : 'NodeList', size: value.length, items: items };
    }
    if (value instanceof Map || value instanceof Set) {
      var mapEntries = [];
      value.forEach(function (v, k) {
        if (mapEntries.length < MAX_ENTRIES) {
          mapEntries.push([value instanceof Map ? serialize(k, depth + 1, seen) : null, serialize(v, depth + 1, seen)]);
        }
      });
      return { t: value instanceof Map ? 'map' : 'set', size: value.size, entries: mapEntries };
    }
    var keys = Object.keys(value);
    var entries = [];
    for (var j = 0; j < keys.length && j < MAX_ENTRIES; j++) {
      var v;
      try { v = value[keys[j]]; } catch (e) { v = '[unreadable]'; }
      entries.push([keys[j], serialize(v, depth + 1, seen)]);
    }
    var ctor = value.constructor && value.constructor.name !== 'Object' ? value.constructor.name : '';
    return { t: 'object', ctor: ctor, size: keys.length, entries: entries };
  }

  function serializeArgs(args) {
    var out = [];
    for (var i = 0; i < args.length; i++) out.push(serialize(args[i], 0, []));
    return out;
  }

  // ---------- console ----------
  ['log', 'info', 'warn', 'error', 'debug', 'table'].forEach(function (level) {
    nativeConsole[level] = console[level];
    console[level] = function () {
      post('console', { level: level === 'table' ? 'log' : level, args: serializeArgs(arguments) });
      if (nativeConsole[level]) nativeConsole[level].apply(console, arguments);
    };
  });
  console.clear = function () { post('console-clear', {}); };

  // ---------- errors ----------
  function scriptPosition(stack) {
    var m = /(?:^|[\s(@])((?:[\w-]+)\.(?:js|jsx)):(\d+):(\d+)/.exec(stack || '');
    return m ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : null;
  }

  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target !== window && target.tagName) {
      // Resource failed to load (img, link, script...); these do not bubble, hence capture.
      post('error', { kind: 'resource', message: 'Failed to load <' + target.tagName.toLowerCase() + '>: ' + (target.src || target.href || '') });
      return;
    }
    var pos = scriptPosition(event.error && event.error.stack);
    post('error', {
      kind: 'runtime',
      message: event.message || (event.error && String(event.error)) || 'Unknown error',
      file: pos ? pos.file : null,
      line: pos ? pos.line : event.lineno || null,
      col: pos ? pos.col : event.colno || null,
      stack: event.error && event.error.stack ? String(event.error.stack).split('\n').slice(0, 6).join('\n') : null,
    });
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var pos = scriptPosition(reason && reason.stack);
    post('error', {
      kind: 'promise',
      message: 'Unhandled promise rejection: ' + (reason instanceof Error ? reason.name + ': ' + reason.message : String(reason)),
      file: pos ? pos.file : null,
      line: pos ? pos.line : null,
      col: pos ? pos.col : null,
    });
  });

  // ---------- infinite-loop guard (called at the top of every loop body) ----------
  // A tight loop calls the guard continuously; a gap of >50 ms means a new task started.
  // Once tripped it keeps throwing for the rest of the task, so an outer loop that
  // catches the error cannot keep the page frozen.
  var taskStart = 0;
  var lastCheck = 0;
  var tripped = false;
  window[LOOP_GUARD_FN] = function () {
    var now = Date.now();
    if (now - lastCheck > 50) {
      taskStart = now;
      tripped = false;
    }
    lastCheck = now;
    if (tripped || now - taskStart > LOOP_LIMIT_MS) {
      tripped = true;
      throw new RangeError('Potential infinite loop: a loop ran for more than ' + LOOP_LIMIT_MS / 1000 + ' s and was stopped by WebForge.');
    }
  };

  // ---------- execution trace hooks (JS Playground; see traceInstrument.js) ----------
  if (TRACE_OBJECT) {
    var traceCount = 0;
    var traceStart = performance.now();
    var emit = function (event) {
      traceCount++;
      if (traceCount > MAX_TRACE_EVENTS) {
        if (traceCount === MAX_TRACE_EVENTS + 1) post('trace-truncated', { limit: MAX_TRACE_EVENTS });
        return;
      }
      event.seq = traceCount;
      event.t = Math.round((performance.now() - traceStart) * 1000) / 1000;
      post('trace', event);
    };
    window[TRACE_OBJECT] = {
      v: function (line, names, values) {
        var vars = [];
        for (var i = 0; i < names.length; i++) vars.push([names[i], serialize(values[i], 0, [])]);
        emit({ kind: 'var', line: line, vars: vars });
      },
      c: function (line, source, value) {
        emit({ kind: 'cond', line: line, source: source, result: Boolean(value), value: serialize(value, 0, []) });
        return value;
      },
      f: function (line, name, params, values) {
        var args = [];
        for (var i = 0; i < params.length; i++) args.push([params[i], serialize(values[i], 0, [])]);
        emit({ kind: 'call', line: line, name: name, args: args });
      },
      r: function (line, name, value) {
        emit({ kind: 'return', line: line, name: name, value: serialize(value, 0, []) });
        return value;
      },
    };
    var tracedConsoleLog = console.log;
    console.log = function () {
      emit({ kind: 'log', args: serializeArgs(arguments) });
      tracedConsoleLog.apply(console, arguments);
    };
  }

  // ---------- sandbox notices ----------
  document.addEventListener('securitypolicyviolation', function (event) {
    var what = {
      'connect-src': 'Network request (fetch/XHR/WebSocket) blocked: the preview sandbox has no network access. Use the AJAX Monitor to experiment with real requests.',
      'script-src': 'Script blocked: only project files and inline scripts may run in the preview (no external scripts, no eval).',
      'script-src-elem': 'External script blocked: only project files may run in the preview.',
      'form-action': 'Form submission blocked by the sandbox. Handle the "submit" event with JavaScript instead.',
    }[event.effectiveDirective];
    post('notice', { message: what || ('Blocked by the sandbox security policy (' + event.effectiveDirective + ').'), detail: event.blockedURI || null });
  });

  window.addEventListener('submit', function (event) {
    setTimeout(function () {
      if (!event.defaultPrevented) {
        post('notice', { message: 'Form submission was blocked by the sandbox. Handle the "submit" event and call event.preventDefault() to process it with JavaScript.' });
      }
    }, 0);
  });

  document.addEventListener('DOMContentLoaded', function () {
    post('ready', { ms: Math.round(performance.now()) });
  });
}

export const BRIDGE_SOURCE = webforgeBridge.toString();
