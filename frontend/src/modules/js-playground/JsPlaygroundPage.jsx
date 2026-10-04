import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Braces, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Lightbulb, Pause, Play, RotateCcw, SquareTerminal, TriangleAlert,
} from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { CodeEditor } from '../../editor/CodeEditor.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { SandboxFrame } from '../../sandbox/SandboxFrame.jsx';
import { buildDocument } from '../../sandbox/buildDocument.js';
import { instrumentForTrace } from '../../sandbox/traceInstrument.js';
import { recordExperimentRun } from '../../services/activity.js';
import { ConsoleValue } from '../web-playground/ConsolePanel.jsx';
import { ExecutionTimeline, VariablesPanel } from './ExecutionTimeline.jsx';
import { TOPICS, findTopic } from './topics.js';
import styles from './JsPlayground.module.css';

const HOST_PAGE = '<!DOCTYPE html><html><head><title>JS</title></head><body><script src="main.js"></script></body></html>';
const PLAY_INTERVAL_MS = 650;

let runSeq = 0;

export default function JsPlaygroundPage() {
  const [params, setParams] = useSearchParams();
  const topic = findTopic(params.get('topic'));
  const exampleIndex = Math.min(Number(params.get('example') ?? 0) || 0, topic.examples.length - 1);
  const example = topic.examples[exampleIndex];
  const key = `${topic.id}:${exampleIndex}`;

  const [edits, setEdits] = useState({});
  const code = edits[key] ?? example.code;

  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [output, setOutput] = useState([]);
  const [errors, setErrors] = useState([]);
  const [finished, setFinished] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState('timeline');
  const editorRef = useRef(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const manualRef = useRef(false);
  const errorsRef = useRef(errors);
  errorsRef.current = errors;

  const runCode = useCallback((manual) => {
    const id = `js-${Date.now()}-${++runSeq}`;
    manualRef.current = manual;
    const { srcdoc, diagnostics } = buildDocument(
      { 'index.html': HOST_PAGE, 'main.js': codeRef.current },
      { runId: id, parentOrigin: window.location.origin, instrument: instrumentForTrace, trace: true },
    );
    const syntax = diagnostics.filter((d) => d.severity === 'error');
    setRun({ id, srcdoc });
    setEvents([]);
    setOutput([]);
    setErrors(syntax.map((d) => ({ kind: 'syntax', message: d.message, line: d.line, col: d.col })));
    setFinished(syntax.length > 0);
    setTruncated(false);
    setCurrent(-1);
    setPlaying(false);
    if (syntax.length) {
      setTab('errors');
      if (manual) recordExperimentRun(topic.experiment, 'error', { example: example.title, reason: 'syntax' });
    }
  }, [topic.experiment, example.title]);

  // Run each example as soon as it is opened.
  useEffect(() => {
    runCode(false);
    setTab('timeline');
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = useCallback(({ type, payload }) => {
    if (type === 'trace') setEvents((list) => [...list, payload]);
    else if (type === 'trace-truncated') setTruncated(true);
    else if (type === 'console') setOutput((list) => [...list, payload]);
    else if (type === 'error') {
      setErrors((list) => [...list, payload]);
      setTab('errors');
    } else if (type === 'ready') {
      setFinished(true);
      setCurrent(0);
      if (manualRef.current) {
        recordExperimentRun(topic.experiment, errorsRef.current.length ? 'error' : 'success', { example: example.title });
      }
    }
  }, [topic.experiment, example.title]);

  // Step playback
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setCurrent((c) => Math.min(c + 1, events.length - 1)), PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, events.length]);

  useEffect(() => {
    if (playing && current >= events.length - 1) setPlaying(false);
  }, [playing, current, events.length]);

  const selectTopic = (id) => setParams({ topic: id });
  const selectExample = (index) => setParams({ topic: topic.id, example: String(index) });
  const step = events[current];
  const lastIndex = events.length - 1;
  const runtimeError = errors.find((e) => e.kind !== 'syntax');

  const stages = useMemo(() => [
    { id: 'input', label: 'Input', layer: 'ui', status: 'done', summary: `${code.split('\n').length} lines of code` },
    {
      id: 'execution', label: 'Execution', layer: 'state',
      status: !finished ? 'active' : errors.some((e) => e.kind === 'syntax') ? 'skipped' : runtimeError ? 'error' : 'done',
      summary: errors.some((e) => e.kind === 'syntax') ? 'not started' : `${events.length}${truncated ? '+' : ''} steps`,
    },
    {
      id: 'output', label: 'Output', layer: 'render',
      status: !finished ? 'idle' : output.length ? 'done' : 'skipped',
      summary: `${output.length} line${output.length === 1 ? '' : 's'}`,
    },
    {
      id: 'errors', label: 'Errors', layer: 'validation',
      status: !finished ? 'idle' : errors.length ? 'error' : 'done',
      summary: errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''}` : 'none',
    },
  ], [code, finished, errors, runtimeError, events.length, truncated, output.length]);

  const editorDiagnostics = errors.filter((e) => e.line).map((e) => ({ line: e.line, col: e.col, message: e.message }));

  return (
    <div className={styles.page}>
      <LabHeader
        icon={Braces}
        layer="state"
        title="JavaScript Playground"
        description="Run small programs and watch them execute: every assignment, condition, call and return is recorded as it really happens."
        concepts={['variables', 'types', 'operators', 'conditions', 'loops', 'functions', 'objects', 'arrays']}
      />

      <div className={styles.topics} role="tablist" aria-label="Topics">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === topic.id}
            className={styles.topic}
            onClick={() => selectTopic(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <section className={styles.left} aria-label="Program">
          <Card bodyClassName={styles.editorCardBody}>
            <div className={styles.exampleBar}>
              <div className={styles.examples} role="radiogroup" aria-label={`${topic.title} examples`}>
                {topic.examples.map((ex, i) => (
                  <button key={ex.title} type="button" role="radio" aria-checked={i === exampleIndex} className={styles.example} onClick={() => selectExample(i)}>
                    {ex.title}
                  </button>
                ))}
              </div>
              <div className={styles.runButtons}>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={RotateCcw}
                  disabled={edits[key] === undefined}
                  onClick={() => setEdits(({ [key]: _removed, ...rest }) => rest)}
                >
                  Reset
                </Button>
                <Button size="sm" variant="primary" icon={Play} onClick={() => runCode(true)} title="Run (Ctrl+Enter)">Run</Button>
              </div>
            </div>
            <p className={styles.focus}>
              <Lightbulb size={14} aria-hidden="true" />
              <span>{example.focus}</span>
            </p>
            <div className={styles.editor}>
              <CodeEditor
                ref={editorRef}
                docId={key}
                value={code}
                language="javascript"
                onChange={(value) => setEdits((e) => ({ ...e, [key]: value }))}
                onRun={() => runCode(true)}
                diagnostics={editorDiagnostics}
                highlightLine={step?.line ?? null}
                ariaLabel={`${example.title} code`}
              />
            </div>
          </Card>
        </section>

        <section className={styles.right} aria-label="Execution">
          <Card>
            <FlowPipeline steps={stages} orientation="horizontal" label="Program stages" selectedId={tab === 'timeline' ? 'execution' : tab} onSelect={(id) => setTab(id === 'input' || id === 'execution' ? 'timeline' : id)} />
          </Card>

          <Card className={styles.resultCard} bodyClassName={styles.resultBody}>
            <div className={styles.tabs} role="tablist" aria-label="Results">
              {[
                { id: 'timeline', label: 'Execution', count: events.length },
                { id: 'output', label: 'Output', count: output.length, icon: SquareTerminal },
                { id: 'errors', label: 'Errors', count: errors.length, icon: TriangleAlert, danger: errors.length > 0 },
              ].map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => setTab(t.id)}>
                  {t.label}
                  {t.count > 0 && <span className={`${styles.count} ${t.danger ? styles.countDanger : ''}`}>{t.count}</span>}
                </button>
              ))}
            </div>

            {tab === 'timeline' && (
              events.length === 0 ? (
                <EmptyState title={finished ? 'Nothing to trace' : 'Running…'}>
                  {finished ? 'This program finished without assignments, checks or calls to record.' : null}
                </EmptyState>
              ) : (
                <div className={styles.timelineWrap}>
                  <div className={styles.stepper} role="group" aria-label="Step through execution">
                    <Button size="sm" variant="ghost" icon={ChevronFirst} aria-label="First step" onClick={() => setCurrent(0)} disabled={current <= 0} />
                    <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous step" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current <= 0} />
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={playing ? Pause : Play}
                      onClick={() => {
                        if (!playing && current >= lastIndex) setCurrent(0);
                        setPlaying((p) => !p);
                      }}
                    >
                      {playing ? 'Pause' : 'Play'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next step" onClick={() => setCurrent((c) => Math.min(lastIndex, c + 1))} disabled={current >= lastIndex} />
                    <Button size="sm" variant="ghost" icon={ChevronLast} aria-label="Last step" onClick={() => setCurrent(lastIndex)} disabled={current >= lastIndex} />
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, lastIndex)}
                      value={Math.max(0, current)}
                      onChange={(e) => {
                        setPlaying(false);
                        setCurrent(Number(e.target.value));
                      }}
                      aria-label="Execution step"
                      className={styles.slider}
                    />
                    <span className={styles.stepCount} aria-live="polite">Step {current + 1} / {events.length}{truncated ? '+' : ''}</span>
                  </div>
                  {truncated && (
                    <p className={styles.note}>Recording stopped after 400 steps; the program kept running.</p>
                  )}
                  <div className={styles.timelineColumns}>
                    <ExecutionTimeline events={events} current={current} onSelect={(i) => { setPlaying(false); setCurrent(i); }} />
                    <aside className={styles.variables} aria-label="Variables at this step">
                      <h3 className={styles.panelTitle}>Variables at step {current + 1}</h3>
                      <VariablesPanel events={events} current={current} />
                    </aside>
                  </div>
                </div>
              )
            )}

            {tab === 'output' && (
              output.length === 0 ? (
                <EmptyState icon={SquareTerminal} title="No output">Use console.log() to print values.</EmptyState>
              ) : (
                <ol className={styles.output} aria-label="Program output">
                  {output.map((line, i) => (
                    <li key={i} className={styles[`out-${line.level}`]}>
                      {line.args.map((a, j) => <span key={j}>{j > 0 && ' '}<ConsoleValue value={a} /></span>)}
                    </li>
                  ))}
                </ol>
              )
            )}

            {tab === 'errors' && (
              errors.length === 0 ? (
                <EmptyState title="No errors">The program ran without throwing.</EmptyState>
              ) : (
                <ul className={styles.errorList} aria-label="Errors">
                  {errors.map((e, i) => (
                    <li key={i}>
                      <p className={styles.errorMessage}>{e.message}</p>
                      <p className={styles.errorMeta}>
                        {e.kind === 'syntax' ? 'Syntax error: the program did not start' : 'Runtime error: execution stopped here'}
                        {e.line && (
                          <button type="button" className={styles.errorLink} onClick={() => editorRef.current?.goTo(e.line, e.col)}>
                            line {e.line}{e.col ? `, column ${e.col}` : ''}
                          </button>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            )}
          </Card>
        </section>
      </div>

      {/* The program runs in an invisible sandbox: no DOM output, only its trace. */}
      <div className={styles.hiddenSandbox} aria-hidden="true">
        {run && <SandboxFrame srcdoc={run.srcdoc} runId={run.id} onMessage={onMessage} title="JavaScript sandbox" />}
      </div>
    </div>
  );
}
