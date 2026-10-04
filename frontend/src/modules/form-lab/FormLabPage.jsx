import { useMemo, useRef, useState } from 'react';
import { Check, ClipboardCheck, Minus, Monitor, Send, Server, ShieldCheck, Wand2, X } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { recordExperimentRun } from '../../services/activity.js';
import { formatMs } from '../../utils/format.js';
import { EMPTY_VALUES, FIELDS, PRESETS, firstError, validateClient } from './formRules.js';
import styles from './FormLab.module.css';

const STEPS = [
  { id: 'submit', label: 'User submits', layer: 'ui' },
  { id: 'client', label: 'Client validation', layer: 'validation' },
  { id: 'request', label: 'Async request', layer: 'network' },
  { id: 'server', label: 'Server validation', layer: 'server' },
  { id: 'database', label: 'Database check', layer: 'database' },
  { id: 'response', label: 'Server response', layer: 'network' },
  { id: 'ui', label: 'UI updated', layer: 'render' },
];

const SECRET_FIELDS = new Set(['password', 'confirm']);
const mask = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, SECRET_FIELDS.has(k) && v ? '•'.repeat(8) : v]));

function RuleChip({ rule, side }) {
  const Icon = rule.skipped ? Minus : rule.passed ? Check : X;
  const state = rule.skipped ? 'skipped' : rule.passed ? 'pass' : 'fail';
  return (
    <li className={`${styles.rule} ${styles[state]}`} title={rule.html ? `HTML: ${rule.html}` : side === 'server' ? rule.rule : 'Custom JavaScript rule'}>
      <Icon size={12} aria-hidden="true" />
      <span>{rule.label}</span>
      <span className="sr-only">({state})</span>
    </li>
  );
}

/** Human-readable label for a server rule key such as "between:13,120". */
function serverRuleLabel(rule) {
  const [name, arg] = rule.split(/:(.*)/s);
  return {
    required: 'required', string: 'is text', email: 'email format', int: 'whole number', name: 'allowed characters',
    password: 'password policy', same: 'matches password', not_reserved: 'not reserved', unique: 'not registered (DB)',
  }[name] ?? (arg ? `${name} ${arg}` : name);
}

export default function FormLabPage() {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [touched, setTouched] = useState({});
  const [clientEnabled, setClientEnabled] = useState(true);
  const [run, setRun] = useState(null); // the last submission, step by step
  const [selected, setSelected] = useState('client');
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef({});

  const liveClient = useMemo(() => validateClient(values), [values]);

  function update(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    setTouched((t) => ({ ...t, [name]: true }));
  }

  function applyPreset(preset) {
    setValues(PRESETS[preset]);
    setTouched(Object.fromEntries(FIELDS.map((f) => [f.name, true])));
  }

  async function submit(e) {
    e.preventDefault();
    const t0 = performance.now();
    const record = { startedAt: new Date().toLocaleTimeString([], { hour12: false }), clientEnabled, steps: {} };
    record.steps.submit = { status: 'done', summary: `${FIELDS.length} fields submitted`, time: '0 ms' };

    // 1. Client-side validation (in this browser, before any network traffic)
    let clientResults = null;
    if (clientEnabled) {
      const c0 = performance.now();
      clientResults = validateClient(values);
      const failed = FIELDS.filter((f) => firstError(clientResults[f.name]));
      // The browser's own Constraint Validation API, for comparison
      const native = Object.fromEntries(FIELDS.map((f) => [f.name, inputRefs.current[f.name]?.validationMessage || '']));
      record.client = { results: clientResults, failed: failed.map((f) => f.name), native, ms: performance.now() - c0 };
      record.steps.client = {
        status: failed.length ? 'error' : 'done',
        summary: failed.length ? `${failed.length} field(s) invalid: request blocked` : 'all rules passed',
        time: formatMs(performance.now() - t0),
      };
      setTouched(Object.fromEntries(FIELDS.map((f) => [f.name, true])));
      if (failed.length) {
        ['request', 'server', 'database', 'response'].forEach((id) => {
          record.steps[id] = { status: 'skipped', summary: 'not sent: the browser stopped it' };
        });
        record.steps.ui = { status: 'done', summary: 'errors shown next to fields', time: formatMs(performance.now() - t0) };
        setRun(record);
        setSelected('client');
        inputRefs.current[failed[0].name]?.focus();
        recordExperimentRun('form-validation', 'error', { stage: 'client', fields: record.client.failed });
        return;
      }
    } else {
      record.steps.client = { status: 'skipped', summary: 'disabled: data goes straight to the server' };
    }

    // 2. Real asynchronous request to the PHP backend
    setBusy(true);
    record.steps.request = { status: 'active', summary: 'POST /api/lab/forms/validate' };
    setRun({ ...record });
    setSelected('request');
    const r0 = performance.now();
    let envelope;
    let status;
    let error = null;
    try {
      envelope = await apiRequest('/lab/forms/validate', { method: 'POST', body: values, source: 'form-lab' });
      status = 200;
    } catch (err) {
      error = err;
      status = err.status;
      envelope = { data: null, meta: err.meta };
    }
    setBusy(false);
    const roundTrip = performance.now() - r0;

    if (!envelope.meta) {
      record.steps.request = { status: 'error', summary: error?.message ?? 'Request failed', time: formatMs(roundTrip) };
      ['server', 'database', 'response'].forEach((id) => { record.steps[id] = { status: 'skipped', summary: 'no response' }; });
      record.steps.ui = { status: 'error', summary: 'network error shown' };
      record.networkError = error?.message;
      setRun(record);
      return;
    }

    const meta = envelope.meta;
    const trace = meta.trace ?? [];
    const validationSteps = trace.filter((s) => s.layer === 'validation');
    const dbSteps = trace.filter((s) => s.layer === 'database');
    const report = meta.validation ?? {};
    const serverFailed = Object.keys(error?.fields ?? {});

    record.request = { method: 'POST', url: '/api/lab/forms/validate', payload: mask(values), traceId: meta.traceId, roundTrip, status };
    record.server = { report, steps: validationSteps, durationMs: meta.durationMs, failed: serverFailed, fields: error?.fields ?? {} };
    record.database = dbSteps;
    record.response = { status, body: error ? { ok: false, error: { code: error.code, message: error.message, fields: error.fields } } : { ok: true, data: envelope.data } };

    record.steps.request = { status: 'done', summary: `POST · ${status}`, time: formatMs(r0 - t0) };
    record.steps.server = {
      status: serverFailed.length ? 'error' : 'done',
      summary: `${validationSteps.length} validation steps · ${serverFailed.length ? `${serverFailed.length} field(s) rejected` : 'accepted'}`,
      time: formatMs(meta.durationMs),
    };
    record.steps.database = dbSteps.length
      ? { status: dbSteps.some((s) => s.status === 'error') ? 'error' : 'done', summary: `${dbSteps.length} prepared statement(s)`, time: formatMs(dbSteps.reduce((a, s) => a + s.durationMs, 0)) }
      : { status: 'skipped', summary: 'not needed (email format invalid)' };
    record.steps.response = { status: error ? 'error' : 'done', summary: `HTTP ${status} ${error ? error.code : 'OK'}`, time: formatMs(roundTrip) };
    record.steps.ui = { status: 'done', summary: serverFailed.length ? 'server errors shown on fields' : 'success message shown', time: formatMs(performance.now() - t0) };
    setRun(record);
    setSelected(serverFailed.length ? 'server' : 'response');
    if (serverFailed.length) inputRefs.current[serverFailed[0]]?.focus();
    recordExperimentRun('form-validation', serverFailed.length ? 'error' : 'success', { stage: 'server', clientEnabled });
  }

  const steps = STEPS.map((s) => ({ ...s, status: 'idle', ...(run?.steps[s.id] ?? {}) }));
  const serverFieldError = (name) => run?.server?.fields?.[name];

  return (
    <div className={styles.page}>
      <LabHeader
        icon={ClipboardCheck}
        layer="validation"
        title="Form Validation Lab"
        description="Validation happens in two places. The browser gives instant feedback; the PHP server is the authority, because anything in the browser can be bypassed."
        concepts={['required', 'type="email"', 'pattern', 'min / max', 'custom rules', 'preventDefault', '422 Unprocessable', 'server-side validation']}
      />

      <div className={styles.grid}>
        <Card title="Sign-up form" icon={ClipboardCheck}>
          <div className={styles.toolbar}>
            <label className={styles.switch}>
              <input type="checkbox" checked={clientEnabled} onChange={(e) => setClientEnabled(e.target.checked)} />
              <span className={styles.switchTrack} aria-hidden="true" />
              Client-side validation
            </label>
            <span className={styles.serverAlways}><ShieldCheck size={14} aria-hidden="true" /> Server validation always runs</span>
          </div>
          <div className={styles.presets}>
            <span>Fill with:</span>
            <Button size="sm" variant="ghost" icon={Wand2} onClick={() => applyPreset('valid')}>Valid data</Button>
            <Button size="sm" variant="ghost" icon={Wand2} onClick={() => applyPreset('invalid')}>Invalid data</Button>
            <Button size="sm" variant="ghost" icon={Wand2} onClick={() => applyPreset('serverOnly')}>Passes client, fails server</Button>
          </div>

          <form className={styles.form} onSubmit={submit} noValidate>
            {FIELDS.map((field) => {
              const client = liveClient[field.name];
              const clientErr = clientEnabled && touched[field.name] ? firstError(client) : null;
              const serverErr = serverFieldError(field.name);
              const errorId = `${field.name}-error`;
              const valid = touched[field.name] && !clientErr && !serverErr && (clientEnabled || run?.server);
              return (
                <div key={field.name} className={styles.field}>
                  <label htmlFor={`f-${field.name}`} className={styles.label}>{field.label}</label>
                  <input
                    ref={(el) => { inputRefs.current[field.name] = el; }}
                    id={`f-${field.name}`}
                    name={field.name}
                    type={field.type}
                    inputMode={field.inputMode}
                    autoComplete={field.autoComplete}
                    value={values[field.name]}
                    onChange={(e) => update(field.name, e.target.value)}
                    className={`${styles.input} ${clientErr || serverErr ? styles.inputError : valid ? styles.inputValid : ''}`}
                    aria-invalid={clientErr || serverErr ? 'true' : undefined}
                    aria-describedby={clientErr || serverErr ? errorId : field.hint ? `${field.name}-hint` : undefined}
                    {...field.attrs}
                  />
                  {field.hint && !clientErr && !serverErr && <p id={`${field.name}-hint`} className={styles.hint}>{field.hint}</p>}
                  {clientErr && <p id={errorId} className={styles.error}><Monitor size={12} aria-hidden="true" /> {clientErr.label} <span className={styles.where}>(browser)</span></p>}
                  {!clientErr && serverErr && <p id={errorId} className={styles.error}><Server size={12} aria-hidden="true" /> {serverErr} <span className={styles.where}>(server)</span></p>}
                </div>
              );
            })}
            <Button type="submit" variant="primary" icon={Send} loading={busy} className={styles.submit}>Submit</Button>
            {run?.response?.status === 200 && (
              <p className={styles.success} role="status"><Check size={14} aria-hidden="true" /> {run.response.body.data.message}</p>
            )}
            {run?.networkError && <p className={styles.error} role="alert">{run.networkError}</p>}
          </form>
        </Card>

        <div className={styles.column}>
          <Card title="Where validation happens">
            <div className={styles.flow}>
              <FlowPipeline steps={steps} label="Form submission flow" selectedId={run ? selected : null} onSelect={run ? setSelected : undefined} compact />
              <section className={styles.details} aria-label="Step details">
                {!run ? (
                  <EmptyState title="Submit the form">Each stage of the submission will be recorded here, from the browser to PHP and MySQL and back.</EmptyState>
                ) : (
                  <StepDetails run={run} stepId={selected} />
                )}
              </section>
            </div>
          </Card>

          <Card title="Rule matrix: browser vs server">
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col"><Monitor size={13} aria-hidden="true" /> Client (JavaScript)</th>
                  <th scope="col"><Server size={13} aria-hidden="true" /> Server (PHP)</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((field) => (
                  <tr key={field.name}>
                    <th scope="row">{field.label}</th>
                    <td>
                      {clientEnabled ? (
                        <ul className={styles.rules}>
                          {(run?.client?.results ?? liveClient)[field.name].map((r) => <RuleChip key={r.id} rule={r} side="client" />)}
                        </ul>
                      ) : <span className={styles.muted}>disabled</span>}
                      {field.serverOnly && <p className={styles.serverOnlyNote}>Cannot check: {field.serverOnly.join(', ')}</p>}
                    </td>
                    <td>
                      {run?.server?.report?.[field.name] ? (
                        <ul className={styles.rules}>
                          {run.server.report[field.name].map((r, i) => (
                            <RuleChip key={`${r.rule}-${i}`} side="server" rule={{ ...r, label: serverRuleLabel(r.rule) }} />
                          ))}
                        </ul>
                      ) : <span className={styles.muted}>{run?.steps.client?.status === 'error' ? 'not reached' : 'awaiting submit'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StepDetails({ run, stepId }) {
  const step = run.steps[stepId] ?? { status: 'idle' };
  const title = STEPS.find((s) => s.id === stepId).label;
  const header = (
    <div className={styles.detailHead}>
      <h3 className={styles.detailTitle}>{title}</h3>
      <Badge tone={{ done: 'success', error: 'danger', skipped: 'neutral', active: 'accent' }[step.status] ?? 'neutral'}>{step.status}</Badge>
    </div>
  );

  let body;
  switch (stepId) {
    case 'submit':
      body = <p>The <code>submit</code> event fired; the handler called <code>event.preventDefault()</code> so the page does not reload, and took over with JavaScript.</p>;
      break;
    case 'client':
      body = !run.clientEnabled ? (
        <p>Client-side validation is switched off, just as an attacker could do with dev tools or a direct HTTP request. Everything goes to the server unchecked.</p>
      ) : (
        <>
          <p>{run.client.failed.length ? `${run.client.failed.length} field(s) failed in the browser, so no request was sent.` : 'Every client rule passed.'} Took {formatMs(run.client.ms)}, no network involved.</p>
          {run.client.failed.length > 0 && (
            <table className={styles.kv}>
              <thead><tr><th scope="col">Field</th><th scope="col">Our rule</th><th scope="col">Browser&apos;s built-in message</th></tr></thead>
              <tbody>
                {run.client.failed.map((name) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{firstError(run.client.results[name])?.label}</td>
                    <td>{run.client.native[name] || <em>(no native constraint)</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
      break;
    case 'request':
      body = run.request ? (
        <>
          <table className={styles.kv}>
            <tbody>
              <tr><th scope="row">Method</th><td>{run.request.method}</td></tr>
              <tr><th scope="row">URL</th><td>{run.request.url}</td></tr>
              <tr><th scope="row">Headers</th><td>Content-Type: application/json · X-CSRF-Token · X-Trace-Id: {run.request.traceId.slice(0, 8)}…</td></tr>
              <tr><th scope="row">Round trip</th><td>{formatMs(run.request.roundTrip)}</td></tr>
            </tbody>
          </table>
          <p className={styles.detailLabel}>Payload (passwords masked here; sent over the connection as typed)</p>
          <pre className={styles.code}>{JSON.stringify(run.request.payload, null, 2)}</pre>
        </>
      ) : <p>{step.summary}</p>;
      break;
    case 'server':
      body = run.server ? (
        <>
          <p>PHP re-validated every field in {formatMs(run.server.durationMs)} (total server time), without trusting the browser.</p>
          <ol className={styles.serverSteps}>
            {run.server.steps.map((s, i) => (
              <li key={i} className={s.status === 'error' ? styles.textDanger : undefined}>
                <code>{s.name}</code> <span className={styles.muted}>{formatMs(s.durationMs)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : <p>{step.summary}</p>;
      break;
    case 'database':
      body = run.database?.length ? (
        run.database.map((s, i) => (
          <div key={i}>
            <p>{s.name}: {formatMs(s.durationMs)}</p>
            <pre className={styles.code}>{s.detail.sql}{'\n'}-- params: {JSON.stringify(s.detail.params)}</pre>
          </div>
        ))
      ) : <p>{step.summary}. Uniqueness can only be checked against the database, so no browser rule can replace it.</p>;
      break;
    case 'response':
      body = run.response ? (
        <>
          <p>HTTP <strong>{run.response.status}</strong>{run.response.status === 422 ? ' Unprocessable Content: the data was understood but rejected.' : ' OK'}</p>
          <pre className={styles.code}>{JSON.stringify(run.response.body, null, 2)}</pre>
        </>
      ) : <p>{step.summary}</p>;
      break;
    default:
      body = <p>{step.summary}</p>;
  }
  return <>{header}{body}</>;
}
