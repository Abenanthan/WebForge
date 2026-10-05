import { useEffect, useState } from 'react';
import { Cookie, DoorOpen, KeyRound, Lock, LogIn, LogOut, Plus } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { LoadingState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { apiRequest } from '../../services/apiClient.js';
import styles from './ServerLab.module.css';

const FLOW = [
  { id: 'login', label: 'Login', layer: 'ui' },
  { id: 'created', label: 'Session created', layer: 'server' },
  { id: 'page', label: 'Authenticated page', layer: 'render' },
  { id: 'data', label: 'Session data', layer: 'state' },
  { id: 'logout', label: 'Logout', layer: 'ui' },
  { id: 'destroyed', label: 'Session destroyed', layer: 'server' },
];

export default function SessionsTab() {
  const [session, setSession] = useState(null);
  const [log, setLog] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [progress, setProgress] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [varKey, setVarKey] = useState('theme');
  const [varValue, setVarValue] = useState('dark');
  const [page, setPage] = useState(null);

  async function call(action, path, method = 'GET', body) {
    setBusy(action);
    setError(null);
    try {
      const { data } = await apiRequest(path, { method, body, source: 'server-lab' });
      if (data.session) setSession(data.session);
      setLog(data.log ?? []);
      setLastAction(action);
      return data;
    } catch (err) {
      setLog([]);
      setLastAction(action);
      setError(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    call('state', '/lab/session/state');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (...ids) => setProgress((p) => new Set([...p, ...ids]));

  async function login(e) {
    e.preventDefault();
    const data = await call('login', '/lab/session/login', 'POST', { password });
    setPassword('');
    if (data) {
      setProgress(new Set(['login', 'created']));
      setPage(null);
    }
  }

  async function openPage() {
    const data = await call('page', '/lab/session/protected');
    setPage(data ? { ok: true, text: data.page } : { ok: false });
    if (data) mark('page');
  }

  async function setData(e) {
    e.preventDefault();
    if (await call('data', '/lab/session/data', 'POST', { key: varKey.trim(), value: varValue })) mark('data');
  }

  async function logout() {
    if (await call('logout', '/lab/session/logout', 'POST')) {
      mark('logout', 'destroyed');
      setPage(null);
    }
  }

  const loggedIn = Boolean(session?.loggedIn);
  const steps = FLOW.map((s) => ({
    ...s,
    status: busy && ((busy === 'login' && s.id === 'login') || (busy === 'page' && s.id === 'page') || (busy === 'data' && s.id === 'data') || (busy === 'logout' && s.id === 'logout'))
      ? 'active'
      : progress.has(s.id) ? 'done' : 'idle',
  }));

  if (!session && !error) return <LoadingState label="Reading the lab session…" />;

  return (
    <div className={styles.twoColumns}>
      <div className={styles.column}>
        <Card title="Session lifecycle" icon={Cookie}>
          <p className={styles.description}>
            This lab uses its own session cookie, <code>{session?.cookie ?? 'WEBFORGE_LAB_SID'}</code>, separate from your WebForge login, so you can
            create and destroy it freely.
          </p>
          <FlowPipeline steps={steps} label="Session lifecycle" compact />
        </Card>

        <Card title="1 · Log in" icon={LogIn}>
          <form className={styles.inlineForm} onSubmit={login} noValidate>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Your WebForge password (checked with <code>password_verify()</code>)</span>
              <input className={styles.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <Button type="submit" variant="primary" icon={KeyRound} loading={busy === 'login'} disabled={!password}>Log in to the lab session</Button>
          </form>
        </Card>

        <Card title="2 · Visit a protected page" icon={Lock}>
          <p className={styles.description}>The page checks <code>$_SESSION</code> before rendering anything.</p>
          <Button icon={DoorOpen} onClick={openPage} loading={busy === 'page'}>Open the members-only page</Button>
          {page && (
            <p className={page.ok ? styles.successBox : styles.errorBox} role="status">
              {page.ok ? page.text : 'HTTP 401: no logged-in session, so PHP refused to render the page.'}
            </p>
          )}
        </Card>

        <Card title="3 · Store data in the session" icon={Plus}>
          <form className={styles.inlineForm} onSubmit={setData} noValidate>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Key</span>
              <input className={styles.input} value={varKey} onChange={(e) => setVarKey(e.target.value)} maxLength={20} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Value</span>
              <input className={styles.input} value={varValue} onChange={(e) => setVarValue(e.target.value)} maxLength={100} />
            </label>
            <Button type="submit" icon={Plus} loading={busy === 'data'} disabled={!loggedIn}>Save to $_SESSION</Button>
          </form>
          {!loggedIn && <p className={styles.note}>Log in first: data is only stored for an authenticated lab session.</p>}
        </Card>

        <Card title="4 · Log out" icon={LogOut}>
          <Button variant="danger" icon={LogOut} onClick={logout} loading={busy === 'logout'} disabled={!session?.active}>Log out and destroy the session</Button>
        </Card>
      </div>

      <div className={styles.column}>
        <Card title="Session state on the server" icon={Cookie} actions={loggedIn ? <Badge tone="success">logged in</Badge> : session?.active ? <Badge>anonymous</Badge> : <Badge>no session</Badge>}>
          {session?.active ? (
            <table className={styles.kv}>
              <tbody>
                <tr><th scope="row">Cookie</th><td><code>{session.cookie}</code> (HttpOnly: JavaScript cannot read it)</td></tr>
                <tr><th scope="row">Session id</th><td><code>{session.idPreview}</code> <span className={styles.note}>(shortened: the full id is a secret)</span></td></tr>
                <tr><th scope="row">User</th><td>{session.user ?? <em>not logged in</em>}</td></tr>
                <tr><th scope="row">Logged in at</th><td>{session.loginAt ?? '—'}</td></tr>
                <tr><th scope="row">Last request</th><td>{session.lastSeen ?? '—'}</td></tr>
                <tr><th scope="row">Requests in this session</th><td>{session.requests}</td></tr>
                <tr>
                  <th scope="row">$_SESSION data</th>
                  <td>
                    {Object.keys(session.vars).length === 0 ? <em>empty</em> : (
                      <ul className={styles.varList}>
                        {Object.entries(session.vars).map(([k, v]) => <li key={k}><code>{k}</code> = <code>{JSON.stringify(v)}</code></li>)}
                      </ul>
                    )}
                  </td>
                </tr>
                {Object.entries(session.settings ?? {}).map(([k, v]) => (
                  <tr key={k}><th scope="row"><code>{k}</code></th><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.description}>
              {session?.destroyed ? 'The session was destroyed: its data is gone from the server and the browser deleted the cookie.' : 'No lab session exists yet. Logging in creates one.'}
            </p>
          )}
        </Card>

        <Card title={`What PHP did${lastAction ? ` (${lastAction})` : ''}`}>
          {error && <p className={styles.errorBox} role="alert">{error.status ? `HTTP ${error.status}: ` : ''}{error.message}</p>}
          {log.length === 0 && !error ? <p className={styles.note}>Each action lists the PHP session functions it called.</p> : (
            <ol className={styles.serverLog}>
              {log.map((l, i) => (
                <li key={i}>
                  <span className={styles.logStep}>{l.step}</span>
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
