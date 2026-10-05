import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ArrowLeft, ArrowRight, History, Lock, LockOpen, Route as RouteIcon, Table2, Workflow } from 'lucide-react';
import { LabHeader } from '../../components/lab/LabHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/StateView.jsx';
import { FlowPipeline } from '../../visualizers/FlowPipeline.jsx';
import { recordExperimentRun } from '../../services/activity.js';
import { demoAuth, demoRoutes, flattenRoutes } from './demoRoutes.jsx';
import styles from './Routing.module.css';

const STEPS = [
  { id: 'current', label: 'Current route', layer: 'router' },
  { id: 'action', label: 'Navigation action', layer: 'event' },
  { id: 'router', label: 'Router', layer: 'router' },
  { id: 'target', label: 'Target route', layer: 'router' },
  { id: 'component', label: 'Component rendered', layer: 'render' },
];
const ROUTE_TABLE = flattenRoutes(demoRoutes);
const STEP_MS = 170;

const pathOf = (loc) => `${loc.pathname}${loc.search}`;
let navSeq = 0;

export default function RoutingVisualizerPage() {
  const hostRef = useRef(null);
  const routerRef = useRef(null);
  const trigger = useRef('initial load');
  const requested = useRef(null);
  const [stack, setStack] = useState({ entries: [], index: -1 });
  const [navs, setNavs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [anim, setAnim] = useState(STEPS.length);
  const [address, setAddress] = useState('/');
  const [loggedIn, setLoggedIn] = useState(demoAuth.loggedIn);
  const logged = useRef(false);

  // Mount the demo app in its own React root with its own memory router.
  useEffect(() => {
    const router = createMemoryRouter(demoRoutes, { initialEntries: ['/'] });
    routerRef.current = router;
    const root = createRoot(hostRef.current);
    root.render(<RouterProvider router={router} />);

    let previous = router.state.location;
    setStack({ entries: [previous], index: 0 });

    const unsubscribe = router.subscribe((state) => {
      // A navigation that waits on a loader passes through 'loading' first: remember its target.
      if (state.navigation.state !== 'idle') {
        requested.current ??= pathOf(state.navigation.location);
        return;
      }
      if (state.location.key === previous.key) return;

      const target = pathOf(state.location);
      const asked = requested.current;
      const redirected = asked && asked !== target ? asked : null;
      const action = state.historyAction;
      navSeq += 1;
      const entry = {
        id: navSeq,
        from: pathOf(previous),
        to: target,
        action,
        trigger: trigger.current,
        redirectedFrom: redirected,
        params: state.matches[state.matches.length - 1]?.params ?? {},
        matches: state.matches.map((m) => ({ id: m.route.id, pathname: m.pathname, component: m.route.handle?.component, protected: m.route.handle?.protected })),
        time: new Date().toLocaleTimeString([], { hour12: false }),
      };
      setNavs((list) => [entry, ...list].slice(0, 25));
      setSelectedId(entry.id);
      setAnim(0);
      setAddress(target);
      setLoggedIn(demoAuth.loggedIn);

      // Maintain the history stack exactly like a browser would.
      setStack(({ entries, index }) => {
        if (action === 'PUSH') return { entries: [...entries.slice(0, index + 1), state.location], index: index + 1 };
        if (action === 'REPLACE') return { entries: entries.map((e, i) => (i === index ? state.location : e)), index };
        const found = entries.findIndex((e) => e.key === state.location.key);
        return { entries, index: found === -1 ? index : found };
      });

      previous = state.location;
      trigger.current = 'link click (<Link> / <NavLink>)';
      requested.current = null;
      if (!logged.current) {
        logged.current = true;
        recordExperimentRun('route-navigation', 'success', { to: target, action });
      }
    });

    trigger.current = 'link click (<Link> / <NavLink>)';
    return () => {
      unsubscribe();
      router.dispose();
      // Unmount after React finishes the current commit.
      setTimeout(() => root.unmount(), 0);
    };
  }, []);

  useEffect(() => {
    if (anim >= STEPS.length) return undefined;
    const t = setTimeout(() => setAnim((a) => a + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [anim]);

  function go(path, how) {
    trigger.current = how;
    requested.current = path;
    routerRef.current?.navigate(path);
  }

  function goBy(delta) {
    trigger.current = delta < 0 ? 'back button (navigate(-1))' : 'forward button (navigate(1))';
    requested.current = null;
    routerRef.current?.navigate(delta);
  }

  function toggleLogin() {
    demoAuth.loggedIn = !demoAuth.loggedIn;
    setLoggedIn(demoAuth.loggedIn);
  }

  const nav = navs.find((n) => n.id === selectedId) ?? null;
  const matchedIds = new Set(nav?.matches.map((m) => m.id) ?? []);
  const summary = nav && {
    current: nav.from,
    action: `${nav.action} · ${nav.trigger}`,
    router: `${ROUTE_TABLE.length} routes → ${nav.matches.length} matched`,
    target: nav.redirectedFrom ? `${nav.to} (redirected)` : nav.to,
    component: nav.matches.map((m) => m.component).join(' › '),
  };
  const steps = STEPS.map((s, i) => ({
    ...s,
    status: !nav ? 'idle' : i > anim ? 'idle' : i === anim ? 'active' : 'done',
    summary: nav && i <= anim ? summary[s.id] : null,
  }));

  return (
    <div className={styles.page}>
      <LabHeader
        icon={RouteIcon}
        layer="router"
        title="Routing Visualizer"
        description="A real React Router app. Navigate and watch the router match the URL to a branch of routes, pass params, run guards and render the matching components, without reloading the page."
        concepts={['createMemoryRouter', '<Link>', '<NavLink>', '<Outlet>', 'nested routes', 'useParams', 'loader + redirect', 'history stack', '404 route']}
      />

      <div className={styles.grid}>
        <div className={styles.column}>
          <Card title="Demo app" icon={RouteIcon}>
            <form className={styles.addressBar} onSubmit={(e) => { e.preventDefault(); go(address.startsWith('/') ? address : `/${address}`, 'address bar (router.navigate)'); }}>
              <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => goBy(-1)} disabled={stack.index <= 0} aria-label="Back" />
              <Button size="sm" variant="ghost" icon={ArrowRight} onClick={() => goBy(1)} disabled={stack.index >= stack.entries.length - 1} aria-label="Forward" />
              <label className="sr-only" htmlFor="route-address">Address</label>
              <span className={styles.origin} aria-hidden="true">app://</span>
              <input id="route-address" value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false} />
              <Button size="sm" type="submit" variant="primary">Go</Button>
            </form>
            <div ref={hostRef} className={styles.host} />
            <div className={styles.authRow}>
              {loggedIn ? <LockOpen size={14} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
              <span>Demo user is <strong>{loggedIn ? 'logged in' : 'logged out'}</strong>: /settings {loggedIn ? 'will render' : 'redirects to /login'}.</span>
              <Button size="sm" variant="ghost" onClick={toggleLogin}>{loggedIn ? 'Log out' : 'Log in'}</Button>
            </div>
          </Card>

          <Card title="History stack" icon={History}>
            <ol className={styles.stack} aria-label="History stack">
              {stack.entries.map((loc, i) => (
                <li key={`${loc.key}-${i}`} className={i === stack.index ? styles.stackCurrent : i > stack.index ? styles.stackForward : undefined}>
                  <span className={styles.stackIndex}>{i}</span>
                  <code>{pathOf(loc)}</code>
                  {i === stack.index && <span className={styles.here}>current</span>}
                </li>
              ))}
            </ol>
            <p className={styles.muted}>PUSH adds an entry (and drops the forward ones), REPLACE overwrites the current entry, POP moves along the stack.</p>
          </Card>
        </div>

        <div className={styles.column}>
          <Card title="Navigation flow" icon={Workflow}>
            {nav ? <p className={styles.caption}><code>{nav.from}</code> → <code>{nav.to}</code>{nav.redirectedFrom && <> (asked for <code>{nav.redirectedFrom}</code>)</>}</p>
              : <p className={styles.caption}>Navigate in the demo app to see each step.</p>}
            <FlowPipeline steps={steps} label="Navigation flow" compact />
            {nav && (
              <div className={styles.details}>
                <table className={styles.kv}>
                  <tbody>
                    <tr><th scope="row">History action</th><td><code>{nav.action}</code></td></tr>
                    <tr><th scope="row">Triggered by</th><td>{nav.trigger}</td></tr>
                    <tr><th scope="row">URL params</th><td><code>{JSON.stringify(nav.params)}</code></td></tr>
                    {nav.redirectedFrom && <tr><th scope="row">Redirect</th><td>loader of <code>{nav.redirectedFrom}</code> returned <code>redirect(&quot;{nav.to}&quot;)</code></td></tr>}
                  </tbody>
                </table>
                <p className={styles.detailLabel}>Matched branch (outer → inner)</p>
                <ol className={styles.branch}>
                  {nav.matches.map((m) => (
                    <li key={m.id}><code>{m.pathname}</code> → <strong>&lt;{m.component} /&gt;</strong>{m.protected && <Lock size={12} aria-label="protected" />}</li>
                  ))}
                </ol>
              </div>
            )}
          </Card>

          <Card title="Route table" icon={Table2}>
            <table className={styles.routes} aria-label="Route table">
              <thead><tr><th scope="col">Path</th><th scope="col">Component</th></tr></thead>
              <tbody>
                {ROUTE_TABLE.map((r) => (
                  <tr key={r.id} className={matchedIds.has(r.id) ? styles.matched : undefined}>
                    <td><code>{r.path}</code>{r.protected && <Lock size={12} aria-label="protected" />}</td>
                    <td>&lt;{r.component} /&gt;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Route history">
            {navs.length === 0 ? <EmptyState title="No navigation yet" /> : (
              <ol className={styles.navLog} aria-label="Route history">
                {navs.map((n) => (
                  <li key={n.id} className={n.id === selectedId ? styles.navSelected : undefined}>
                    <button type="button" onClick={() => { setSelectedId(n.id); setAnim(STEPS.length); }}>
                      <span className={styles.action}>{n.action}</span>
                      <code>{n.from}</code> → <code>{n.to}</code>
                      {n.redirectedFrom && <span className={styles.redirect}>redirect</span>}
                    </button>
                    <time>{n.time}</time>
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
