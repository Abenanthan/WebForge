import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

export const InspectorStoreContext = createContext(null);
const NodeContext = createContext(null);

let instanceSeq = 0;
let orderSeq = 0;
/** The instance whose render function is running right now (used by useInspectableState). */
let renderingNode = null;

/**
 * Wrap a function component so the Component Studio can inspect it.
 *
 * The wrapper CALLS the component function itself, so the component's hooks belong to
 * this same fiber: a state change inside the component re-renders the wrapper too, and
 * the layout effect below reports every commit (props, state, timing, reason).
 * Output is placed in a <div data-node-id> used for highlighting; nothing else changes.
 * Pass memo: true when the result is wrapped in React.memo (shown in the inspector).
 */
export function inspectable(Component, { name = Component.name, description = '', memo = false } = {}) {
  function Inspectable(props) {
    const store = useContext(InspectorStoreContext);
    const parent = useContext(NodeContext);
    const elementRef = useRef(null);
    const ctx = useRef(null);
    if (!ctx.current) {
      instanceSeq += 1;
      orderSeq += 1;
      ctx.current = { id: `${name}-${instanceSeq}`, order: orderSeq, state: {} };
    }
    const node = ctx.current;
    node.state = {};
    const renderStart = performance.now();

    const previous = renderingNode;
    renderingNode = node;
    let output;
    try {
      output = Component(props);
    } finally {
      renderingNode = previous;
    }

    useLayoutEffect(() => {
      store?.commit(node.id, {
        name,
        description,
        parentId: parent?.id ?? null,
        order: node.order,
        props,
        state: { ...node.state },
        renderMs: performance.now() - renderStart,
        memo,
        element: elementRef.current,
      });
      if (store?.flashRenders && elementRef.current) {
        const el = elementRef.current;
        el.classList.remove('wf-flash');
        void el.offsetWidth; // restart the CSS animation
        el.classList.add('wf-flash');
      }
    });

    useLayoutEffect(() => () => store?.remove(node.id), []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <NodeContext.Provider value={node}>
        <div ref={elementRef} className="wf-node" data-node-id={node.id} data-node-name={name}>
          {output}
        </div>
      </NodeContext.Provider>
    );
  }
  Inspectable.displayName = name;
  return Inspectable;
}

/** useState that also reports its value (under `label`) to the Component Studio inspector. */
export function useInspectableState(label, initial) {
  const node = renderingNode;
  const [value, setValue] = useState(initial);
  if (node) node.state[label] = value;
  return [value, setValue];
}
