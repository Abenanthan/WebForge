import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './TreeView.module.css';

/**
 * Accessible tree (WAI-ARIA tree pattern).
 * nodes: [{ id, children?: [...] }]; renderLabel(node) draws each row.
 * Keyboard: ↑/↓ move, → expand / go to first child, ← collapse / go to parent,
 * Home/End, Enter/Space select. One roving tabindex keeps Tab order clean.
 */
export function TreeView({ nodes, selectedId, onSelect, renderLabel, label, defaultExpandedDepth = 3, expandToSelected = true }) {
  const [expanded, setExpanded] = useState(() => {
    const ids = new Set();
    const walk = (list, depth) => list.forEach((n) => {
      if (depth < defaultExpandedDepth && n.children?.length) ids.add(n.id);
      if (n.children) walk(n.children, depth + 1);
    });
    walk(nodes, 0);
    return ids;
  });
  const [focusId, setFocusId] = useState(selectedId ?? nodes[0]?.id);
  const itemRefs = useRef(new Map());

  // Parent lookup for keyboard navigation and auto-expansion.
  const parents = useMemo(() => {
    const map = new Map();
    const walk = (list, parent) => list.forEach((n) => {
      map.set(n.id, parent);
      if (n.children) walk(n.children, n.id);
    });
    walk(nodes, null);
    return map;
  }, [nodes]);

  // Reveal the selected node (e.g. picked in the preview).
  useEffect(() => {
    if (!expandToSelected || selectedId == null) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let p = parents.get(selectedId);
      while (p != null) {
        next.add(p);
        p = parents.get(p);
      }
      return next;
    });
    setFocusId(selectedId);
  }, [selectedId, parents, expandToSelected]);

  const visible = useMemo(() => {
    const list = [];
    const walk = (items, depth) => items.forEach((n) => {
      list.push({ node: n, depth });
      if (n.children?.length && expanded.has(n.id)) walk(n.children, depth + 1);
    });
    walk(nodes, 0);
    return list;
  }, [nodes, expanded]);

  useEffect(() => {
    itemRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, visible]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  function focusItem(id) {
    setFocusId(id);
    itemRefs.current.get(id)?.focus();
  }

  function onKeyDown(e) {
    const index = visible.findIndex((v) => v.node.id === focusId);
    if (index === -1) return;
    const { node } = visible[index];
    const hasChildren = Boolean(node.children?.length);
    const handlers = {
      ArrowDown: () => index < visible.length - 1 && focusItem(visible[index + 1].node.id),
      ArrowUp: () => index > 0 && focusItem(visible[index - 1].node.id),
      ArrowRight: () => {
        if (!hasChildren) return;
        if (!expanded.has(node.id)) toggle(node.id);
        else focusItem(node.children[0].id);
      },
      ArrowLeft: () => {
        if (hasChildren && expanded.has(node.id)) toggle(node.id);
        else if (parents.get(node.id) != null) focusItem(parents.get(node.id));
      },
      Home: () => focusItem(visible[0].node.id),
      End: () => focusItem(visible[visible.length - 1].node.id),
      Enter: () => onSelect(node.id),
      ' ': () => onSelect(node.id),
    };
    if (handlers[e.key]) {
      e.preventDefault();
      handlers[e.key]();
    }
  }

  return (
    <ul role="tree" aria-label={label} className={styles.tree} onKeyDown={onKeyDown}>
      {visible.map(({ node, depth }) => {
        const hasChildren = Boolean(node.children?.length);
        const isExpanded = expanded.has(node.id);
        return (
          <li
            key={node.id}
            ref={(el) => (el ? itemRefs.current.set(node.id, el) : itemRefs.current.delete(node.id))}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={selectedId === node.id}
            tabIndex={node.id === focusId ? 0 : -1}
            className={`${styles.item} ${selectedId === node.id ? styles.selected : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => {
              setFocusId(node.id);
              onSelect(node.id);
            }}
            onFocus={() => setFocusId(node.id)}
          >
            {hasChildren ? (
              <span
                className={`${styles.twisty} ${isExpanded ? styles.open : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(node.id);
                }}
                aria-hidden="true"
              >
                <ChevronRight size={13} />
              </span>
            ) : <span className={styles.twistySpacer} aria-hidden="true" />}
            {renderLabel(node)}
          </li>
        );
      })}
    </ul>
  );
}
