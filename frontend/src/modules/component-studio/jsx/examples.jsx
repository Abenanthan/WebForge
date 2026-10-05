/**
 * Controlled JSX examples. Each provides a fixed scope: the only variables and
 * components the learner's JSX can use (enforced by jsxCompiler.js).
 */

const user = { name: 'Asha', role: 'student' };
const messages = ['Lab 4 graded', 'New quiz available'];
const courses = [
  { code: 'CS301', title: 'Web Programming' },
  { code: 'CS302', title: 'Databases' },
  { code: 'CS303', title: 'Operating Systems' },
];

function Badge({ label, tone = 'blue' }) {
  return <span className={`jsx-badge jsx-${tone}`}>{label}</span>;
}

function Avatar({ name }) {
  return <span className="jsx-avatar" title={name}>{String(name ?? '?').slice(0, 1).toUpperCase()}</span>;
}

export const EXAMPLES = [
  {
    id: 'element',
    title: 'Your first element',
    explain: 'JSX looks like HTML but compiles to a function call. className is used instead of class.',
    scope: () => ({}),
    code: '<h1 className="title">Hello, JSX!</h1>',
  },
  {
    id: 'expressions',
    title: 'Embedding expressions',
    explain: 'Anything inside { } is a JavaScript expression: its value becomes a child.',
    scope: () => ({ user, messages }),
    code: '<p>\n  Hello, {user.name}! You have {messages.length} new messages.\n</p>',
  },
  {
    id: 'conditional',
    title: 'Conditional rendering',
    explain: 'Use the ternary operator or && to decide what to render. false and null render nothing.',
    scope: () => ({ user, messages, isLoggedIn: true }),
    code: '<div>\n  {isLoggedIn ? <p>Welcome back, {user.name}</p> : <button>Log in</button>}\n  {messages.length > 0 && <span className="jsx-badge jsx-amber">{messages.length} new</span>}\n</div>',
  },
  {
    id: 'lists',
    title: 'Lists and keys',
    explain: 'map() turns data into elements. Each list item needs a stable, unique key.',
    scope: () => ({ courses }),
    code: '<ul>\n  {courses.map((course) => (\n    <li key={course.code}>\n      <strong>{course.code}</strong>: {course.title}\n    </li>\n  ))}\n</ul>',
  },
  {
    id: 'components',
    title: 'Components and props',
    explain: 'Capitalised tags are components. Attributes become the props object passed to them.',
    scope: () => ({ Badge, Avatar, user }),
    code: '<div className="jsx-row">\n  <Avatar name={user.name} />\n  <Badge label="React" tone="blue" />\n  <Badge label="JSX" tone="green" />\n</div>',
  },
  {
    id: 'events',
    title: 'Events and state',
    explain: 'Event props take functions. Calling the state setter re-renders with the new value.',
    stateful: true,
    scope: ({ count, setCount }) => ({ count, setCount }),
    code: '<div>\n  <p>Clicked {count} times</p>\n  <button onClick={() => setCount(count + 1)}>+1</button>\n  <button onClick={() => setCount(0)}>Reset</button>\n</div>',
  },
  {
    id: 'fragments',
    title: 'Fragments and styles',
    explain: '<>…</> groups siblings without adding a DOM node. style takes an object of camelCase properties.',
    scope: () => ({ theme: { color: '#7c3aed', size: 22 } }),
    code: '<>\n  <h2 style={{ color: theme.color, fontSize: theme.size }}>Styled heading</h2>\n  <p>Fragments add no extra element to the DOM.</p>\n</>',
  },
];

export function findExample(id) {
  return EXAMPLES.find((e) => e.id === id) ?? EXAMPLES[0];
}
