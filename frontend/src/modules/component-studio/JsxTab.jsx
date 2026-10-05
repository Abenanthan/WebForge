import React, { Component as ReactComponent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code, Eye, Lightbulb, Network, RotateCcw } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { CodeEditor } from '../../editor/CodeEditor.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { TreeView } from '../../visualizers/TreeView.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import { compileJsx, evaluate } from './jsx/jsxCompiler.js';
import { EXAMPLES, findExample } from './jsx/examples.jsx';
import styles from './ComponentStudio.module.css';

/** Catches errors thrown while React renders the learner's element. */
class RenderBoundary extends ReactComponent {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <p className={styles.errorText} role="alert">Render error: {this.state.error.message}</p>;
    return this.props.children;
  }
}

let nodeSeq = 0;
const typeName = (type) => (typeof type === 'string' ? type : type === React.Fragment ? 'Fragment' : type?.displayName || type?.name || 'Component');
const shortValue = (v) => (typeof v === 'function' ? `ƒ ${v.name || '()'}` : typeof v === 'object' && v !== null ? (Array.isArray(v) ? `[…${v.length}]` : '{…}') : JSON.stringify(v));

/** Turn a React element (a plain object) into nodes for the tree view. */
function describe(value) {
  nodeSeq += 1;
  if (value === null || value === undefined || typeof value === 'boolean') return { id: `n${nodeSeq}`, kind: 'empty', text: String(value) };
  if (typeof value === 'string' || typeof value === 'number') return { id: `n${nodeSeq}`, kind: 'text', text: JSON.stringify(value) };
  if (Array.isArray(value)) return { id: `n${nodeSeq}`, kind: 'array', text: `Array(${value.length})`, children: value.map(describe) };
  if (React.isValidElement(value)) {
    const { children, ...props } = value.props;
    const kids = children === undefined ? [] : (Array.isArray(children) ? children : [children]).map(describe);
    return {
      id: `n${nodeSeq}`,
      kind: typeof value.type === 'string' ? 'host' : value.type === React.Fragment ? 'fragment' : 'component',
      type: typeName(value.type),
      key: value.key,
      props: Object.entries(props).map(([k, v]) => `${k}=${shortValue(v)}`),
      children: kids,
    };
  }
  return { id: `n${nodeSeq}`, kind: 'text', text: shortValue(value) };
}

function ElementLabel({ node }) {
  if (node.kind === 'text') return <span className={styles.elText}>{node.text}</span>;
  if (node.kind === 'empty') return <span className={styles.muted}>{node.text} (renders nothing)</span>;
  if (node.kind === 'array') return <span className={styles.muted}>{node.text}</span>;
  return (
    <span className={styles.elNode}>
      <span className={node.kind === 'component' ? styles.componentName : styles.hostName}>{'{'} type: {node.kind === 'host' ? `"${node.type}"` : node.type}</span>
      {node.key != null && <span className={styles.elKey}> key: &quot;{node.key}&quot;</span>}
      {node.props.length > 0 && <span className={styles.elProps}> props: {node.props.join(', ')}</span>}
      <span className={node.kind === 'component' ? styles.componentName : styles.hostName}> {'}'}</span>
      {node.kind === 'component' && <span className={styles.muted}> → React calls {node.type}(props) when rendering</span>}
    </span>
  );
}

export default function JsxTab() {
  const [params, setParams] = useSearchParams();
  const example = findExample(params.get('example'));
  const [edits, setEdits] = useState({});
  const source = edits[example.id] ?? example.code;
  const [debounced, setDebounced] = useState(source);
  const [count, setCount] = useState(0);
  const logged = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(source), 250);
    return () => clearTimeout(t);
  }, [source]);
  useEffect(() => {
    setDebounced(source);
    setCount(0);
  }, [example.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const scope = example.scope({ count, setCount });
  const compiled = useMemo(() => compileJsx(debounced, Object.keys(scope)), [debounced, example.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let element = null;
  let evalError = null;
  if (compiled.ok) {
    try {
      element = evaluate(compiled.code, React, scope);
    } catch (err) {
      evalError = err;
    }
  }

  useEffect(() => {
    if (compiled.ok && edits[example.id] !== undefined && !logged.current) {
      logged.current = true;
      recordExperimentRun('jsx-render', 'success', { example: example.id });
    }
  }, [compiled.ok, edits, example.id]);

  nodeSeq = 0;
  const elementTree = element !== null && !evalError ? [describe(element)] : [];
  const failed = !compiled.ok || evalError;
  const steps = [
    { id: 'jsx', label: 'JSX', layer: 'ui', status: 'done', summary: `${source.split('\n').length} line(s)` },
    { id: 'compile', label: 'createElement()', layer: 'state', status: compiled.ok ? 'done' : 'error', summary: compiled.ok ? `${(compiled.code.match(/React\.createElement/g) ?? []).length} call(s)` : 'compile error' },
    { id: 'element', label: 'React element', layer: 'render', status: failed ? 'skipped' : 'done', summary: failed ? null : 'plain JS object' },
    { id: 'ui', label: 'Rendered UI', layer: 'dom', status: failed ? 'skipped' : 'done', summary: failed ? null : 'react-dom' },
  ];

  return (
    <div className={styles.jsxPage}>
      <div className={styles.exampleTabs} role="tablist" aria-label="JSX examples">
        {EXAMPLES.map((ex) => (
          <button key={ex.id} type="button" role="tab" aria-selected={ex.id === example.id} className={styles.exampleTab} onClick={() => setParams({ example: ex.id })}>
            {ex.title}
          </button>
        ))}
      </div>

      <Card>
        <FlowPipeline steps={steps} orientation="horizontal" label="JSX pipeline" />
      </Card>

      <div className={styles.jsxGrid}>
        <Card title="1 · JSX" icon={Code} bodyClassName={styles.flushBody}
          actions={<Button size="sm" variant="ghost" icon={RotateCcw} disabled={edits[example.id] === undefined} onClick={() => setEdits(({ [example.id]: _x, ...rest }) => rest)}>Reset</Button>}>
          <p className={styles.explain}><Lightbulb size={14} aria-hidden="true" /> {example.explain}</p>
          <p className={styles.scopeLine}>In scope: {Object.keys(scope).length ? Object.keys(scope).map((k) => <code key={k}>{k}</code>) : <em>nothing (plain JSX)</em>}</p>
          <div className={styles.jsxEditor}>
            <CodeEditor
              docId={`jsx-${example.id}`}
              value={source}
              language="jsx"
              onChange={(v) => setEdits((e) => ({ ...e, [example.id]: v }))}
              diagnostics={compiled.ok ? [] : [{ line: compiled.error.line, col: compiled.error.col, message: compiled.error.message }]}
              ariaLabel="JSX source"
            />
          </div>
          {!compiled.ok && <p className={styles.errorText} role="alert">Line {compiled.error.line}: {compiled.error.message}</p>}
        </Card>

        <Card title="2 · Compiled to React.createElement" icon={Code}>
          {compiled.ok ? <pre className={styles.code} aria-label="Compiled JavaScript">{compiled.code}</pre>
            : <EmptyState title="Fix the JSX">The compiled JavaScript appears here.</EmptyState>}
        </Card>

        <Card title="3 · React element (object tree)" icon={Network} bodyClassName={styles.scrollBody}>
          {evalError && <p className={styles.errorText} role="alert">{evalError.message}</p>}
          {elementTree.length ? (
            <TreeView key={debounced + count} nodes={elementTree} selectedId={null} onSelect={() => {}} label="React element tree"
              renderLabel={(node) => <ElementLabel node={node} />} defaultExpandedDepth={8} expandToSelected={false} />
          ) : !evalError && <EmptyState title="No element yet" />}
        </Card>

        <Card title="4 · Rendered UI" icon={Eye}>
          <div className={styles.jsxOutput} aria-label="Rendered output">
            {!failed && <RenderBoundary key={debounced}>{element}</RenderBoundary>}
          </div>
          {example.stateful && <p className={styles.muted}>count is real React state held by this page: clicking re-runs the JSX with the new value.</p>}
        </Card>
      </div>
    </div>
  );
}
