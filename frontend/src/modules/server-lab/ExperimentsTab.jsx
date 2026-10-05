import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Code, Cpu, Play, SquareTerminal } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { CodeEditor } from '../../editor/CodeEditor.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api, apiRequest } from '../../services/apiClient.js';
import { formatMs } from '../../utils/format.js';
import styles from './ServerLab.module.css';

function stageSteps(state, result, input) {
  const running = state === 'running';
  const failed = state === 'error';
  return [
    { id: 'input', layer: 'ui', label: 'Input', status: state === 'idle' ? 'idle' : 'done', summary: input ? `${Object.keys(input).length} validated value(s)` : null },
    { id: 'processing', layer: 'server', label: 'Server processing', status: running ? 'active' : failed ? 'error' : result ? 'done' : 'idle', summary: result ? `${result.steps.length} PHP steps · ${formatMs(result.executionMs)}` : null },
    { id: 'output', layer: 'render', label: 'Output', status: result ? 'done' : failed ? 'skipped' : 'idle', summary: result ? `${result.stdout.split('\n').filter(Boolean).length} line(s) echoed` : null },
  ];
}

export default function ExperimentsTab() {
  const [params, setParams] = useSearchParams();
  const list = useApi((signal) => api.get('/lab/server/experiments', { signal }), []);
  const experiments = list.data ?? [];
  const selected = experiments.find((e) => e.slug === params.get('experiment')) ?? experiments[0];

  const [values, setValues] = useState({});
  const [run, setRun] = useState({ state: 'idle', result: null, error: null });

  // Reset the form to the experiment's defaults whenever another experiment is chosen.
  useEffect(() => {
    if (!selected) return;
    setValues(Object.fromEntries(selected.inputs.map((i) => [i.name, String(i.default ?? '')])));
    setRun({ state: 'idle', result: null, error: null });
  }, [selected?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function execute(e) {
    e.preventDefault();
    setRun({ state: 'running', result: null, error: null });
    try {
      const { data } = await apiRequest(`/lab/server/run/${selected.slug}`, { method: 'POST', body: { input: values }, source: 'server-lab' });
      setRun({ state: 'done', result: data, error: null });
    } catch (error) {
      setRun({ state: 'error', result: null, error });
    }
  }

  if (list.status === 'loading' && !list.data) return <LoadingState label="Loading experiments…" />;
  if (list.status === 'error') return <ErrorState title="Could not load the experiments" error={list.error} onRetry={list.reload} />;

  const { state, result, error } = run;

  return (
    <div className={styles.experimentsGrid}>
      <nav className={styles.experimentList} aria-label="Experiments">
        {experiments.map((exp) => (
          <button
            key={exp.slug}
            type="button"
            className={styles.experimentItem}
            aria-current={exp.slug === selected?.slug ? 'true' : undefined}
            onClick={() => setParams({ experiment: exp.slug })}
          >
            <span className={styles.experimentTitle}>{exp.title}</span>
            <code className={styles.experimentSlug}>{exp.slug}.php</code>
          </button>
        ))}
      </nav>

      {selected && (
        <div className={styles.column}>
          <Card title={selected.title} icon={Cpu}>
            <p className={styles.description}>{selected.description}</p>
            <form className={styles.inputForm} onSubmit={execute} noValidate>
              {selected.inputs.map((field) => (
                <label key={field.name} className={`${styles.field} ${field.type === 'textarea' ? styles.fieldWide : ''}`}>
                  <span className={styles.fieldLabel}>{field.label} <code>$in[&quot;{field.name}&quot;]</code></span>
                  {field.type === 'textarea' ? (
                    <textarea className={styles.textarea} rows={2} value={values[field.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))} />
                  ) : (
                    <input className={styles.input} type={field.type === 'number' ? 'number' : 'text'} value={values[field.name] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))} aria-invalid={error?.fields?.[field.name] ? 'true' : undefined} />
                  )}
                  {error?.fields?.[field.name] && <span className={styles.fieldError}>{error.fields[field.name]}</span>}
                </label>
              ))}
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" icon={Play} loading={state === 'running'}>Run on server</Button>
              </div>
            </form>
            <FlowPipeline steps={stageSteps(state, result, result?.input)} orientation="horizontal" label="Request stages" />
            {state === 'error' && <p className={styles.errorText} role="alert">{error.message}</p>}
          </Card>

          <Card title="Server processing" icon={Cpu}>
            {!result ? (
              <EmptyState title="Run the experiment">Each PHP statement and the value it produced will be listed here.</EmptyState>
            ) : (
              <>
                <table className={styles.stepsTable}>
                  <thead>
                    <tr><th scope="col">#</th><th scope="col">PHP</th><th scope="col">Value</th><th scope="col">Type</th></tr>
                  </thead>
                  <tbody>
                    {result.steps.map((s, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><code>{s.code}</code>{s.note && <span className={styles.note}>{s.note}</span>}</td>
                        <td><code className={styles.value}>{s.value}</code></td>
                        <td className={styles.type}>{s.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.droppedSteps > 0 && <p className={styles.note}>{result.droppedSteps} further steps were not recorded.</p>}
              </>
            )}
          </Card>

          <Card title="Output" icon={SquareTerminal}>
            {!result ? <EmptyState title="No output yet">What PHP echoes is captured with output buffering and shown here.</EmptyState> : (
              <>
                <p className={styles.metaLine}>
                  <span>echo output</span>
                  <span>executed in {formatMs(result.executionMs)}</span>
                  <span>peak memory {result.memoryPeakKb} KB</span>
                </p>
                <pre className={styles.stdout}>{result.stdout || '(nothing echoed)'}</pre>
                <p className={styles.metaLine}><span>return value</span></p>
                <pre className={styles.code}>{result.returned}</pre>
              </>
            )}
          </Card>

          <Card title="The PHP that runs" icon={Code}>
            <p className={styles.description}>This is the real <code>run()</code> method, read from the server&apos;s source file. It runs exactly as shown.</p>
            <div className={styles.source}>
              <CodeEditor docId={selected.slug} value={selected.source} language="php" readOnly ariaLabel={`${selected.title} PHP source`} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
