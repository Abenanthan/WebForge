import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Crosshair, Network, RefreshCw, Trash2 } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState, LoadingState } from '../../components/ui/StateView.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { TreeView } from '../../visualizers/TreeView.jsx';
import { SandboxFrame } from '../../sandbox/SandboxFrame.jsx';
import { buildDocument } from '../../sandbox/buildDocument.js';
import { sendSandboxCommand } from '../../sandbox/commands.js';
import { recordExperimentRun } from '../../services/activity.js';
import { DomInspector } from './DomInspector.jsx';
import { SAMPLE_PAGE } from './samplePage.js';
import styles from './DomExplorer.module.css';

const DRAFT_KEY = 'webforge.playground.draft';
const MAX_LOG = 60;

function readPlaygroundDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return typeof draft?.files?.['index.html'] === 'string' ? draft.files : null;
  } catch {
    return null;
  }
}

function NodeLabel({ node }) {
  if (node.type === 'text') return <span className={styles.treeText}>&quot;{node.text}&quot;</span>;
  return (
    <span className={`${styles.treeElement} ${node.hidden ? styles.treeHidden : ''}`}>
      <span className={styles.tag}>&lt;{node.tag}</span>
      {node.elId && <span className={styles.idPart}>#{node.elId}</span>}
      {node.classes.length > 0 && <span className={styles.classPart}>.{node.classes.join('.')}</span>}
      <span className={styles.tag}>&gt;</span>
      {node.file && <span className={styles.fileHint}>{node.file}</span>}
      {node.hidden && <span className={styles.hiddenHint}>hidden</span>}
    </span>
  );
}

/** MutationObserver records, summarised by the inspector runtime. */
function MutationList({ records }) {
  if (!records?.length) return null;
  return (
    <ul className={styles.mutations}>
      {records.map((r, i) => (
        <li key={i}>
          <span className={styles.mutationType}>{r.type}</span>
          <code>{r.target}</code>
          {r.type === 'attributes' && <span> {r.attribute}: <s>{r.oldValue ?? '∅'}</s> → {r.newValue ?? '∅'}</span>}
          {r.type === 'characterData' && <span> text: <s>{r.oldValue}</s> → {r.newValue}</span>}
          {r.type === 'childList' && (
            <span>
              {r.added.length > 0 && <> added {r.added.map((a, j) => <code key={j}>{a}</code>)}</>}
              {r.removed.length > 0 && <> removed {r.removed.map((a, j) => <code key={j}>{a}</code>)}</>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

let runSeq = 0;
let logSeq = 0;

export default function DomExplorerPage() {
  const toast = useToast();
  const location = useLocation();
  const incoming = location.state?.files ?? null;
  const [source, setSource] = useState(incoming ? 'playground' : 'sample');
  const [run, setRun] = useState(null);
  const [tree, setTree] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const frameRef = useRef(null);
  const loggedRun = useRef(false);

  const files = useMemo(() => {
    if (source === 'playground') return incoming ?? readPlaygroundDraft() ?? SAMPLE_PAGE;
    return SAMPLE_PAGE;
  }, [source, incoming]);

  const load = useCallback(() => {
    const id = `dom-${Date.now()}-${++runSeq}`;
    const { srcdoc } = buildDocument(files, { runId: id, parentOrigin: window.location.origin, inspector: true });
    setRun({ id, srcdoc });
    setTree(null);
    setSelectedId(null);
    setDetails(null);
    setPicking(false);
    setLog([]);
  }, [files]);

  useEffect(load, [load]);

  const command = useCallback((cmd, id = null, args = {}) => {
    if (!run) return;
    if (!['select', 'hover', 'pick', 'snapshot'].includes(cmd)) setBusy(true);
    sendSandboxCommand(frameRef.current, run.id, cmd, id, args);
  }, [run]);

  const select = useCallback((id) => {
    setSelectedId(id);
    command('select', id);
  }, [command]);

  const addLog = (entry) => setLog((list) => [{ id: ++logSeq, time: new Date().toLocaleTimeString([], { hour12: false }), ...entry }, ...list].slice(0, MAX_LOG));

  const onMessage = useCallback(({ type, payload }) => {
    switch (type) {
      case 'dom-snapshot':
        setTree(payload.tree);
        break;
      case 'dom-details':
        setDetails(payload);
        break;
      case 'dom-picked':
        setPicking(false);
        setSelectedId(payload.id);
        command('select', payload.id);
        break;
      case 'dom-result':
        setBusy(false);
        if (payload.ok) {
          addLog({
            kind: 'action',
            cmd: payload.cmd,
            code: `const element = document.querySelector(${JSON.stringify(payload.selector)});\n${payload.code}`,
            records: payload.mutations,
            total: payload.totalMutations,
          });
          if (!loggedRun.current) {
            loggedRun.current = true;
            recordExperimentRun('dom-inspect', 'success', { action: payload.cmd });
          }
          if (payload.cmd === 'remove') {
            setSelectedId(null);
            setDetails(null);
          }
        } else {
          toast.error(payload.error);
        }
        break;
      case 'dom-mutations': // delivered by the observer, i.e. made by the page's own scripts
        addLog({ kind: 'mutation', records: payload.records, total: payload.total });
        break;
      case 'error':
        addLog({ kind: 'error', message: payload.message });
        break;
      default:
        break;
    }
  }, [command, toast]);

  // Keep the inspector in sync after DOM changes (e.g. a page script modified the selection).
  useEffect(() => {
    if (selectedId != null && tree) command('select', selectedId);
  }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePick() {
    const next = !picking;
    setPicking(next);
    command('pick', null, { on: next });
  }

  return (
    <div className={styles.page}>
      <LabHeader
        icon={Network}
        layer="dom"
        title="DOM Explorer"
        description="Inspect a live document as a tree of nodes. Select an element to see its attributes, styles and box model, then change it and watch the DOM update."
        concepts={['DOM tree', 'querySelector', 'textContent', 'innerHTML', 'classList', 'style', 'appendChild', 'remove()', 'MutationObserver']}
        actions={(
          <>
            <label className={styles.sourcePicker}>
              <span>Document</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={styles.input}>
                <option value="sample">Sample page</option>
                <option value="playground">From Web Playground</option>
              </select>
            </label>
            <Button icon={RefreshCw} onClick={load}>Reload</Button>
          </>
        )}
      />

      <div className={styles.grid}>
        <Card title="Document tree" icon={Network} className={styles.treeCard} bodyClassName={styles.treeBody}>
          {tree ? (
            <TreeView
              key={run?.id}
              nodes={[tree]}
              selectedId={selectedId}
              onSelect={select}
              label="DOM tree"
              renderLabel={(node) => <NodeLabel node={node} />}
              defaultExpandedDepth={6}
            />
          ) : <LoadingState label="Building the DOM…" />}
        </Card>

        <Card
          title="Live page"
          className={styles.previewCard}
          bodyClassName={styles.previewBody}
          actions={(
            <Button size="sm" variant={picking ? 'primary' : 'secondary'} icon={Crosshair} onClick={togglePick} aria-pressed={picking}>
              {picking ? 'Click an element…' : 'Pick element'}
            </Button>
          )}
        >
          {run && (
            <SandboxFrame ref={frameRef} srcdoc={run.srcdoc} runId={run.id} onMessage={onMessage} title="Document being inspected" className={styles.frame} />
          )}
        </Card>

        <Card title="Inspector" className={styles.inspectorCard} bodyClassName={styles.inspectorBody}>
          {details ? (
            <DomInspector details={details} onCommand={command} onSelect={select} busy={busy} />
          ) : (
            <EmptyState icon={Crosshair} title="Nothing selected">
              Choose a node in the tree, or use “Pick element” and click inside the page.
            </EmptyState>
          )}
        </Card>
      </div>

      <Card
        title="Change log"
        actions={<Button size="sm" variant="ghost" icon={Trash2} onClick={() => setLog([])} disabled={!log.length}>Clear</Button>}
      >
        {log.length === 0 ? (
          <EmptyState title="No changes yet">
            Every action you take is shown as the equivalent JavaScript, followed by the mutations the browser recorded.
          </EmptyState>
        ) : (
          <ol className={styles.log} aria-label="DOM change log">
            {log.map((entry) => (
              <li key={entry.id} className={`${styles.logEntry} ${styles[`log-${entry.kind}`]}`}>
                <time className={styles.logTime}>{entry.time}</time>
                {entry.kind === 'action' && (
                  <div>
                    <p className={styles.logTitle}>You ran <code>{entry.cmd}</code></p>
                    <pre className={styles.code}>{entry.code}</pre>
                    <p className={styles.logSub}>
                      The browser recorded {entry.total} mutation{entry.total === 1 ? '' : 's'} <span className={styles.origin}>caused by your action</span>
                    </p>
                    <MutationList records={entry.records} />
                  </div>
                )}
                {entry.kind === 'mutation' && (
                  <div>
                    <p className={styles.logTitle}>
                      DOM changed: {entry.total} mutation{entry.total === 1 ? '' : 's'} <span className={styles.origin}>caused by page script</span>
                    </p>
                    <MutationList records={entry.records} />
                  </div>
                )}
                {entry.kind === 'error' && <p className={styles.logError}>{entry.message}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
