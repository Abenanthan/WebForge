import { Link, NavLink, Outlet, redirect, useLocation, useNavigate, useParams } from 'react-router-dom';

/**
 * The demo application's routes. It runs in its own React root with its own
 * createMemoryRouter (routers cannot be nested inside the WebForge router).
 * `handle.component` names the component each route renders, for the visualizer.
 */

export const demoAuth = { loggedIn: false };

function DemoLayout() {
  return (
    <div className="rt-app">
      <nav className="rt-nav" aria-label="Demo app">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/profile/7">Profile</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main className="rt-main">
        <Outlet />
      </main>
    </div>
  );
}

function Home() {
  return (
    <section>
      <h2>Home</h2>
      <p>Click the links above, type a path in the address bar, or use back and forward.</p>
      <p><Link to="/does-not-exist">Visit a page that does not exist</Link></p>
    </section>
  );
}

function About() {
  return <section><h2>About</h2><p>Client-side routing swaps components without reloading the page.</p></section>;
}

function DashboardLayout() {
  return (
    <section>
      <h2>Dashboard</h2>
      <nav className="rt-subnav" aria-label="Dashboard sections">
        <NavLink to="/dashboard" end>Overview</NavLink>
        <NavLink to="/dashboard/stats">Stats</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}

function DashboardOverview() {
  return <p>Overview: a nested route rendered inside the Dashboard layout&apos;s &lt;Outlet /&gt;.</p>;
}

function DashboardStats() {
  return <p>Stats: 42 students, 7 labs. Same layout, different child route.</p>;
}

function Profile() {
  const { userId } = useParams();
  return (
    <section>
      <h2>Profile #{userId}</h2>
      <p><code>useParams()</code> → <code>{JSON.stringify({ userId })}</code></p>
      <p>
        Other users: <Link to="/profile/3">#3</Link> · <Link to="/profile/12">#12</Link>
      </p>
    </section>
  );
}

function Settings() {
  return <section><h2>Settings</h2><p>Only logged-in users get here: the route&apos;s loader checks before rendering.</p></section>;
}

function Login() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const from = new URLSearchParams(search).get('from') || '/';
  return (
    <section>
      <h2>Log in</h2>
      <p>You were redirected here from <code>{from}</code>.</p>
      <button type="button" onClick={() => { demoAuth.loggedIn = true; navigate(from, { replace: true }); }}>Log in and continue</button>
    </section>
  );
}

function NotFound() {
  const { pathname } = useLocation();
  return <section><h2>404</h2><p>No route matches <code>{pathname}</code>. The catch-all <code>*</code> route rendered this.</p></section>;
}

export const demoRoutes = [
  {
    id: 'root',
    path: '/',
    element: <DemoLayout />,
    handle: { component: 'DemoLayout' },
    children: [
      { id: 'home', index: true, element: <Home />, handle: { component: 'Home' } },
      { id: 'home-alias', path: 'home', element: <Home />, handle: { component: 'Home' } },
      { id: 'about', path: 'about', element: <About />, handle: { component: 'About' } },
      {
        id: 'dashboard',
        path: 'dashboard',
        element: <DashboardLayout />,
        handle: { component: 'DashboardLayout' },
        children: [
          { id: 'dashboard-index', index: true, element: <DashboardOverview />, handle: { component: 'DashboardOverview' } },
          { id: 'dashboard-stats', path: 'stats', element: <DashboardStats />, handle: { component: 'DashboardStats' } },
        ],
      },
      { id: 'profile', path: 'profile/:userId', element: <Profile />, handle: { component: 'Profile' } },
      {
        id: 'settings',
        path: 'settings',
        element: <Settings />,
        handle: { component: 'Settings', protected: true },
        // A real guard: runs before the route renders and can redirect.
        loader: () => (demoAuth.loggedIn ? null : redirect('/login?from=/settings')),
      },
      { id: 'login', path: 'login', element: <Login />, handle: { component: 'Login' } },
      { id: 'not-found', path: '*', element: <NotFound />, handle: { component: 'NotFound' } },
    ],
  },
];

/** Flattened route table for display: full path pattern of every route. */
export function flattenRoutes(routes, parent = '') {
  return routes.flatMap((r) => {
    const full = r.index ? (parent || '/') : r.path?.startsWith('/') ? r.path : `${parent === '/' ? '' : parent}/${r.path}`;
    return [{ id: r.id, path: r.index ? `${full} (index)` : full, component: r.handle.component, protected: Boolean(r.handle.protected) },
      ...(r.children ? flattenRoutes(r.children, full) : [])];
  });
}
