import { memo, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, Component, Eye, History, RotateCcw, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { TreeView } from '../../visualizers/TreeView.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import { formatMs, relativeTime } from '../../utils/format.js';
import { createInspectorStore } from './inspector/inspectorStore.js';
import { InspectorStoreContext } from './inspector/inspectable.jsx';
import { DemoApp } from './DemoApp.jsx';
import styles from './ComponentStudio.module.css';

function Value({ value }) {
  if (value && typeof value === 'object' && 'fn' in value) return <span className={styles.fn}>ƒ {value.fn}()</span>;
  if (value && typeof value === 'object' && 'element' in value) return <span className={styles.fn}>&lt;{value.element} /&gt;</span>;
  return <code className={styles.json}>{JSON.stringify(value)}</code>;
}

/**
 * The demo app sits behind a memo boundary: the inspector re-renders on every report,
 * but that must never re-render the app it is observing (that would report again → loop).
 */
const Stage = memo(function Stage({ store, memoFooter }) {
  return (
    <InspectorStoreContext.Provider value={store}>
      <DemoApp memoFooter={memoFooter} />
    </InspectorStoreContext.Provider>
  );
});

function KeyValues({ data, empty }) {
  const entries = Object.entries(data ?? {});
  if (!entries.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <table className={styles.kv}>
      <tbody>
        {entries.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td><Value value={v} /></td></tr>)}
      </tbody>
    </table>
  );
}

export default function TreeTab() {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = createInspectorStore();
    storeRef.current.flashRenders = true;
  }
  const store = storeRef.current;
  useSyncExternalStore(store.subscribe, store.getVersion);

  const [selectedId, setSelectedId] = useState(null);
  const [flash, setFlash] = useState(true);
  const [memoFooter, setMemoFooter] = useState(false);
  const [appKey, setAppKey] = useState(0);
  const logged = useRef(false);

  const tree = store.tree();
  const selected = selectedId ? store.get(selectedId) : null;
  const byId = useMemo(() => new Map(store.all().map((n) => [n.id, n])), [store.getVersion()]); // eslint-disable-line react-hooks/exhaustive-deps
  const children = selected ? store.all().filter((n) => n.parentId === selected.id) : [];

  function select(id) {
    setSelectedId(id);
    if (!logged.current) {
      logged.current = true;
      recordExperimentRun('component-tree', 'success', { selected: store.get(id)?.name });
    }
  }

  return (
    <div className={styles.treeGrid}>
      <Card title="Component tree" icon={Component} className={styles.treeCard} bodyClassName={styles.scrollBody}>
        {tree.length === 0 ? <EmptyState title="Mounting…" /> : (
          <TreeView
            key={appKey}
            nodes={tree}
            selectedId={selectedId}
            onSelect={select}
            label="React component tree"
            defaultExpandedDepth={6}
            renderLabel={(node) => (
              <span className={styles.treeLabel}>
                <span className={styles.componentName}>&lt;{node.name}&gt;</span>
                {node.memo && <span className={styles.memoTag}>memo</span>}
                <span key={node.renderCount} className={styles.renderCount} title={`${node.renderCount} render(s): ${node.lastReason}`}>
                  ×{node.renderCount}
                </span>
              </span>
            )}
          />
        )}
      </Card>

      <section className={styles.previewColumn} aria-label="Running app">
        <div className={styles.toolbar}>
          <label className={styles.check}>
            <input type="checkbox" checked={flash} onChange={(e) => { setFlash(e.target.checked); store.flashRenders = e.target.checked; }} />
            Highlight re-renders
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={memoFooter} onChange={(e) => setMemoFooter(e.target.checked)} />
            Wrap Footer in <code>React.memo</code>
          </label>
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => { setAppKey((k) => k + 1); setSelectedId(null); store.clearLog(); }}>Remount app</Button>
        </div>
        <div className={styles.appFrame}>
          {selectedId && <style>{`[data-node-id="${selectedId}"]{outline:2px solid var(--layer-render);outline-offset:2px;border-radius:6px}`}</style>}
          <Stage key={appKey} store={store} memoFooter={memoFooter} />
        </div>
        <p className={styles.muted}>This is a real React app. Click around: every component reports its props, state and renders to the panels.</p>
      </section>

      <Card title="Inspector" icon={Eye} className={styles.inspectorCard} bodyClassName={styles.scrollBody}>
        {!selected ? (
          <EmptyState icon={Eye} title="Select a component">Choose a node in the tree to see its props, state and render status.</EmptyState>
        ) : (
          <div className={styles.inspector}>
            <div>
              <p className={styles.inspectTitle}>&lt;{selected.name} /&gt;</p>
              <p className={styles.muted}>{selected.description}</p>
              <p className={styles.badges}>
                <Badge tone="accent">Function component</Badge>
                {selected.memo && <Badge tone="warning">React.memo</Badge>}
              </p>
            </div>
            <section>
              <h3 className={styles.sectionTitle}>Props <span className={styles.muted}>(read-only, from the parent)</span></h3>
              <KeyValues data={selected.props} empty="No props." />
            </section>
            <section>
              <h3 className={styles.sectionTitle}>State <span className={styles.muted}>(owned by this component)</span></h3>
              <KeyValues data={selected.state} empty="No state: this component only renders its props." />
            </section>
            <section>
              <h3 className={styles.sectionTitle}>Render status</h3>
              <table className={styles.kv}>
                <tbody>
                  <tr><th scope="row">Renders</th><td>{selected.renderCount}</td></tr>
                  <tr><th scope="row">Last render</th><td>{relativeTime(selected.lastRenderAt)} · {formatMs(selected.renderMs)}</td></tr>
                  <tr><th scope="row">Why</th><td>{selected.lastReason}</td></tr>
                </tbody>
              </table>
            </section>
            <section>
              <h3 className={styles.sectionTitle}>Family</h3>
              <p className={styles.family}>
                Parent:{' '}
                {selected.parentId && byId.get(selected.parentId)
                  ? <button type="button" className={styles.link} onClick={() => select(selected.parentId)}>&lt;{byId.get(selected.parentId).name}&gt;</button>
                  : <span className={styles.muted}>none (root)</span>}
              </p>
              <p className={styles.family}>
                Children:{' '}
                {children.length === 0 ? <span className={styles.muted}>none</span> : children.map((c) => (
                  <button key={c.id} type="button" className={styles.link} onClick={() => select(c.id)}>&lt;{c.name}&gt;</button>
                ))}
              </p>
            </section>
          </div>
        )}
      </Card>

      <Card
        title="Render log"
        icon={History}
        className={styles.logCard}
        actions={<Button size="sm" variant="ghost" icon={Trash2} onClick={() => store.clearLog()}>Clear</Button>}
      >
        {store.log().length === 0 ? <EmptyState icon={Activity} title="No renders logged">Interact with the app to see which components re-render, and why.</EmptyState> : (
          <ol className={styles.renderLog} aria-label="Render log">
            {store.log().map((entry) => (
              <li key={entry.id}>
                <button type="button" className={styles.link} onClick={() => select(entry.nodeId)}>&lt;{entry.name}&gt;</button>
                <span className={styles.reason}>{entry.reason}</span>
                <span className={styles.muted}>render #{entry.count} · {formatMs(entry.renderMs)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
