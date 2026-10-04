/**
 * DOM inspector injected into sandboxed documents for the DOM Explorer.
 * Runs INSIDE the iframe. Talks to the app with postMessage:
 *
 *   ← commands  { __webforge: 'command', runId, cmd, id?, args? }
 *   → dom-snapshot   { tree }                 element/text tree with stable ids
 *   → dom-details    { ... }                  selected element: attributes, styles, box, relatives
 *   → dom-result     { cmd, ok, code, mutations, error }  an action, its JavaScript and the mutations it caused
 *   → dom-mutations  { records }              mutations made by the page's own scripts
 *   → dom-picked     { id }                   element clicked in pick mode
 *
 * Plain ES5 function: it is stringified into the preview document.
 */
// eslint-disable-next-line no-unused-vars
function webforgeInspector(RUN_ID, PARENT_ORIGIN) {
  var ALLOWED_NEW_TAGS = ['div', 'p', 'span', 'h1', 'h2', 'h3', 'button', 'ul', 'ol', 'li', 'section', 'article', 'strong', 'em', 'a', 'small', 'label', 'input'];
  var STYLE_PROPS = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'border', 'border-radius', 'opacity', 'z-index', 'flex-direction', 'justify-content', 'align-items', 'gap', 'visibility', 'cursor'];
  var MAX_NODES = 2500;

  var ids = new WeakMap();
  var nodes = new Map();
  var nextId = 1;
  var overlay = null;
  var picking = false;
  var selectedId = null;

  function post(type, payload) {
    try {
      window.parent.postMessage({ __webforge: 'sandbox', runId: RUN_ID, type: type, payload: payload, at: Date.now() }, PARENT_ORIGIN);
    } catch (e) { /* ignore */ }
  }

  function idOf(node) {
    var id = ids.get(node);
    if (!id) {
      id = nextId++;
      ids.set(node, id);
      nodes.set(id, node);
    }
    return id;
  }

  function isInternal(node) {
    return node && node.nodeType === 1 && (node.hasAttribute('data-webforge-internal') || node === overlay);
  }

  function label(el) {
    if (!el || el.nodeType !== 1) return el && el.nodeType === 3 ? '#text' : String(el);
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + Array.prototype.join.call(el.classList, '.');
    return s;
  }

  function cssPath(el) {
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
        parts.unshift('#' + CSS.escape(el.id));
        return parts.join(' > ');
      }
      var tag = el.tagName.toLowerCase();
      var sameTag = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.tagName === el.tagName; });
      parts.unshift(sameTag.length > 1 ? tag + ':nth-of-type(' + (sameTag.indexOf(el) + 1) + ')' : tag);
      el = el.parentElement;
    }
    parts.unshift(el === document.documentElement ? 'html' : 'body');
    return parts.join(' > ');
  }

  // ---------- snapshot ----------
  function snapshot() {
    var count = 0;
    function walk(node) {
      if (count++ > MAX_NODES) return null;
      if (node.nodeType === 3) {
        var text = node.textContent.replace(/\s+/g, ' ').trim();
        return text ? { id: idOf(node), type: 'text', text: text.length > 60 ? text.slice(0, 60) + '…' : text } : null;
      }
      if (node.nodeType !== 1 || isInternal(node)) return null;
      var tag = node.tagName.toLowerCase();
      var item = {
        id: idOf(node),
        type: 'element',
        tag: tag,
        elId: node.id || null,
        classes: Array.prototype.slice.call(node.classList),
        file: node.getAttribute('data-webforge-file'),
        hidden: node.style.display === 'none',
        children: [],
      };
      if (tag !== 'script' && tag !== 'style') {
        for (var i = 0; i < node.childNodes.length; i++) {
          var child = walk(node.childNodes[i]);
          if (child) item.children.push(child);
        }
      }
      return item;
    }
    post('dom-snapshot', { tree: walk(document.documentElement), truncated: count > MAX_NODES });
  }

  // ---------- details ----------
  function details(id) {
    var el = nodes.get(id);
    if (!el || !el.isConnected) {
      post('dom-details', { id: id, missing: true });
      return;
    }
    if (el.nodeType === 3) {
      post('dom-details', { id: id, kind: 'text', text: el.textContent, parent: el.parentElement ? { id: idOf(el.parentElement), label: label(el.parentElement) } : null });
      return;
    }
    var computed = getComputedStyle(el);
    var styles = {};
    STYLE_PROPS.forEach(function (p) { styles[p] = computed.getPropertyValue(p); });
    var attrs = [];
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf('data-webforge') !== 0) attrs.push([a.name, a.value]);
    }
    var rect = el.getBoundingClientRect();
    var children = Array.prototype.slice.call(el.children).filter(function (c) { return !isInternal(c); });
    post('dom-details', {
      id: id,
      kind: 'element',
      tag: el.tagName.toLowerCase(),
      label: label(el),
      selector: cssPath(el),
      elId: el.id || null,
      classes: Array.prototype.slice.call(el.classList),
      attributes: attrs,
      text: el.textContent.length > 600 ? el.textContent.slice(0, 600) + '…' : el.textContent,
      html: el.innerHTML.length > 4000 ? el.innerHTML.slice(0, 4000) : el.innerHTML,
      inlineStyle: el.getAttribute('style') || '',
      styles: styles,
      box: {
        width: Math.round(rect.width), height: Math.round(rect.height),
        margin: [computed.marginTop, computed.marginRight, computed.marginBottom, computed.marginLeft],
        padding: [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft],
        border: [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth],
      },
      hidden: el.style.display === 'none',
      file: el.getAttribute('data-webforge-file'),
      parent: el.parentElement ? { id: idOf(el.parentElement), label: label(el.parentElement) } : null,
      children: children.map(function (c) { return { id: idOf(c), label: label(c) }; }),
    });
  }

  // ---------- highlight overlay ----------
  function highlight(el) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-webforge-internal', '');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7c8cff;background:rgba(124,140,255,.15);border-radius:2px;transition:all .08s;font:11px/1.4 ui-monospace,monospace;';
      var tagLabel = document.createElement('span');
      tagLabel.style.cssText = 'position:absolute;left:-2px;top:-20px;padding:1px 6px;background:#7c8cff;color:#0a0e16;border-radius:3px;white-space:nowrap;';
      overlay.appendChild(tagLabel);
      document.documentElement.appendChild(overlay);
    }
    if (!el || el.nodeType !== 1 || !el.isConnected) {
      overlay.style.display = 'none';
      return;
    }
    var r = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.firstChild.textContent = label(el) + '  ' + Math.round(r.width) + '×' + Math.round(r.height);
    overlay.firstChild.style.top = r.top < 22 ? (r.height + 2) + 'px' : '-20px';
  }

  // ---------- commands ----------
  var actions = {
    snapshot: function () { snapshot(); },
    select: function (id) {
      selectedId = id;
      var el = nodes.get(id);
      highlight(el && el.nodeType === 1 ? el : el && el.parentElement);
      if (el && el.nodeType === 1) el.scrollIntoView({ block: 'nearest' });
      details(id);
    },
    hover: function (id) { highlight(id ? nodes.get(id) : nodes.get(selectedId)); },
    pick: function (_id, args) { picking = Boolean(args && args.on); },
    setText: function (id, args, el) {
      el.textContent = String(args.text);
      return 'element.textContent = ' + JSON.stringify(String(args.text)) + ';';
    },
    setHtml: function (id, args, el) {
      el.innerHTML = String(args.html);
      return 'element.innerHTML = ' + JSON.stringify(String(args.html)) + ';';
    },
    addChild: function (id, args, el) {
      var tag = String(args.tag).toLowerCase();
      if (ALLOWED_NEW_TAGS.indexOf(tag) === -1) throw new Error('<' + tag + '> cannot be added in the explorer.');
      var child = document.createElement(tag);
      if (args.text) child.textContent = String(args.text);
      el.appendChild(child);
      return 'const child = document.createElement(' + JSON.stringify(tag) + ');\n' +
        (args.text ? 'child.textContent = ' + JSON.stringify(String(args.text)) + ';\n' : '') +
        'element.appendChild(child);';
    },
    remove: function (id, args, el) {
      if (el === document.documentElement || el === document.body || el === document.head) throw new Error('The <' + el.tagName.toLowerCase() + '> element cannot be removed.');
      el.remove();
      highlight(null);
      return 'element.remove();';
    },
    setStyle: function (id, args, el) {
      var prop = String(args.prop).trim().toLowerCase();
      if (!/^-?[a-z][a-z-]*$/.test(prop)) throw new Error('"' + prop + '" is not a CSS property name.');
      el.style.setProperty(prop, String(args.value).trim());
      var camel = prop.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
      return 'element.style.' + camel + ' = ' + JSON.stringify(String(args.value).trim()) + ';';
    },
    addClass: function (id, args, el) {
      var cls = String(args.className).trim();
      if (!/^-?[_a-zA-Z][_a-zA-Z0-9-]*$/.test(cls)) throw new Error('"' + cls + '" is not a valid class name.');
      el.classList.add(cls);
      return 'element.classList.add(' + JSON.stringify(cls) + ');';
    },
    removeClass: function (id, args, el) {
      el.classList.remove(String(args.className));
      return 'element.classList.remove(' + JSON.stringify(String(args.className)) + ');';
    },
    toggleVisibility: function (id, args, el) {
      if (el.style.display === 'none') {
        el.style.removeProperty('display');
        return "element.style.display = '';  // show";
      }
      el.style.display = 'none';
      return "element.style.display = 'none';  // hide";
    },
  };

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.__webforge !== 'command' || data.runId !== RUN_ID || !actions[data.cmd]) return;
    var el = data.id != null ? nodes.get(data.id) : null;
    var mutating = ['setText', 'setHtml', 'addChild', 'remove', 'setStyle', 'addClass', 'removeClass', 'toggleVisibility'].indexOf(data.cmd) !== -1;
    if (mutating && (!el || el.nodeType !== 1 || !el.isConnected)) {
      post('dom-result', { cmd: data.cmd, ok: false, error: 'That element is no longer in the document.' });
      return;
    }
    try {
      // Separate mutations precisely: anything already queued came from page scripts;
      // whatever is queued right after the (synchronous) action was caused by it.
      if (mutating) reportMutations(observer.takeRecords());
      var selector = el && el.nodeType === 1 ? cssPath(el) : null;
      var code = actions[data.cmd](data.id, data.args || {}, el);
      if (mutating) {
        var caused = summarize(observer.takeRecords());
        post('dom-result', { cmd: data.cmd, ok: true, selector: selector, code: code, mutations: caused.slice(0, 50), totalMutations: caused.length });
        if (caused.length) scheduleSnapshot();
        if (el.isConnected) {
          details(data.id);
          highlight(el);
        }
      }
    } catch (err) {
      post('dom-result', { cmd: data.cmd, ok: false, error: err.message });
    }
  });

  // ---------- pick mode: hover + click in the preview selects an element ----------
  document.addEventListener('mouseover', function (e) {
    if (picking && !isInternal(e.target)) highlight(e.target);
  }, true);
  document.addEventListener('click', function (e) {
    if (!picking || isInternal(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    picking = false;
    post('dom-picked', { id: idOf(e.target) });
  }, true);

  // ---------- live mutations ----------
  var snapshotTimer = null;
  function scheduleSnapshot() {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(snapshot, 30);
  }

  function summarize(records) {
    var summary = [];
    records.forEach(function (r) {
      if (isInternal(r.target) || (r.target.parentNode && isInternal(r.target.parentNode))) return;
      var item = { type: r.type, target: r.target.nodeType === 1 ? label(r.target) : label(r.target.parentElement) + ' › #text' };
      if (r.type === 'attributes') {
        item.attribute = r.attributeName;
        item.oldValue = r.oldValue;
        item.newValue = r.target.getAttribute(r.attributeName);
      } else if (r.type === 'characterData') {
        item.oldValue = r.oldValue;
        item.newValue = r.target.textContent;
      } else {
        item.added = Array.prototype.filter.call(r.addedNodes, function (n) { return !isInternal(n) && (n.nodeType === 1 || n.textContent.trim()); }).map(label);
        item.removed = Array.prototype.filter.call(r.removedNodes, function (n) { return n.nodeType === 1 || n.textContent.trim(); }).map(label);
        if (!item.added.length && !item.removed.length) return;
      }
      summary.push(item);
    });
    return summary;
  }

  /** Mutations delivered by the observer itself were made by page scripts. */
  function reportMutations(records) {
    var summary = summarize(records);
    if (!summary.length) return;
    post('dom-mutations', { records: summary.slice(0, 50), total: summary.length });
    scheduleSnapshot();
  }

  var observer = new MutationObserver(reportMutations);

  document.addEventListener('DOMContentLoaded', function () {
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
    snapshot();
  });
  window.addEventListener('scroll', function () { if (selectedId) highlight(nodes.get(selectedId)); }, true);
}

export const INSPECTOR_SOURCE = webforgeInspector.toString();
