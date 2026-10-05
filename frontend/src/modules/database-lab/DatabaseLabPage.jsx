import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, History, Pencil, Plus, RotateCcw, Search, Table2, Trash2 } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { useToast } from '../../app/providers/ToastProvider.jsx';
import { SqlEntry, illustrate } from './SqlPanel.jsx';
import styles from './DatabaseLab.module.css';

const OPS = [
  { id: 'SELECT', icon: Search, hint: 'Read rows that match conditions.' },
  { id: 'INSERT', icon: Plus, hint: 'Add a new row.' },
  { id: 'UPDATE', icon: Pencil, hint: 'Change the selected row.' },
  { id: 'DELETE', icon: Trash2, hint: 'Remove the selected row.' },
];
const EMPTY_ROW = { name: '', email: '', age: '', city: '' };
const EMPTY_FILTERS = { search: '', city: '', minAge: '', sort: 'created', dir: 'asc' };
const MAX_HISTORY = 20;

function query(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (String(v).trim() !== '') params.set(k, String(v).trim()); });
  return params.toString();
}

function RowFields({ values, onChange, errors }) {
  return (
    <div className={styles.fields}>
      {[['name', 'Name', 'text'], ['email', 'Email', 'email'], ['age', 'Age', 'number'], ['city', 'City', 'text']].map(([name, label, type]) => (
        <label key={name} className={styles.field}>
          <span className={styles.label}>{label}{name === 'name' || name === 'email' ? ' *' : ''}</span>
          <input className={styles.input} type={type} value={values[name] ?? ''} onChange={(e) => onChange({ ...values, [name]: e.target.value })}
            aria-invalid={errors?.[name] ? 'true' : undefined} />
          {errors?.[name] && <span className={styles.fieldError}>{errors[name]}</span>}
        </label>
      ))}
    </div>
  );
}

export default function DatabaseLabPage() {
  const toast = useToast();
  const [op, setOp] = useState('SELECT');
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [form, setForm] = useState(EMPTY_ROW);
  const [selectedId, setSelectedId] = useState(null);
  const [current, setCurrent] = useState([]); // SQL of the last operation
  const [history, setHistory] = useState([]);
  const [changedId, setChangedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState(null);

  const selected = rows?.find((r) => r.id === selectedId) ?? null;

  const record = (sql) => {
    const stamped = sql.map((s) => ({ ...s, at: new Date().toLocaleTimeString([], { hour12: false }) }));
    setCurrent(stamped);
    setHistory((h) => [...stamped.slice().reverse(), ...h].slice(0, MAX_HISTORY));
  };

  /** Refresh the table quietly (its SELECT is not shown as the user's operation). */
  const refreshRows = useCallback(async () => {
    try {
      const { data } = await apiRequest(`/lab/db/contacts?${query(filters)}`, { source: 'database-lab' });
      setRows(data.rows);
    } catch (err) {
      setLoadError(err);
    }
  }, [filters]);

  async function run(fn) {
    setBusy(true);
    setErrors(null);
    try {
      return await fn();
    } catch (err) {
      setErrors(err.fields && Object.keys(err.fields).length ? err.fields : null);
      toast.error(err.message);
      if (err.meta?.sql) record(err.meta.sql);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const select = () => run(async () => {
    const { data, meta } = await apiRequest(`/lab/db/contacts?${query(filters)}`, { source: 'database-lab' });
    setRows(data.rows);
    setLoadError(null);
    record(meta.sql);
  });

  useEffect(() => {
    select();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing operation pre-fills the form from the selected row where it makes sense.
  useEffect(() => {
    setErrors(null);
    if (op === 'UPDATE' && selected) setForm({ name: selected.name, email: selected.email, age: selected.age ?? '', city: selected.city ?? '' });
    if (op === 'INSERT') setForm(EMPTY_ROW);
  }, [op, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (e) => {
    e.preventDefault();
    run(async () => {
      const { data, meta } = await apiRequest('/lab/db/contacts', { method: 'POST', body: form, source: 'database-lab' });
      record(meta.sql);
      setChangedId(data.id);
      setForm(EMPTY_ROW);
      await refreshRows();
    });
  };

  const update = (e) => {
    e.preventDefault();
    run(async () => {
      const { data, meta } = await apiRequest(`/lab/db/contacts/${selected.id}`, { method: 'PUT', body: form, source: 'database-lab' });
      record(meta.sql);
      setChangedId(data.id);
      await refreshRows();
    });
  };

  const remove = () => run(async () => {
    const { meta } = await apiRequest(`/lab/db/contacts/${selected.id}`, { method: 'DELETE', source: 'database-lab' });
    record(meta.sql);
    setSelectedId(null);
    await refreshRows();
  });

  const reset = () => run(async () => {
    const { meta } = await apiRequest('/lab/db/reset', { method: 'POST', source: 'database-lab' });
    record(meta.sql);
    setSelectedId(null);
    setFilters(EMPTY_FILTERS);
    const { data } = await apiRequest('/lab/db/contacts', { source: 'database-lab' });
    setRows(data.rows);
  });

  const cities = useMemo(() => [...new Set((rows ?? []).map((r) => r.city).filter(Boolean))].sort(), [rows]);
  const primary = current[current.length - 1];

  return (
    <div className={styles.page}>
      <LabHeader
        icon={Database}
        layer="database"
        title="Database Lab"
        description="Run INSERT, SELECT, UPDATE and DELETE against your own table in MySQL. Every operation is a prepared statement: the SQL and the values travel separately."
        concepts={['SELECT … WHERE', 'INSERT', 'UPDATE', 'DELETE', 'prepared statements', 'bound parameters', 'LIKE', 'ORDER BY', 'SQL injection']}
        actions={<Button icon={RotateCcw} onClick={reset} disabled={busy}>Reset sample data</Button>}
      />

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card title="Operation">
            <div className={styles.ops} role="tablist" aria-label="SQL operation">
              {OPS.map(({ id, icon: Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={op === id} className={`${styles.opTab} ${styles[`op-${id}`]}`} onClick={() => setOp(id)}>
                  <Icon size={14} aria-hidden="true" /> {id}
                </button>
              ))}
            </div>
            <p className={styles.hint}>{OPS.find((o) => o.id === op).hint}</p>

            {op === 'SELECT' && (
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); select(); }} noValidate>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>Name or email contains</span>
                    <input className={styles.input} value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="e.g. rao" />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>City</span>
                    <select className={styles.input} value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}>
                      <option value="">Any</option>
                      {cities.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Minimum age</span>
                    <input className={styles.input} type="number" min={1} max={120} value={filters.minAge} onChange={(e) => setFilters((f) => ({ ...f, minAge: e.target.value }))} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Order by</span>
                    <span className={styles.sortRow}>
                      <select className={styles.input} value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} aria-label="Sort column">
                        <option value="created">created</option><option value="name">name</option><option value="age">age</option><option value="city">city</option>
                      </select>
                      <select className={styles.input} value={filters.dir} onChange={(e) => setFilters((f) => ({ ...f, dir: e.target.value }))} aria-label="Sort direction">
                        <option value="asc">ASC</option><option value="desc">DESC</option>
                      </select>
                    </span>
                  </label>
                </div>
                <Button type="submit" variant="primary" icon={Search} loading={busy}>Run SELECT</Button>
                <p className={styles.note}>Column names cannot be bound like values, so ORDER BY only accepts columns from a fixed whitelist.</p>
              </form>
            )}

            {op === 'INSERT' && (
              <form className={styles.form} onSubmit={insert} noValidate>
                <RowFields values={form} onChange={setForm} errors={errors} />
                <Button type="submit" variant="primary" icon={Plus} loading={busy}>Run INSERT</Button>
              </form>
            )}

            {op === 'UPDATE' && (
              selected ? (
                <form className={styles.form} onSubmit={update} noValidate>
                  <p className={styles.hint}>Editing row <strong>#{selected.id}</strong>.</p>
                  <RowFields values={form} onChange={setForm} errors={errors} />
                  <Button type="submit" variant="primary" icon={Pencil} loading={busy}>Run UPDATE</Button>
                </form>
              ) : <EmptyState title="Select a row">Click a row in the table to update it.</EmptyState>
            )}

            {op === 'DELETE' && (
              selected ? (
                <div className={styles.form}>
                  <p className={styles.hint}>Delete <strong>{selected.name}</strong> (row #{selected.id})? This cannot be undone, but “Reset sample data” restores the samples.</p>
                  <Button variant="danger" icon={Trash2} onClick={remove} loading={busy}>Run DELETE</Button>
                </div>
              ) : <EmptyState title="Select a row">Click a row in the table to delete it.</EmptyState>
            )}
          </Card>

          <Card title="SQL executed" icon={Database}>
            {current.length === 0 ? <EmptyState title="No SQL yet">The prepared statement for your next operation will appear here.</EmptyState> : (
              <>
                {current.map((entry, i) => <SqlEntry key={i} entry={entry} highlight={entry === primary} />)}
                {primary && primary.params.length > 0 && (
                  <details className={styles.illustration}>
                    <summary>Show the statement with its values (for reading only)</summary>
                    <pre className={styles.sqlPlain}>{illustrate(primary.statement, primary.params)}</pre>
                    <p className={styles.note}>
                      PDO never builds this string. It sends the statement and the values separately, so a value like
                      {' '}<code>&apos; OR 1=1 --</code> is only ever data, never SQL.
                    </p>
                  </details>
                )}
              </>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <Card title="lab_contacts" icon={Table2} actions={rows && <span className={styles.count}>{rows.length} row{rows.length === 1 ? '' : 's'}</span>}>
            {loadError ? <ErrorState title="Could not load the table" error={loadError} onRetry={select} />
              : rows === null ? <LoadingState label="Querying MySQL…" />
                : rows.length === 0 ? (
                  <EmptyState icon={Table2} title="No rows">
                    {query({ ...filters, sort: '', dir: '' }) ? 'No rows match these conditions.' : 'Your table is empty. Insert a row or reset the sample data.'}
                  </EmptyState>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} aria-label="lab_contacts rows">
                      <thead>
                        <tr><th scope="col">id</th><th scope="col">name</th><th scope="col">email</th><th scope="col">age</th><th scope="col">city</th></tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className={`${r.id === selectedId ? styles.selected : ''} ${r.id === changedId ? styles.changed : ''}`}
                            onClick={() => setSelectedId(r.id)}>
                            <td>
                              <label className={styles.rowPick}>
                                <input type="radio" name="row" checked={r.id === selectedId} onChange={() => setSelectedId(r.id)} aria-label={`Select ${r.name}`} />
                                {r.id}
                              </label>
                            </td>
                            <td>{r.name}</td>
                            <td>{r.email}</td>
                            <td>{r.age ?? <em className={styles.null}>NULL</em>}</td>
                            <td>{r.city ?? <em className={styles.null}>NULL</em>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </Card>

          <Card title="Statement history" icon={History}>
            {history.length === 0 ? <p className={styles.note}>Statements you run are listed here, newest first.</p> : (
              <ol className={styles.history}>
                {history.map((h, i) => (
                  <li key={i}>
                    <span className={`${styles.op} ${styles[`op-${h.operation}`]}`}>{h.operation}</span>
                    <code className={styles.historySql}>{h.statement.replace(/\s+/g, ' ')}</code>
                    <span className={styles.entryMeta}>{h.at} · {h.rowsAffected} row(s)</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
