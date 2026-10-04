import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { Code, Eye, Network, Play, RotateCcw, Save, SquareTerminal, TriangleAlert } from 'lucide-react';
import { CodeEditor } from '../../editor/CodeEditor.jsx';
import { buildDocument } from '../../sandbox/buildDocument.js';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SplitPane } from '../../components/ui/SplitPane.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { projectsApi, toFileList, toFileMap } from '../../services/projects.js';
import { recordExperimentRun } from '../../services/activity.js';
import { formatMs, relativeTime } from '../../utils/format.js';
import { usePlaygroundState } from './usePlaygroundState.js';
import { FILE_ORDER, TEMPLATES } from './templates.js';
import { FileExplorer, fileMeta } from './FileExplorer.jsx';
import { PreviewPane } from './PreviewPane.jsx';
import { ConsolePanel } from './ConsolePanel.jsx';
import { ProblemsPanel } from './ProblemsPanel.jsx';
import styles from './WebPlayground.module.css';

const AUTO_RUN_DELAY_MS = 700;
const MAX_CONSOLE_ENTRIES = 500;
const EDITOR_LANGUAGE = { html: 'html', css: 'css', js: 'javascript' };

let entrySeq = 0;
const nextId = () => ++entrySeq;
const clock = () => new Date().toLocaleTimeString([], { hour12: false });

function SaveDialog({ open, initialTitle, saving, error, onSubmit, onClose }) {
  const [title, setTitle] = useState(initialTitle);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setTouched(false);
    }
  }, [open, initialTitle]);
  const clientError = !title.trim() ? 'Give your project a name.' : title.trim().length > 120 ? 'Use at most 120 characters.' : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as project"
      description="Projects are stored in your account and listed on the dashboard."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={Save} loading={saving} type="submit" form="save-project-form">Save project</Button>
        </>
      )}
    >
      <form
        id="save-project-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!clientError) onSubmit(title.trim());
        }}
      >
        <TextField
          label="Project name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={(touched && clientError) || error}
          maxLength={120}
          autoFocus
        />
      </form>
    </Modal>
  );
}

export default function WebPlaygroundPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectParam = searchParams.get('project');
  const { state, dirty, modifiedFiles, actions, clearDraft } = usePlaygroundState();

  const [run, setRun] = useState(null);
  const [consoleEntries, setConsoleEntries] = useState([]);
  const [problems, setProblems] = useState([]);
  const [runInfo, setRunInfo] = useState(null);
  const [autoRun, setAutoRun] = useLocalStorageState('webforge.playground.autoRun', true);
  const [device, setDevice] = useLocalStorageState('webforge.playground.device', 'responsive');
  const [dockTab, setDockTab] = useState('console');
  const [mobileView, setMobileView] = useState('code');
  const [load, setLoad] = useState({ status: projectParam ? 'loading' : 'ready', error: null });
  const [saveDialog, setSaveDialog] = useState({ open: false, saving: false, error: null });
  const [pendingDiscard, setPendingDiscard] = useState(null); // { message, action }

  const editorRef = useRef(null);
  const filesRef = useRef(state.files);
  filesRef.current = state.files;
  const problemsRef = useRef(problems);
  problemsRef.current = problems;
  const runCount = useRef(0);
  const runRef = useRef(null);
  const autoRunTimer = useRef(null);
  const compact = useMediaQuery('(max-width: 900px)');

  // ------------------------------------------------------------------ running
  const runCode = useCallback((manual) => {
    clearTimeout(autoRunTimer.current);
    const id = `run-${Date.now()}-${++runCount.current}`;
    const { srcdoc, diagnostics, stats } = buildDocument(filesRef.current, { runId: id, parentOrigin: window.location.origin });
    runRef.current = { id, manual };
    setRun({ id, srcdoc, manual });
    setRunInfo({ number: runCount.current, loops: stats.loopsGuarded, ms: null });
    setProblems(diagnostics.map((d) => ({ ...d, id: nextId() })));
    setConsoleEntries([{ id: nextId(), level: 'separator', text: `Run #${runCount.current} · ${clock()}` }]);
    if (manual && diagnostics.some((d) => d.severity === 'error')) {
      setDockTab('problems');
      recordExperimentRun('web-playground-run', 'error', { reason: 'syntax' });
    }
  }, []);

  const addConsole = useCallback((entry) => {
    setConsoleEntries((list) => [...list, { id: nextId(), time: clock(), ...entry }].slice(-MAX_CONSOLE_ENTRIES));
  }, []);

  const onSandboxMessage = useCallback((message) => {
    const { type, payload } = message;
    if (type === 'console') {
      addConsole({ level: payload.level, args: payload.args });
    } else if (type === 'console-clear') {
      setConsoleEntries([]);
    } else if (type === 'error') {
      const problem = { id: nextId(), severity: payload.kind === 'resource' ? 'warning' : 'error', ...payload };
      setProblems((list) => [...list, problem]);
      addConsole({ level: problem.severity === 'error' ? 'error' : 'warn', args: [{ t: 'error', v: payload.message }] });
    } else if (type === 'notice') {
      setProblems((list) => [...list, { id: nextId(), severity: 'warning', kind: 'sandbox', message: payload.message }]);
      addConsole({ level: 'warn', args: [{ t: 'string', v: payload.message }] });
    } else if (type === 'ready') {
      setRunInfo((info) => (info ? { ...info, ms: payload.ms } : info));
      if (runRef.current?.manual && runRef.current.id === message.runId) {
        const failed = problemsRef.current.some((p) => p.severity === 'error');
        recordExperimentRun('web-playground-run', failed ? 'error' : 'success', {
          sizes: Object.fromEntries(FILE_ORDER.map((f) => [f, filesRef.current[f]?.length ?? 0])),
        });
      }
    }
  }, [addConsole]);

  const runManually = useCallback(() => runCode(true), [runCode]);

  // First run once files are available, and debounced auto-run on every edit.
  const firstRun = useRef(true);
  useEffect(() => {
    if (load.status !== 'ready') return undefined;
    if (firstRun.current) {
      firstRun.current = false;
      runCode(false);
      return undefined;
    }
    if (!autoRun) return undefined;
    autoRunTimer.current = setTimeout(() => runCode(false), AUTO_RUN_DELAY_MS);
    return () => clearTimeout(autoRunTimer.current);
  }, [state.files, autoRun, load.status, runCode]);

  // ------------------------------------------------------------------ projects
  useEffect(() => {
    if (!projectParam) {
      if (state.project) setSearchParams({ project: String(state.project.id) }, { replace: true });
      return undefined;
    }
    if (state.project?.id === Number(projectParam)) {
      setLoad({ status: 'ready', error: null });
      return undefined;
    }
    const controller = new AbortController();
    setLoad({ status: 'loading', error: null });
    projectsApi.get(projectParam, { signal: controller.signal }).then(
      (project) => {
        if (project.type !== 'web') {
          setLoad({ status: 'error', error: new Error(`"${project.title}" is a ${project.type} project and cannot be opened in the Web Playground.`) });
          return;
        }
        const files = { ...Object.fromEntries(FILE_ORDER.map((f) => [f, ''])), ...toFileMap(project.files) };
        actions.loadProject(project, files);
        firstRun.current = true;
        setLoad({ status: 'ready', error: null });
      },
      (error) => {
        if (error.name !== 'AbortError') setLoad({ status: 'error', error });
      },
    );
    return () => controller.abort();
    // state.project intentionally omitted: only the URL decides what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam]);

  const save = useCallback(async (titleForNew) => {
    const payload = { title: state.project ? state.title : titleForNew, type: 'web', files: toFileList(filesRef.current, FILE_ORDER) };
    setSaveDialog((d) => ({ ...d, saving: true, error: null }));
    try {
      const saved = state.project
        ? await projectsApi.save(state.project.id, payload)
        : await projectsApi.create(payload);
      actions.markSaved(saved);
      if (!state.project) {
        clearDraft();
        setSearchParams({ project: String(saved.id) }, { replace: true });
      }
      setSaveDialog({ open: false, saving: false, error: null });
      toast.success(`Saved "${saved.title}".`);
    } catch (error) {
      setSaveDialog((d) => ({ ...d, saving: false, error: error.fields?.title ?? null }));
      if (!error.fields?.title) toast.error(`Save failed: ${error.message}`);
    }
  }, [state.project, state.title, actions, clearDraft, setSearchParams, toast]);

  const requestSave = useCallback(() => {
    if (state.project) save();
    else setSaveDialog({ open: true, saving: false, error: null });
  }, [state.project, save]);

  // Ctrl/Cmd+Enter and Ctrl/Cmd+S also work when focus is outside the editor.
  useEffect(() => {
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        runManually();
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        requestSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runManually, requestSave]);

  // Protect unsaved project changes: browser close/reload and in-app navigation.
  const unsavedProject = Boolean(state.project && dirty);
  useEffect(() => {
    if (!unsavedProject) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsavedProject]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsavedProject && currentLocation.pathname !== nextLocation.pathname);

  function confirmDiscard(message, action) {
    if (dirty) setPendingDiscard({ message, action });
    else action();
  }

  function startFromTemplate(templateId) {
    confirmDiscard('Starting from a template replaces the current files.', () => {
      actions.useTemplate(templateId);
      clearDraft();
      firstRun.current = true;
      if (projectParam) setSearchParams({}, { replace: true });
    });
  }

  function jumpTo(file, line, col) {
    actions.select(file);
    setMobileView('code');
    // The editor swaps documents in an effect; position the cursor after it.
    setTimeout(() => line && editorRef.current?.goTo(line, col ?? 1), 0);
  }

  // ------------------------------------------------------------------ derived
  const activeExt = state.active.split('.').pop();
  const editorDiagnostics = useMemo(
    () => problems.filter((p) => p.file === state.active && p.line && p.severity === 'error'),
    [problems, state.active],
  );
  const problemCounts = useMemo(() => problems.reduce((acc, p) => {
    if (p.file && p.severity !== 'info') acc[p.file] = (acc[p.file] ?? 0) + 1;
    return acc;
  }, {}), [problems]);
  const errorCount = problems.filter((p) => p.severity === 'error').length;
  const warningCount = problems.filter((p) => p.severity === 'warning').length;
  const logCount = consoleEntries.filter((e) => e.level !== 'separator').length;
  const lines = state.files[state.active]?.split('\n').length ?? 0;

  const statusBadge = state.project
    ? (dirty ? <Badge tone="warning">Unsaved changes</Badge> : <Badge tone="success">Saved {relativeTime(state.project.updatedAt)}</Badge>)
    : <Badge>Local draft</Badge>;

  if (load.status === 'loading') return <LoadingState label="Opening project…" />;
  if (load.status === 'error') {
    return (
      <div className={styles.loadError}>
        <ErrorState
          title={load.error.status === 404 ? 'Project not found' : 'Could not open this project'}
          error={load.error.status === 404 ? new Error('It may have been deleted, or it belongs to another account.') : load.error}
        />
        <Button variant="primary" onClick={() => setSearchParams({}, { replace: true })}>Start a new experiment</Button>
      </div>
    );
  }

  const editorPane = (
    <section id="editor-panel" role="tabpanel" aria-labelledby={`file-tab-${state.active.replace('.', '-')}`} className={styles.editorPane}>
      <div className={styles.editorBody}>
        <CodeEditor
          ref={editorRef}
          docId={state.active}
          value={state.files[state.active] ?? ''}
          language={EDITOR_LANGUAGE[activeExt]}
          onChange={(content) => actions.edit(state.active, content)}
          onRun={runManually}
          onSave={requestSave}
          diagnostics={editorDiagnostics}
          ariaLabel={`${state.active} source code`}
        />
      </div>
      <footer className={styles.statusBar}>
        <span style={{ color: fileMeta(state.active).color }}>{fileMeta(state.active).language}</span>
        <span>{lines} line{lines === 1 ? '' : 's'}</span>
        {runInfo && (
          <span className={styles.statusRun}>
            Run #{runInfo.number}{runInfo.ms != null && ` · DOM ready in ${formatMs(runInfo.ms)}`}
            {runInfo.loops > 0 && ` · ${runInfo.loops} loop${runInfo.loops > 1 ? 's' : ''} guarded`}
          </span>
        )}
      </footer>
    </section>
  );

  const preview = (
    <PreviewPane
      run={run}
      onMessage={onSandboxMessage}
      onRefresh={runManually}
      device={device}
      onDeviceChange={setDevice}
    />
  );

  const dock = (
    <section className={styles.dock} aria-label="Output">
      <div className={styles.dockTabs} role="tablist" aria-label="Output panels">
        {[
          { id: 'console', label: 'Console', icon: SquareTerminal, count: logCount },
          { id: 'problems', label: 'Problems', icon: TriangleAlert, count: errorCount + warningCount, danger: errorCount > 0 },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`dock-tab-${tab.id}`}
              aria-selected={dockTab === tab.id}
              aria-controls={`dock-panel-${tab.id}`}
              className={styles.dockTab}
              onClick={() => setDockTab(tab.id)}
            >
              <Icon size={14} aria-hidden="true" />
              {tab.label}
              {tab.count > 0 && <span className={`${styles.count} ${tab.danger ? styles.countDanger : ''}`}>{tab.count}</span>}
            </button>
          );
        })}
      </div>
      <div id={`dock-panel-${dockTab}`} role="tabpanel" aria-labelledby={`dock-tab-${dockTab}`} className={styles.dockBody}>
        {dockTab === 'console'
          ? <ConsolePanel entries={consoleEntries} onClear={() => setConsoleEntries([])} />
          : <ProblemsPanel problems={problems} onJump={jumpTo} openableFiles={FILE_ORDER} />}
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{state.project?.title ?? state.title}</h1>
          {statusBadge}
        </div>

        <label className={styles.templatePicker}>
          <span className="sr-only">Start from a template</span>
          <select
            value=""
            onChange={(e) => e.target.value && startFromTemplate(e.target.value)}
            className={styles.select}
          >
            <option value="">New from template…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.title}: {t.description}</option>)}
          </select>
        </label>

        <div className={styles.actions}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            <span className={styles.toggleTrack} aria-hidden="true" />
            Auto-run
          </label>
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={() => confirmDiscard(
              state.project ? 'Revert all files to the last saved version?' : 'Reset all files to the original template?',
              () => { actions.revert(); },
            )}
            disabled={!dirty}
            title={state.project ? 'Revert to last saved version' : 'Reset to template'}
          >
            {state.project ? 'Revert' : 'Reset'}
          </Button>
          <Button icon={Save} onClick={requestSave} loading={saveDialog.saving && !saveDialog.open} disabled={Boolean(state.project) && !dirty} title="Save (Ctrl+S)">
            Save
          </Button>
          <Button
            variant="ghost"
            icon={Network}
            onClick={() => navigate('/lab/dom-explorer', { state: { files: filesRef.current, title: state.title } })}
            title="Open this page in the DOM Explorer"
          >
            Inspect DOM
          </Button>
          <Button variant="primary" icon={Play} onClick={runManually} title="Run (Ctrl+Enter)">Run</Button>
        </div>
      </header>

      {compact && (
        <div className={styles.mobileSwitch} role="radiogroup" aria-label="Show">
          {[
            { id: 'code', label: 'Code', icon: Code },
            { id: 'preview', label: 'Preview', icon: Eye },
            { id: 'output', label: 'Output', icon: SquareTerminal },
          ].map((v) => {
            const Icon = v.icon;
            return (
              <button key={v.id} type="button" role="radio" aria-checked={mobileView === v.id} onClick={() => setMobileView(v.id)}>
                <Icon size={15} aria-hidden="true" />{v.label}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.workspace}>
        {(!compact || mobileView === 'code') && (
          <FileExplorer
            files={FILE_ORDER}
            active={state.active}
            modified={modifiedFiles}
            problemCounts={problemCounts}
            onSelect={actions.select}
            title={state.project ? 'Project files' : 'Files'}
          />
        )}
        {compact ? (
          // Small screens: one view at a time; all stay mounted so the preview keeps running.
          <div className={styles.compactLayout}>
            <div hidden={mobileView !== 'code'} className={styles.compactView}>{editorPane}</div>
            <div hidden={mobileView !== 'preview'} className={styles.compactView}>{preview}</div>
            <div hidden={mobileView !== 'output'} className={styles.compactView}>{dock}</div>
          </div>
        ) : (
          <SplitPane direction="vertical" initial={0.7} minSize={120} storageKey="webforge.playground.split.dock" label="Resize output panel">
            <SplitPane direction="horizontal" initial={0.5} minSize={240} storageKey="webforge.playground.split.main" label="Resize editor and preview">
              {editorPane}
              {preview}
            </SplitPane>
            {dock}
          </SplitPane>
        )}
      </div>

      <SaveDialog
        open={saveDialog.open}
        initialTitle={state.title}
        saving={saveDialog.saving}
        error={saveDialog.error}
        onSubmit={save}
        onClose={() => setSaveDialog({ open: false, saving: false, error: null })}
      />

      <Modal
        open={Boolean(pendingDiscard) || blocker.state === 'blocked'}
        onClose={() => {
          setPendingDiscard(null);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        title="Discard unsaved changes?"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => {
              setPendingDiscard(null);
              if (blocker.state === 'blocked') blocker.reset();
            }}>Keep editing</Button>
            <Button variant="danger" onClick={() => {
              if (blocker.state === 'blocked') blocker.proceed();
              pendingDiscard?.action();
              setPendingDiscard(null);
            }}>Discard changes</Button>
          </>
        )}
      >
        <p>{blocker.state === 'blocked' ? 'You are leaving the Web Playground with unsaved project changes.' : pendingDiscard?.message}</p>
      </Modal>
    </div>
  );
}
