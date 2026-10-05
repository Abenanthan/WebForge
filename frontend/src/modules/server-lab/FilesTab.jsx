import { useCallback, useEffect, useState } from 'react';
import { BookOpen, FilePlus, FileText, FolderOpen, PenLine, Plus, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { apiRequest } from '../../services/apiClient.js';
import { formatBytes } from '../ajax-monitor/RequestDetails.jsx';
import styles from './ServerLab.module.css';

const FLOW = [
  { id: 'create', label: 'Create', layer: 'server' },
  { id: 'write', label: 'Write', layer: 'server' },
  { id: 'read', label: 'Read', layer: 'server' },
  { id: 'display', label: 'Display', layer: 'render' },
];
const NAME_PATTERN = /^[A-Za-z0-9_-]{1,40}\.txt$/;

export default function FilesTab() {
  const [files, setFiles] = useState(null);
  const [listError, setListError] = useState(null);
  const [selected, setSelected] = useState(null); // { file, content, lines }
  const [newName, setNewName] = useState('notes.txt');
  const [newContent, setNewContent] = useState('My first line\n');
  const [draft, setDraft] = useState('');
  const [log, setLog] = useState([]);
  const [lastOp, setLastOp] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiRequest('/lab/files', { source: 'server-lab' });
      setFiles(data.files);
      setListError(null);
    } catch (err) {
      setListError(err);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function op(name, path, method, body) {
    setBusy(name);
    setError(null);
    try {
      const { data } = await apiRequest(path, { method, body, source: 'server-lab' });
      setLog(data.log ?? []);
      setLastOp(name);
      return data;
    } catch (err) {
      setError(err);
      setLastOp(name);
      setLog([]);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function open(name) {
    const data = await op('read', `/lab/files/${encodeURIComponent(name)}`, 'GET');
    if (data) {
      setSelected({ file: data.file, content: data.content, lines: data.lines });
      setDraft('');
      setDone((d) => new Set([...d, 'read', 'display']));
    }
  }

  async function create(e) {
    e.preventDefault();
    const data = await op('create', '/lab/files', 'POST', { name: newName.trim(), content: newContent });
    if (data) {
      setDone(new Set(['create', ...(newContent ? ['write'] : [])]));
      await refresh();
      await open(data.file.name);
      setDone(new Set(['create', 'write', 'read', 'display']));
    }
  }

  async function write(mode) {
    const name = selected.file.name;
    const path = mode === 'append' ? `/lab/files/${encodeURIComponent(name)}/append` : `/lab/files/${encodeURIComponent(name)}`;
    const data = await op(mode, path, mode === 'append' ? 'POST' : 'PUT', { content: draft });
    if (data) {
      setDone((d) => new Set([...d, 'write']));
      await refresh();
      const writeLog = data.log;
      await open(name);
      setLog((readLog) => [...writeLog, ...readLog]);
    }
  }

  async function remove() {
    const name = selected.file.name;
    if (await op('delete', `/lab/files/${encodeURIComponent(name)}`, 'DELETE')) {
      setSelected(null);
      setDone(new Set());
      refresh();
    }
  }

  const nameError = newName && !NAME_PATTERN.test(newName.trim()) ? 'Use letters, digits, - or _, ending in .txt' : null;
  const steps = FLOW.map((s) => ({
    ...s,
    status: busy && ((busy === 'create' && s.id === 'create') || ((busy === 'write' || busy === 'append') && s.id === 'write') || (busy === 'read' && s.id === 'read'))
      ? 'active' : done.has(s.id) ? 'done' : 'idle',
  }));

  return (
    <div className={styles.twoColumns}>
      <div className={styles.column}>
        <Card title="Your sandbox folder" icon={FolderOpen}>
          <p className={styles.description}>
            PHP stores these files in <code>storage/sandbox/&lt;your user id&gt;/</code>, outside the public web folder. Names are checked and every
            path is confined with <code>realpath()</code>.
          </p>
          {listError ? <ErrorState title="Could not list files" error={listError} onRetry={refresh} />
            : files === null ? <LoadingState label="Listing files…" />
              : files.length === 0 ? <EmptyState icon={FileText} title="No files yet">Create one below.</EmptyState> : (
                <table className={styles.stepsTable}>
                  <thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">Modified</th></tr></thead>
                  <tbody>
                    {files.map((f) => (
                      <tr key={f.name} className={selected?.file.name === f.name ? styles.rowSelected : undefined}>
                        <td><button type="button" className={styles.linkButton} onClick={() => open(f.name)}>{f.name}</button></td>
                        <td>{formatBytes(f.size)}</td>
                        <td>{f.modified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </Card>

        <Card title="Create a file" icon={FilePlus}>
          <form className={styles.inputForm} onSubmit={create} noValidate>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>File name</span>
              <input className={styles.input} value={newName} onChange={(e) => setNewName(e.target.value)} aria-invalid={nameError ? 'true' : undefined} />
              {nameError && <span className={styles.fieldError}>{nameError}</span>}
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span className={styles.fieldLabel}>Initial content</span>
              <textarea className={styles.textarea} rows={3} value={newContent} onChange={(e) => setNewContent(e.target.value)} />
            </label>
            <div className={styles.formActions}>
              <Button type="submit" variant="primary" icon={Plus} loading={busy === 'create'} disabled={Boolean(nameError) || !newName.trim()}>
                fopen(&quot;{newName.trim() || '…'}&quot;, &quot;x&quot;)
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className={styles.column}>
        <Card title="File operation flow">
          <FlowPipeline steps={steps} orientation="horizontal" label="File operations" />
        </Card>

        <Card title={selected ? selected.file.name : 'File contents'} icon={BookOpen}
          actions={selected && <Button size="sm" variant="danger" icon={Trash2} onClick={remove} loading={busy === 'delete'}>unlink()</Button>}>
          {!selected ? <EmptyState icon={BookOpen} title="No file open">Create a file or pick one from your folder.</EmptyState> : (
            <>
              <pre className={styles.fileContent} aria-label="File contents">{selected.content || '(empty file)'}</pre>
              <p className={styles.metaLine}>
                <span>{formatBytes(selected.file.size)}</span>
                <span>{selected.lines} line{selected.lines === 1 ? '' : 's'}</span>
                <span>modified {selected.file.modified}</span>
                <span>md5 {selected.file.md5.slice(0, 10)}…</span>
                <span>{selected.file.readable ? 'readable' : 'not readable'} · {selected.file.writable ? 'writable' : 'read-only'}</span>
              </p>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Text to write</span>
                <textarea className={styles.textarea} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type, then overwrite or append…" />
              </label>
              <div className={styles.formActions}>
                <Button icon={PenLine} onClick={() => write('write')} loading={busy === 'write'}>Overwrite: fopen(…, &quot;w&quot;)</Button>
                <Button icon={Plus} onClick={() => write('append')} loading={busy === 'append'}>Append: fopen(…, &quot;a&quot;)</Button>
              </div>
            </>
          )}
        </Card>

        <Card title={`What PHP did${lastOp ? ` (${lastOp})` : ''}`}>
          {error && <p className={styles.errorBox} role="alert">{error.status ? `HTTP ${error.status}: ` : ''}{error.message}</p>}
          {log.length === 0 && !error ? <p className={styles.note}>Each operation lists the PHP filesystem calls it made.</p> : (
            <ol className={styles.serverLog}>
              {log.map((l, i) => (
                <li key={i}>
                  <span className={styles.logStep}>{l.op}</span>
                  <code>{l.php}</code>
                  <span className={styles.logResult}>→ {l.result}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
