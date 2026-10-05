import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Send, Wand2 } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { formatMs } from '../../utils/format.js';
import styles from './ServerLab.module.css';

const EMPTY = { name: '', email: '', age: '', message: '', newsletter: false };
const PRESETS = {
  normal: { name: '  Asha Rao ', email: 'asha@example.com', age: '20', message: 'Loved the web lab!', newsletter: true },
  xss: { name: '<b>Mallory</b>', email: 'mallory@example.com', age: '25', message: '<script>alert("stolen cookies")</script>', newsletter: false },
  invalid: { name: '', email: 'not-an-email', age: '250', message: 'Hi', newsletter: false },
};

const STAGES = [
  { id: 'receive', label: 'Receive $_POST', layer: 'network', trace: 'Read submitted fields' },
  { id: 'trim', label: 'trim()', layer: 'server', trace: 'Normalise: trim() every text field' },
  { id: 'validate', label: 'Validate', layer: 'validation', trace: 'Validate with filter_var() and length checks' },
  { id: 'escape', label: 'Escape output', layer: 'server', trace: 'Escape for HTML output: htmlspecialchars()' },
  { id: 'respond', label: 'Respond', layer: 'render', trace: null },
];

const show = (v) => (typeof v === 'boolean' ? String(v) : JSON.stringify(v));

export default function FormTab() {
  const [values, setValues] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle', processing: null, trace: [], error: null, code: null });

  async function submit(e) {
    e.preventDefault();
    setState((s) => ({ ...s, status: 'running' }));
    let meta;
    let error = null;
    try {
      ({ meta } = await apiRequest('/lab/server/form', { method: 'POST', body: values, source: 'server-lab' }));
    } catch (err) {
      error = err;
      meta = err.meta;
    }
    if (!meta?.processing) {
      setState({ status: 'failed', processing: null, trace: [], error, code: error?.status });
      return;
    }
    setState({ status: error ? 'rejected' : 'accepted', processing: meta.processing, trace: meta.trace, error, code: meta.status });
  }

  const p = state.processing;
  const failedValidation = state.status === 'rejected';
  const steps = STAGES.map((stage) => {
    const t = state.trace.find((x) => x.name === stage.trace);
    let status = 'idle';
    if (state.status === 'running') status = stage.id === 'receive' ? 'active' : 'idle';
    else if (p) status = stage.id === 'validate' && failedValidation ? 'error' : 'done';
    return {
      ...stage,
      status,
      time: t ? formatMs(t.durationMs) : null,
      summary: !p ? null : {
        receive: `${Object.keys(p.received).length} fields`,
        trim: 'whitespace removed',
        validate: failedValidation ? `${Object.keys(p.errors).length} error(s)` : 'all checks passed',
        escape: '< > & " \' → entities',
        respond: `HTTP ${state.code}`,
      }[stage.id],
    };
  });

  return (
    <div className={styles.twoColumns}>
      <Card title="HTML form" icon={Send}>
        <div className={styles.presets}>
          <span>Fill with:</span>
          <Button size="sm" variant="ghost" icon={Wand2} onClick={() => setValues(PRESETS.normal)}>Normal input</Button>
          <Button size="sm" variant="ghost" icon={Wand2} onClick={() => setValues(PRESETS.xss)}>XSS attempt</Button>
          <Button size="sm" variant="ghost" icon={Wand2} onClick={() => setValues(PRESETS.invalid)}>Invalid data</Button>
        </div>
        <form className={styles.inputForm} onSubmit={submit} noValidate>
          {[['name', 'Name', 'text'], ['email', 'Email', 'text'], ['age', 'Age', 'text']].map(([name, label, type]) => (
            <label key={name} className={styles.field}>
              <span className={styles.fieldLabel}>{label} <code>$_POST[&quot;{name}&quot;]</code></span>
              <input className={styles.input} type={type} value={values[name]} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                aria-invalid={p?.errors?.[name] ? 'true' : undefined} />
              {p?.errors?.[name] && <span className={styles.fieldError}>{p.errors[name]}</span>}
            </label>
          ))}
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Message <code>$_POST[&quot;message&quot;]</code></span>
            <textarea className={styles.textarea} rows={3} value={values.message} onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))} />
          </label>
          <label className={styles.checkLine}>
            <input type="checkbox" checked={values.newsletter} onChange={(e) => setValues((v) => ({ ...v, newsletter: e.target.checked }))} />
            Subscribe to the newsletter
          </label>
          <div className={styles.formActions}>
            <Button type="submit" variant="primary" icon={Send} loading={state.status === 'running'}>Submit to PHP</Button>
          </div>
        </form>
        <p className={styles.note}>Client-side validation is deliberately off here, so you can see exactly what PHP does with any input.</p>
      </Card>

      <div className={styles.column}>
        <Card title="Server processing">
          <FlowPipeline steps={steps} orientation="horizontal" label="Form processing stages" />
          {state.status === 'failed' && <p className={styles.errorText} role="alert">{state.error?.message}</p>}
          {!p ? (
            <EmptyState title="Submit the form">See each value as PHP receives, trims, validates and escapes it.</EmptyState>
          ) : (
            <table className={styles.stepsTable}>
              <thead>
                <tr><th scope="col">Field</th><th scope="col">Received</th><th scope="col">After trim()</th><th scope="col">htmlspecialchars()</th></tr>
              </thead>
              <tbody>
                {Object.keys(p.received).map((f) => (
                  <tr key={f} className={p.errors[f] ? styles.rowError : undefined}>
                    <th scope="row"><code>{f}</code></th>
                    <td><code className={styles.value}>{show(p.received[f])}</code></td>
                    <td><code className={styles.value}>{show(p.trimmed[f])}</code></td>
                    <td><code className={styles.value}>{p.escaped[f] !== undefined ? show(p.escaped[f]) : <em>not printed</em>}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p && (
            <ul className={styles.phpList} aria-label="PHP functions used">
              {p.php.map((line) => <li key={line}><code>{line}</code></li>)}
            </ul>
          )}
        </Card>

        {p && (
          <Card title="The HTML PHP sends back">
            <div className={styles.responseCompare}>
              <section aria-label="Escaped response">
                <h3 className={styles.compareTitle}><ShieldCheck size={15} aria-hidden="true" /> With htmlspecialchars()</h3>
                <pre className={styles.code}>{p.safeHtml}</pre>
                <p className={styles.note}>Rendered by the browser (tags show as text):</p>
                {/* sandbox="" : no scripts can run even in theory */}
                <iframe title="Escaped response rendered" sandbox="" srcDoc={`<body style="font-family:system-ui;margin:12px">${p.safeHtml}</body>`} className={styles.renderFrame} />
              </section>
              <section aria-label="Unescaped response">
                <h3 className={`${styles.compareTitle} ${styles.danger}`}><ShieldAlert size={15} aria-hidden="true" /> Without escaping</h3>
                <pre className={`${styles.code} ${styles.codeDanger}`}>{p.unsafeHtml}</pre>
                <p className={styles.note}>
                  Shown as code only, never rendered. A browser would execute any <code>&lt;script&gt;</code> here in your site&apos;s
                  context: that is a cross-site scripting (XSS) attack.
                </p>
              </section>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
