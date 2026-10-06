import React, { Component as ReactComponent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code, Eye, FolderOpen, Lightbulb, Network, RotateCcw, Save, X } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { projectsApi } from '../../services/projects.js';
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
  const projectParam = params.get('project');
  const [edits, setEdits] = useState({});
  // A saved JSX project: one file named <exampleId>.jsx, so it reopens with that example's scope.
  const [project, setProject] = useState(null); // { id, title, description, exampleId, saved }
  const [projectError, setProjectError] = useState(null);
  const [saveDialog, setSaveDialog] = useState(null); // { title, busy, error }
  const toast = useToast();
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

  useEffect(() => {
    if (!projectParam || project?.id === Number(projectParam)) return undefined;
    const controller = new AbortController();
    setProjectError(null);
    projectsApi.get(projectParam, { signal: controller.signal }).then((p) => {
      const file = p.files.find((f) => f.filename.endsWith('.jsx'));
      if (p.type !== 'jsx' || !file) {
        setProjectError(`"${p.title}" is not a JSX project.`);
        return;
      }
      const ex = findExample(file.filename.replace(/.jsx$/, ''));
      setEdits((e) => ({ ...e, [ex.id]: file.content }));
      setProject({ id: p.id, title: p.title, description: p.description, exampleId: ex.id, saved: file.content });
      setParams({ example: ex.id, project: String(p.id) }, { replace: true });
    }, (err) => err.name !== 'AbortError' && setProjectError(err.message));
    return () => controller.abort();
  }, [projectParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const inProject = project && project.exampleId === example.id && projectParam === String(project.id);
  const dirty = inProject && source !== project.saved;

  async function saveProject(title) {
    const payload = { title, type: 'jsx', description: inProject ? project.description : null, files: [{ filename: `${example.id}.jsx`, content: source }] };
    if (!inProject) setSaveDialog((d) => ({ ...d, busy: true, error: null }));
    try {
      const saved = inProject ? await projectsApi.save(project.id, payload) : await projectsApi.create(payload);
      setProject({ id: saved.id, title: saved.title, description: saved.description, exampleId: example.id, saved: source });
      setParams({ example: example.id, project: String(saved.id) }, { replace: true });
      setSaveDialog(null);
      toast.success(`Saved "${saved.title}".`);
    } catch (err) {
      if (inProject) toast.error(`Save failed: ${err.message}`);
      else setSaveDialog((d) => ({ ...d, busy: false, error: err.fields?.title ?? err.message }));
    }
  }

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

      <div className={styles.projectBar}>
        {projectError ? <p className={styles.errorText} role="alert">{projectError}</p>
          : inProject ? (
            <p><FolderOpen size={15} aria-hidden="true" /> Project <strong>{project.title}</strong> · {dirty ? 'unsaved changes' : 'saved'}</p>
          ) : <p className={styles.muted}>Edit an example, then save it as a project to keep your version.</p>}
        <div className={styles.projectActions}>
          {inProject ? (
            <>
              <Button size="sm" variant="primary" icon={Save} disabled={!dirty} onClick={() => saveProject(project.title)}>Save</Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => setParams({ example: example.id })}>Close project</Button>
            </>
          ) : (
            <Button size="sm" icon={Save} onClick={() => setSaveDialog({ title: '', busy: false, error: null })}>Save as project</Button>
          )}
        </div>
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

      <Modal open={Boolean(saveDialog)} onClose={() => setSaveDialog(null)} title="Save as project"
        description={`Saves your JSX for "${example.title}" to Projects.`}
        footer={<><Button onClick={() => setSaveDialog(null)}>Cancel</Button><Button variant="primary" loading={saveDialog?.busy}
          onClick={() => (saveDialog.title.trim() ? saveProject(saveDialog.title.trim()) : setSaveDialog((d) => ({ ...d, error: 'Give the project a title.' })))}>Save</Button></>}>
        {saveDialog && (
          <form onSubmit={(e) => { e.preventDefault(); if (saveDialog.title.trim()) saveProject(saveDialog.title.trim()); else setSaveDialog((d) => ({ ...d, error: 'Give the project a title.' })); }} noValidate>
            <TextField label="Title" value={saveDialog.title} maxLength={120} autoFocus error={saveDialog.error}
              onChange={(e) => setSaveDialog((d) => ({ ...d, title: e.target.value }))} />
          </form>
        )}
      </Modal>
    </div>
  );
}
