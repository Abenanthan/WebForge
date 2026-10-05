import { memo } from 'react';
import { inspectable, useInspectableState } from './inspector/inspectable.jsx';

/**
 * "Campus Portal": a small but real React app whose every component is inspectable.
 *   App
 *    ├── Header
 *    ├── Sidebar
 *    └── Dashboard
 *         ├── Card ×3
 *         ├── Table
 *         └── Footer   (optionally wrapped in React.memo)
 */

const INITIAL_STUDENTS = [
  { id: 1, name: 'Asha Rao', dept: 'CSE', marks: 91 },
  { id: 2, name: 'Rahul Menon', dept: 'ECE', marks: 78 },
  { id: 3, name: 'Priya Das', dept: 'CSE', marks: 85 },
  { id: 4, name: 'Arjun Iyer', dept: 'MECH', marks: 69 },
];
const EXTRA_NAMES = ['Meera Pillai', 'Kavya S', 'Vikram N', 'Divya R', 'Sanjay K'];

const Header = inspectable(function Header({ title, userName, theme, onToggleTheme }) {
  return (
    <header className="demo-header">
      <strong>{title}</strong>
      <span className="demo-user">Hi, {userName}</span>
      <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
    </header>
  );
}, { name: 'Header', description: 'Top bar. Receives the theme and a callback to change it.' });

const Sidebar = inspectable(function Sidebar({ pages, current, onNavigate, onAddStudent }) {
  return (
    <nav className="demo-sidebar" aria-label="Demo navigation">
      {pages.map((p) => (
        <button key={p} type="button" aria-current={p === current ? 'page' : undefined} onClick={() => onNavigate(p)}>{p}</button>
      ))}
      <button type="button" className="demo-add" onClick={onAddStudent}>+ Add student</button>
    </nav>
  );
}, { name: 'Sidebar', description: 'Navigation. Calls onNavigate (a prop) to change state owned by App.' });

const Card = inspectable(function Card({ label, value, tone }) {
  const [expanded, setExpanded] = useInspectableState('expanded', false);
  return (
    <div className={`demo-card demo-${tone}`}>
      <span className="demo-card-label">{label}</span>
      <strong className="demo-card-value">{value}</strong>
      <button type="button" className="demo-link" onClick={() => setExpanded((e) => !e)}>{expanded ? 'Hide' : 'Details'}</button>
      {expanded && <small>Computed from the students prop.</small>}
    </div>
  );
}, { name: 'Card', description: 'Displays one statistic. Has its own local state (expanded).' });

const Table = inspectable(function Table({ rows }) {
  const [sortBy, setSortBy] = useInspectableState('sortBy', 'name');
  const sorted = [...rows].sort((a, b) => (sortBy === 'marks' ? b.marks - a.marks : a.name.localeCompare(b.name)));
  return (
    <table className="demo-table">
      <thead>
        <tr>
          <th scope="col"><button type="button" onClick={() => setSortBy('name')}>Name{sortBy === 'name' ? ' ▲' : ''}</button></th>
          <th scope="col">Dept</th>
          <th scope="col"><button type="button" onClick={() => setSortBy('marks')}>Marks{sortBy === 'marks' ? ' ▼' : ''}</button></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.dept}</td><td>{s.marks}</td></tr>)}
        {sorted.length === 0 && <tr><td colSpan={3}>No matches</td></tr>}
      </tbody>
    </table>
  );
}, { name: 'Table', description: 'Lists the rows it is given. Sort order is its own state.' });

function FooterView({ count, theme }) {
  return <footer className="demo-footer">{count} student{count === 1 ? '' : 's'} · {theme} theme</footer>;
}
const Footer = inspectable(FooterView, { name: 'Footer', description: 'Shows a count. Pure: same props, same output.' });
const MemoFooter = memo(inspectable(FooterView, { name: 'Footer', description: 'Wrapped in React.memo: skips re-rendering when its props are unchanged.', memo: true }));

const Dashboard = inspectable(function Dashboard({ page, students, theme, memoFooter }) {
  const [query, setQuery] = useInspectableState('query', '');
  const rows = students.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  const average = students.length ? Math.round(students.reduce((sum, s) => sum + s.marks, 0) / students.length) : 0;
  const top = students.reduce((best, s) => (!best || s.marks > best.marks ? s : best), null);
  const FooterComponent = memoFooter ? MemoFooter : Footer;
  return (
    <main className="demo-dashboard">
      <h3>{page}</h3>
      {page === 'Overview' ? (
        <div className="demo-cards">
          <Card label="Students" value={students.length} tone="blue" />
          <Card label="Average marks" value={average} tone="green" />
          <Card label="Top scorer" value={top?.name ?? '—'} tone="amber" />
        </div>
      ) : (
        <>
          <label className="demo-search">
            Filter <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a name…" />
          </label>
          <Table rows={rows} />
        </>
      )}
      <FooterComponent count={students.length} theme={theme} />
    </main>
  );
}, { name: 'Dashboard', description: 'Main area. Owns the filter text (query) and passes data down as props.' });

export const DemoApp = inspectable(function App({ memoFooter }) {
  const [theme, setTheme] = useInspectableState('theme', 'light');
  const [page, setPage] = useInspectableState('page', 'Overview');
  const [students, setStudents] = useInspectableState('students', INITIAL_STUDENTS);

  const addStudent = () => setStudents((list) => [
    ...list,
    { id: list.length + 1, name: EXTRA_NAMES[(list.length - INITIAL_STUDENTS.length) % EXTRA_NAMES.length], dept: 'IT', marks: 60 + ((list.length * 7) % 40) },
  ]);

  return (
    <div className={`demo-app demo-theme-${theme}`}>
      <Header title="Campus Portal" userName="Demo" theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      <div className="demo-body">
        <Sidebar pages={['Overview', 'Students']} current={page} onNavigate={setPage} onAddStudent={addStudent} />
        <Dashboard page={page} students={students} theme={theme} memoFooter={memoFooter} />
      </div>
    </div>
  );
}, { name: 'App', description: 'Root component. Owns theme, page and the students list.' });
