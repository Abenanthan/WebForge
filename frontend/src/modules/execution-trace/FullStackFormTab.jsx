import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, FormInput, Send, Sparkles, Waypoints } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { api, apiRequest, ApiError } from '../../services/apiClient.js';
import { recordExperimentRun } from '../../services/activity.js';
import { createTrace, saveTrace } from '../../trace/traceBus.js';
import { compactErrors, validateEmail, validateName } from '../../utils/validation.js';
import { TraceViewer } from './TraceViewer.jsx';
import { LAYER_NAMES } from './TraceFlow.jsx';
import styles from './ExecutionTrace.module.css';

const EMPTY = { name: '', email: '', age: '', city: '' };
const SAMPLE = { name: 'Kavya Nair', email: 'kavya.nair@example.com', age: '20', city: 'Madurai' };
// Mirrors DbLabController::ROW_RULES on the server.
const RULES = {
  name: 'required · 2–80 characters · letters, spaces . \' -',
  email: 'required · valid email · max 190',
  age: 'optional · whole number 1–120',
  city: 'optional · max 80 characters',
};

function validate(v) {
  const age = v.age.trim();
  return compactErrors({
    name: validateName(v.name),
    email: validateEmail(v.email),
    age: age && !(/^\d+$/.test(age) && +age >= 1 && +age <= 120) ? 'Age must be a whole number between 1 and 120.' : null,
    city: v.city.trim().length > 80 ? 'City must be at most 80 characters.' : null,
  });
}

const PLANNED = [
  ['ui', 'You click Submit'],
  ['event', 'submit event reaches the handler'],
  ['validation', 'Client-side validation'],
  ['state', 'setState: submitting'],
  ['network', 'HTTP POST /api/lab/db/contacts'],
  ['server', 'PHP router + middleware'],
  ['validation', 'Server-side validation'],
  ['database', 'INSERT INTO lab_contacts'],
  ['network', 'Response 201 Created'],
  ['state', 'setState: success'],
  ['render', 'React re-renders'],
  ['dom', 'New table row in the DOM'],
  ['ui', 'Browser paints'],
];

export default function FullStackFormTab() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [skipClient, setSkipClient] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsError, setRowsError] = useState(null);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);
  const [renderTick, setRenderTick] = useState(0);
  const pending = useRef(null);
  const statusRef = useRef('idle'); // the closure's status is stale after await
  const tableRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/lab/db/contacts?sort=created&dir=desc', { signal: controller.signal, source: 'execution-trace' })
      .then((d) => setRows(d.rows.slice(0, 5)), (err) => err.name !== 'AbortError' && setRowsError(err.message));
    return () => controller.abort();
  }, []);

  // Runs right after React commits the update a traced setState caused.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const { trace, from, outcome } = p;
    const committed = performance.now();
    trace.record('render', 'React re-rendered <FullStackForm>', {
      from, to: committed, detail: { cause: 'state changed', status: outcome.status, note: 'measured from setState() to the commit (useLayoutEffect)' },
    });
    if (outcome.status === 'submitting') {
      // Intermediate update: the request is still in flight, so the trace goes on.
      const button = formRef.current?.querySelector('button[type="submit"]');
      trace.record('dom', 'Submit button disabled, spinner shown', {
        from: committed, detail: { disabled: button?.disabled, ariaBusy: button?.getAttribute('aria-busy') },
      });
      return;
    }
    if (outcome.rowId) {
      const tr = tableRef.current?.querySelector(`tr[data-id="${outcome.rowId}"]`);
      trace.record('dom', 'New <tr> inserted into the table', {
        from: committed, status: tr ? 'success' : 'error',
        detail: { selector: `tr[data-id="${outcome.rowId}"]`, found: Boolean(tr), text: tr?.innerText.replace(/\s+/g, ' ').trim() },
      });
    } else {
      const shown = [...(formRef.current?.querySelectorAll('[aria-invalid="true"]') ?? [])].map((el) => el.name);
      trace.record('dom', 'Error messages shown next to the fields', { from: committed, detail: { invalidFields: shown, message: outcome.message } });
    }
    requestAnimationFrame(() => {
      trace.record('ui', 'Browser painted the update', { from: committed, to: performance.now(), detail: { note: 'next animation frame after the commit' } });
      const snapshot = trace.finish(outcome.status === 'success' ? 'success' : 'error');
      setResult({ snapshot, saved: 'saving' });
      recordExperimentRun('fullstack-trace', snapshot.status, { steps: snapshot.steps.length });
      saveTrace(snapshot).then(
        () => setResult({ snapshot, saved: 'saved' }),
        (err) => setResult({ snapshot, saved: `not saved: ${err.message}` }),
      );
    });
  }, [renderTick]);

  /** setState + remember to measure the render it causes. */
  function commit(trace, outcome, update) {
    trace.step('state', `setState({ status: '${outcome.status}' })`, { before: { status: statusRef.current }, after: { status: outcome.status, ...(outcome.rowId ? { newRowId: outcome.rowId } : {}) } });
    statusRef.current = outcome.status;
    pending.current = { trace, from: performance.now(), outcome };
    update();
    setStatus(outcome.status);
    setRenderTick((t) => t + 1);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const handlerAt = performance.now();
    const native = e.nativeEvent;
    const trace = createTrace({ module: 'execution-trace', label: `Full-stack form: add "${values.name.trim() || 'contact'}"`, startedAt: native.timeStamp });
    setResult(null);
    setMessage(null);
    setLive([]);
    trace.subscribe((t) => setLive([...t.steps]));

    trace.record('ui', 'User submitted the form', {
      from: native.timeStamp,
      detail: { submitter: native.submitter?.textContent?.trim() ?? 'Enter key', isTrusted: native.isTrusted, values },
    });
    trace.record('event', 'submit event → onSubmit handler', {
      from: native.timeStamp, to: handlerAt,
      detail: { type: native.type, target: 'form#fullstack-form', bubbles: native.bubbles, defaultPrevented: native.defaultPrevented, note: 'preventDefault() stopped the full page reload' },
    });

    if (skipClient) {
      trace.step('validation', 'Client-side validation skipped', { note: 'The checkbox is on, so the browser sends the data unchecked. The server must still validate it.' });
    } else {
      const span = trace.begin('validation', 'Client-side validation', { rules: RULES });
      const found = validate(values);
      const failed = Object.keys(found).length > 0;
      span.end({ status: failed ? 'error' : 'success', detail: { errors: found, passed: !failed } });
      if (failed) {
        commit(trace, { status: 'invalid', message: 'Fix the highlighted fields. Nothing was sent to the server.' }, () => {
          setErrors(found);
          setMessage({ tone: 'error', text: 'Fix the highlighted fields. Nothing was sent to the server.' });
        });
        return;
      }
    }

    commit(trace, { status: 'submitting' }, () => setErrors({}));
    const body = { name: values.name, email: values.email, age: values.age.trim() === '' ? null : values.age.trim(), city: values.city };
    try {
      const { data } = await apiRequest('/lab/db/contacts', { method: 'POST', body, trace, source: 'execution-trace' });
      commit(trace, { status: 'success', rowId: data.id }, () => {
        setRows((r) => [data.row, ...r].slice(0, 5));
        setValues(EMPTY);
        setMessage({ tone: 'success', text: `Saved as row #${data.id} in lab_contacts.` });
      });
    } catch (err) {
      const text = err instanceof ApiError ? err.message : 'Request failed.';
      commit(trace, { status: 'error', message: text }, () => {
        setErrors(err.fields ?? {});
        setMessage({ tone: 'error', text: err.code === 'QUOTA_EXCEEDED' ? `${text} (Reset the table in the Database Lab.)` : text });
      });
    }
  }

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const liveSteps = (live ?? []).map((s, i) => ({
    id: `${i}`, label: s.name, layer: s.layer, status: s.status === 'error' ? 'error' : 'done', summary: `${LAYER_NAMES[s.layer]} · +${s.startedMs.toFixed(1)} ms`,
  }));

  return (
    <div className={styles.scenario}>
      <div className={styles.scenarioGrid}>
        <div className={styles.column}>
          <Card title="Add a contact" icon={FormInput}
            actions={<Button size="sm" variant="ghost" icon={Sparkles} onClick={() => { setValues(SAMPLE); setErrors({}); }}>Fill sample</Button>}>
            <form id="fullstack-form" ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
              <TextField label="Name" name="name" value={values.name} onChange={set('name')} error={errors.name} autoComplete="off" hint={RULES.name} />
              <TextField label="Email" name="email" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="off" hint={RULES.email} />
              <div className={styles.formRow}>
                <TextField label="Age" name="age" inputMode="numeric" value={values.age} onChange={set('age')} error={errors.age} />
                <TextField label="City" name="city" value={values.city} onChange={set('city')} error={errors.city} />
              </div>
              <label className={styles.check}>
                <input type="checkbox" checked={skipClient} onChange={(e) => setSkipClient(e.target.checked)} />
                Skip client-side validation (send invalid data and watch the server reject it)
              </label>
              <div className={styles.formActions}>
                <Button type="submit" variant="primary" icon={Send} loading={status === 'submitting'}>Submit</Button>
                {message && <p role="status" className={message.tone === 'error' ? styles.statusError : styles.statusOk}>{message.text}</p>}
              </div>
            </form>
          </Card>

          <Card title="lab_contacts (newest first)" icon={Database} actions={<Link className={styles.link} to="/lab/database-lab">Open in Database Lab</Link>}>
            {rowsError ? <p className={styles.statusError}>{rowsError}</p> : rows.length === 0 ? <p className={styles.muted}>Your table is empty.</p> : (
              <div className={styles.tableWrap}>
                <table ref={tableRef} className={styles.rows}>
                  <thead><tr><th scope="col">id</th><th scope="col">name</th><th scope="col">email</th><th scope="col">age</th><th scope="col">city</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} data-id={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.email}</td><td>{r.age ?? '—'}</td><td>{r.city || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card title={live ? 'Recorded steps' : 'What gets traced'} icon={Waypoints}>
          {live ? (
            <>
              <FlowPipeline steps={liveSteps} label="Recorded steps" compact />
              <p className={styles.muted}>
                {result?.saved === 'saved' ? <>Saved. <Link className={styles.link} to={`/trace?id=${result.snapshot.traceId}`}>Open in the explorer</Link></>
                  : result ? (result.saved === 'saving' ? 'Saving trace…' : `Trace ${result.saved}`) : 'Recording…'}
              </p>
            </>
          ) : (
            <>
              <ol className={styles.planned}>
                {PLANNED.map(([layer, text], i) => (
                  <li key={i} style={{ '--layer': `var(--layer-${layer})` }}><span className={styles.layerChip}>{LAYER_NAMES[layer]}</span>{text}</li>
                ))}
              </ol>
              <p className={styles.muted}>Every step is measured while it happens; the server’s steps come back in the response (meta.trace).</p>
            </>
          )}
        </Card>
      </div>

      {result ? (
        <Card title="Execution trace">
          <TraceViewer trace={result.snapshot} />
        </Card>
      ) : (
        <Card><EmptyState icon={Waypoints} title="Submit the form to record a trace" /></Card>
      )}
    </div>
  );
}
