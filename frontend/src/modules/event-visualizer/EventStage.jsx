import { memo, useEffect, useRef } from 'react';
import styles from './EventVisualizer.module.css';

function label(node) {
  if (!node) return 'null';
  if (node === window) return 'window';
  if (node === document) return 'document';
  if (node.nodeType !== 1) return node.nodeName;
  let s = node.tagName.toLowerCase();
  // CSS-module class names (_name_hash_n) are build artefacts, not meaningful selectors.
  const classes = [...node.classList].filter((c) => !/^_/.test(c));
  if (node.id) s += `#${node.id}`;
  else if (classes.length) s += `.${classes.slice(0, 2).join('.')}`;
  return s;
}

/** Target → stage, then the app's own layout collapsed into one step, then body → window. */
function propagationPath(event, stageRoot) {
  const nodes = event.composedPath().filter((n) => n === window || n === document || n.nodeType === 1);
  const stageIndex = nodes.indexOf(stageRoot);
  const bodyIndex = nodes.indexOf(document.body);
  if (stageIndex === -1 || bodyIndex <= stageIndex + 1) return nodes.map(label);
  const hidden = bodyIndex - stageIndex - 1;
  return [
    ...nodes.slice(0, stageIndex + 1).map(label),
    `… ${hidden} WebForge layout elements`,
    ...nodes.slice(bodyIndex).map(label),
  ];
}

const PHASES = { 1: 'capturing', 2: 'at target', 3: 'bubbling' };

function summarizeMutation(r) {
  if (r.type === 'attributes') {
    return { type: 'attributes', target: label(r.target), detail: `${r.attributeName}: "${r.oldValue ?? ''}" → "${r.target.getAttribute(r.attributeName) ?? ''}"` };
  }
  if (r.type === 'characterData') {
    return { type: 'characterData', target: `${label(r.target.parentElement)} › #text`, detail: `"${r.oldValue}" → "${r.target.textContent}"` };
  }
  const added = [...r.addedNodes].map((n) => (n.nodeType === 3 ? `"${n.textContent}"` : label(n)));
  const removed = [...r.removedNodes].map((n) => (n.nodeType === 3 ? `"${n.textContent}"` : label(n)));
  return { type: 'childList', target: label(r.target), detail: [added.length && `added ${added.join(', ')}`, removed.length && `removed ${removed.join(', ')}`].filter(Boolean).join('; ') };
}

function describeAction(event) {
  switch (event.type) {
    case 'click':
    case 'dblclick':
      return event.detail === 0
        ? `Activated with the keyboard (${event.type})`
        : `${event.type === 'dblclick' ? 'Double-clicked' : 'Clicked'} at (${Math.round(event.offsetX)}, ${Math.round(event.offsetY)}) inside ${label(event.target)}`;
    case 'mouseover': return `Pointer moved onto ${label(event.target)}`;
    case 'mouseout': return `Pointer left ${label(event.target)}`;
    case 'keydown': return `Pressed the "${event.key}" key`;
    case 'keyup': return `Released the "${event.key}" key`;
    case 'input': return `Edited the text (${event.inputType || 'input'})`;
    case 'change': return event.target.type === 'checkbox' ? `${event.target.checked ? 'Ticked' : 'Unticked'} the checkbox` : `Chose "${event.target.value}"`;
    case 'submit': return event.submitter ? `Submitted the form with ${label(event.submitter)}` : 'Submitted the form (Enter key)';
    default: return event.type;
  }
}

function eventProperties(event) {
  const props = {
    type: event.type,
    constructor: event.constructor.name,
    isTrusted: event.isTrusted,
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    timeStamp: `${event.timeStamp.toFixed(1)} ms`,
  };
  if ('key' in event) Object.assign(props, { key: event.key, code: event.code, repeat: event.repeat });
  if ('clientX' in event) Object.assign(props, { clientX: event.clientX, clientY: event.clientY, button: event.button, detail: event.detail });
  if ('inputType' in event) Object.assign(props, { inputType: event.inputType, data: event.data });
  return props;
}

/**
 * The interactive elements. Rendered once (memo, no changing props) and then
 * updated ONLY by the native event handlers below, the way plain DOM code works,
 * so React never overwrites what the handlers change.
 */
export const EventStage = memo(function EventStage({ onRecord }) {
  const rootRef = useRef(null);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  useEffect(() => {
    const root = rootRef.current;
    const $ = (sel) => root.querySelector(sel);
    const observer = new MutationObserver(() => {});
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
    const registered = [];

    /** Wrap a handler so every real step of its execution is measured and recorded. */
    function listen(selector, type, demo, handlerName, body) {
      const element = $(selector);
      const listener = function (event) {
        const listenerAt = performance.now();
        const path = propagationPath(event, root);
        const phase = PHASES[event.eventPhase];
        const target = label(event.target);
        const currentTarget = label(event.currentTarget);
        observer.takeRecords(); // discard anything that happened before this event

        const calls = [];
        const call = (name, args, impl) => {
          const start = performance.now();
          const result = impl(...args);
          calls.push({ name, args, result, ms: performance.now() - start });
          return result;
        };

        const handlerStart = performance.now();
        let error = null;
        try {
          body(event, call);
        } catch (err) {
          error = err.message;
        }
        const handlerMs = performance.now() - handlerStart;
        const mutations = observer.takeRecords().map(summarizeMutation);

        const record = {
          demo,
          type: event.type,
          target,
          action: describeAction(event),
          properties: eventProperties(event),
          created: event.timeStamp,
          listenerAt,
          listener: { selector, handlerName, currentTarget, phase, path },
          handler: { name: handlerName, startedAt: handlerStart, ms: handlerMs, defaultPrevented: event.defaultPrevented, error },
          calls,
          mutations,
        };
        // The browser paints after the handler returns; the next animation frame marks that moment.
        requestAnimationFrame(() => onRecordRef.current({ ...record, paintedAt: performance.now() }));
      };
      element.addEventListener(type, listener);
      registered.push([element, type, listener]);
    }

    // ---- Button
    const count = $('#ev-count');
    let clicks = 0;
    listen('#ev-button', 'click', 'button', 'handleClick', (e, call) => {
      clicks += 1;
      call('updateCounter', [clicks], (value) => {
        count.textContent = `Clicked ${value} time${value === 1 ? '' : 's'}`;
        return count.textContent;
      });
    });
    listen('#ev-button', 'dblclick', 'button', 'handleDoubleClick', (e, call) => {
      call('celebrate', [label(e.currentTarget)], () => e.currentTarget.classList.toggle('party'));
    });

    // ---- Hover card
    const card = $('#ev-card');
    const cardStatus = $('#ev-card-status');
    const setHighlight = (on) => {
      card.classList.toggle('hovered', on);
      cardStatus.textContent = on ? 'Pointer is over the card' : 'Hover over me';
      return on;
    };
    listen('#ev-card', 'mouseover', 'hover', 'handleOver', (e, call) => call('setHighlight', [true], setHighlight));
    listen('#ev-card', 'mouseout', 'hover', 'handleOut', (e, call) => call('setHighlight', [false], setHighlight));

    // ---- Text input
    const keyView = $('#ev-key');
    const mirror = $('#ev-mirror');
    const showKey = (key, state) => {
      keyView.textContent = `${key} (${state})`;
      return keyView.textContent;
    };
    listen('#ev-input', 'keydown', 'input', 'handleKeyDown', (e, call) => call('showKey', [e.key, 'down'], showKey));
    listen('#ev-input', 'keyup', 'input', 'handleKeyUp', (e, call) => call('showKey', [e.key, 'up'], showKey));
    listen('#ev-input', 'input', 'input', 'handleInput', (e, call) => call('mirrorText', [e.target.value], (value) => {
      mirror.textContent = value || '…';
      return value.length;
    }));

    // ---- Select
    const swatch = $('#ev-swatch');
    listen('#ev-select', 'change', 'select', 'handleChange', (e, call) => call('applyColour', [e.target.value], (colour) => {
      swatch.setAttribute('data-colour', colour);
      swatch.textContent = colour;
      return colour;
    }));

    // ---- Checkbox
    const note = $('#ev-terms-note');
    listen('#ev-terms', 'change', 'checkbox', 'handleToggle', (e, call) => call('toggleTerms', [e.target.checked], (accepted) => {
      note.textContent = accepted ? 'Terms accepted ✓' : 'Terms not accepted';
      note.classList.toggle('ok', accepted);
      return accepted;
    }));

    // ---- Form
    const result = $('#ev-form-result');
    listen('#ev-form', 'submit', 'form', 'handleSubmit', (e, call) => {
      e.preventDefault();
      call('validateName', [e.currentTarget.elements.name.value], (name) => {
        const ok = name.trim().length >= 2;
        result.textContent = ok ? `Hello, ${name.trim()}!` : 'Name needs at least 2 characters';
        result.classList.toggle('ok', ok);
        result.classList.toggle('bad', !ok);
        return ok;
      });
    });

    return () => {
      registered.forEach(([el, type, fn]) => el.removeEventListener(type, fn));
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.stage} id="ev-stage">
      <div className={styles.demo}>
        <p className={styles.demoTitle}>click · dblclick</p>
        <button id="ev-button" type="button" className={styles.demoButton}>Click me</button>
        <p id="ev-count" className={styles.demoOutput}>Clicked 0 times</p>
      </div>

      <div className={styles.demo}>
        <p className={styles.demoTitle}>mouseover · mouseout</p>
        <div id="ev-card" className={styles.hoverCard}>
          <span id="ev-card-status">Hover over me</span>
        </div>
      </div>

      <div className={styles.demo}>
        <p className={styles.demoTitle}>keydown · keyup · input</p>
        <label className="sr-only" htmlFor="ev-input">Type here</label>
        <input id="ev-input" className={styles.demoInput} placeholder="Type here…" autoComplete="off" />
        <p className={styles.demoOutput}>Key: <kbd id="ev-key">–</kbd> · Text: <span id="ev-mirror">…</span></p>
      </div>

      <div className={styles.demo}>
        <p className={styles.demoTitle}>change (select)</p>
        <label className="sr-only" htmlFor="ev-select">Colour</label>
        <select id="ev-select" className={styles.demoInput} defaultValue="indigo">
          <option value="indigo">indigo</option>
          <option value="teal">teal</option>
          <option value="amber">amber</option>
          <option value="rose">rose</option>
        </select>
        <p id="ev-swatch" className={styles.swatch} data-colour="indigo">indigo</p>
      </div>

      <div className={styles.demo}>
        <p className={styles.demoTitle}>change (checkbox)</p>
        <label className={styles.checkLabel}>
          <input id="ev-terms" type="checkbox" /> I accept the terms
        </label>
        <p id="ev-terms-note" className={styles.demoOutput}>Terms not accepted</p>
      </div>

      <div className={styles.demo}>
        <p className={styles.demoTitle}>submit</p>
        <form id="ev-form" className={styles.demoForm} noValidate>
          <label className="sr-only" htmlFor="ev-name">Name</label>
          <input id="ev-name" name="name" className={styles.demoInput} placeholder="Your name" autoComplete="off" />
          <button type="submit" className={styles.demoButton}>Send</button>
        </form>
        <p id="ev-form-result" className={styles.demoOutput}>Waiting for submit</p>
      </div>
    </div>
  );
});
