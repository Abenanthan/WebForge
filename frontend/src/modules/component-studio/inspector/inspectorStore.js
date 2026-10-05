/**
 * Registry of live component instances in the Component Studio demo app.
 * Components report after every commit (see inspectable.jsx); the inspector UI
 * subscribes with useSyncExternalStore. Notifications are batched per microtask.
 */

const MAX_LOG = 40;

function serialize(value, depth = 0) {
  if (typeof value === 'function') return { fn: value.displayName || value.name || 'anonymous' };
  if (value === null || typeof value !== 'object') return value;
  if (value.$$typeof) return { element: typeof value.type === 'string' ? value.type : value.type?.displayName || value.type?.name || 'Component' };
  if (depth >= 2) return Array.isArray(value) ? `Array(${value.length})` : '{…}';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => serialize(v, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([k, v]) => [k, serialize(v, depth + 1)]));
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changedKeys = (prev = {}, next = {}) => [...new Set([...Object.keys(prev), ...Object.keys(next)])].filter((k) => !same(prev[k], next[k]));

export function createInspectorStore() {
  const nodes = new Map();
  let log = [];
  let version = 0;
  let scheduled = false;
  const listeners = new Set();

  function notify() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      version += 1;
      listeners.forEach((l) => l());
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
    get: (id) => nodes.get(id),
    all: () => [...nodes.values()],
    log: () => log,

    /** Called from a layout effect after each commit of a component instance. */
    commit(id, { name, description, parentId, order, props, state, renderMs, memo, element }) {
      const prev = nodes.get(id);
      const nextProps = serialize(props);
      const nextState = serialize(state);
      let reason = 'mounted';
      if (prev) {
        const stateChanged = changedKeys(prev.state, nextState);
        const propsChanged = changedKeys(prev.props, nextProps);
        reason = stateChanged.length ? `state changed: ${stateChanged.join(', ')}`
          : propsChanged.length ? `props changed: ${propsChanged.join(', ')}`
            : 'parent re-rendered (same props)';
      }
      const node = {
        id, name, description, parentId, order, memo, element,
        props: nextProps,
        state: nextState,
        renderCount: (prev?.renderCount ?? 0) + 1,
        renderMs,
        lastReason: reason,
        lastRenderAt: Date.now(),
      };
      nodes.set(id, node);
      log = [{ id: `${id}:${node.renderCount}`, nodeId: id, name, reason, renderMs, at: node.lastRenderAt, count: node.renderCount }, ...log].slice(0, MAX_LOG);
      notify();
    },

    remove(id) {
      if (nodes.delete(id)) notify();
    },

    clearLog() {
      log = [];
      notify();
    },

    /** Nodes as a nested tree; siblings in the order they appear on screen. */
    tree() {
      const list = [...nodes.values()].sort((a, b) => {
        if (a.element?.isConnected && b.element?.isConnected) {
          return a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        }
        return a.order - b.order;
      });
      const byParent = new Map();
      list.forEach((n) => {
        const key = n.parentId ?? 'root';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(n);
      });
      const build = (n) => ({ ...n, children: (byParent.get(n.id) ?? []).map(build) });
      return (byParent.get('root') ?? []).map(build);
    },
  };
}
