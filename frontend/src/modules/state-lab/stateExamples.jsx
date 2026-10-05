import { memo, useRef, useState } from 'react';
import { useActionRecorder } from './useActionRecorder.js';
import styles from './StateLab.module.css';

/**
 * Example components. Each is memoised so the visualizer's own updates never
 * re-render them: every render you see is caused by the example's state.
 */

export const CounterExample = memo(function CounterExample({ onRecord }) {
  const [count, setCount] = useState(0);
  const record = useActionRecorder(count, onRecord);
  const restore = (value) => record('Restore from history', `setCount(${value})`, () => setCount(value));

  return (
    <div className={styles.example}>
      <p className={styles.bigValue} aria-live="polite">count = <strong>{count}</strong></p>
      <div className={styles.actions}>
        <button type="button" onClick={() => record('Increment', 'setCount(count + 1)', () => setCount(count + 1), { restore })}>+1</button>
        <button type="button" onClick={() => record('Decrement', 'setCount(count - 1)', () => setCount(count - 1), { restore })}>−1</button>
        <button type="button" onClick={() => record('Three updates using the current value', 'setCount(count + 1);\nsetCount(count + 1);\nsetCount(count + 1);', () => {
          setCount(count + 1);
          setCount(count + 1);
          setCount(count + 1);
        }, { restore, lesson: 'All three calls read the same `count` from this render, so the result is +1. React batches them into one render.' })}>
          setCount(count + 1) ×3
        </button>
        <button type="button" onClick={() => record('Three functional updates', 'setCount(c => c + 1);\nsetCount(c => c + 1);\nsetCount(c => c + 1);', () => {
          setCount((c) => c + 1);
          setCount((c) => c + 1);
          setCount((c) => c + 1);
        }, { restore, lesson: 'Each updater receives the latest pending value, so the result is +3, still in a single render.' })}>
          setCount(c =&gt; c + 1) ×3
        </button>
        <button type="button" onClick={() => record('Set the same value', 'setCount(count)', () => setCount(count), { restore, lesson: 'Object.is(old, new) is true, so React skips the re-render.' })}>
          setCount(count)
        </button>
      </div>
    </div>
  );
});

let todoSeq = 3;

export const TodoExample = memo(function TodoExample({ onRecord }) {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Read about useState', done: true },
    { id: 2, text: 'Build the lab', done: false },
  ]);
  const [text, setText] = useState('Write tests');
  const record = useActionRecorder(todos, onRecord);
  const restore = (value) => record('Restore from history', 'setTodos(savedTodos)', () => setTodos(value));
  const inputRef = useRef(null);

  function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const item = { id: todoSeq++, text: text.trim(), done: false };
    record('Add item', 'setTodos([...todos, newItem])', () => setTodos([...todos, item]), { restore });
    setText('');
    inputRef.current?.focus();
  }

  return (
    <div className={styles.example}>
      <form className={styles.inline} onSubmit={add}>
        <label className="sr-only" htmlFor="todo-text">New item</label>
        <input id="todo-text" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="New item" />
        <button type="submit">Add</button>
      </form>
      <ul className={styles.todoList}>
        {todos.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => record('Toggle item', 'setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t))',
                () => setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))), { restore })} />
              <span className={t.done ? styles.done : undefined}>{t.text}</span>
            </label>
            <button type="button" aria-label={`Remove ${t.text}`} onClick={() => record('Remove item', 'setTodos(todos.filter(t => t.id !== id))',
              () => setTodos(todos.filter((x) => x.id !== t.id)), { restore })}>✕</button>
          </li>
        ))}
      </ul>
      <button type="button" className={styles.wrong} onClick={() => record('Mutate the array (wrong)', 'todos.push(newItem);\nsetTodos(todos);   // same array reference', () => {
        todos.push({ id: todoSeq++, text: 'Pushed directly', done: false });
        setTodos(todos);
      }, { restore, lesson: 'The array was changed in place, so its reference is the same: Object.is says “unchanged” and React does not re-render. The new item stays invisible until something else renders.' })}>
        Mutate with push() (anti-pattern)
      </button>
    </div>
  );
});

export const ProfileExample = memo(function ProfileExample({ onRecord }) {
  const [profile, setProfile] = useState({ name: 'Asha', email: 'asha@example.com', prefs: { newsletter: false, theme: 'light' } });
  const record = useActionRecorder(profile, onRecord);
  const restore = (value) => record('Restore from history', 'setProfile(savedProfile)', () => setProfile(value));
  const [draft, setDraft] = useState('Asha Rao');

  return (
    <div className={styles.example}>
      <dl className={styles.profile}>
        <dt>name</dt><dd>{profile.name}</dd>
        <dt>email</dt><dd>{profile.email}</dd>
        <dt>prefs.newsletter</dt><dd>{String(profile.prefs.newsletter)}</dd>
        <dt>prefs.theme</dt><dd>{profile.prefs.theme}</dd>
      </dl>
      <form className={styles.inline} onSubmit={(e) => {
        e.preventDefault();
        record('Rename', 'setProfile({ ...profile, name: newName })', () => setProfile({ ...profile, name: draft }), { restore });
      }}>
        <label className="sr-only" htmlFor="profile-name">New name</label>
        <input id="profile-name" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit">Rename</button>
      </form>
      <div className={styles.actions}>
        <button type="button" onClick={() => record('Toggle nested value', 'setProfile({ ...profile, prefs: { ...profile.prefs, newsletter: !profile.prefs.newsletter } })',
          () => setProfile({ ...profile, prefs: { ...profile.prefs, newsletter: !profile.prefs.newsletter } }), { restore })}>
          Toggle newsletter
        </button>
        <button type="button" className={styles.wrong} onClick={() => record('Mutate the object (wrong)', 'profile.prefs.theme = "dark";\nsetProfile(profile);', () => {
          profile.prefs.theme = profile.prefs.theme === 'dark' ? 'light' : 'dark';
          setProfile(profile);
        }, { restore, lesson: 'Changing a property in place keeps the same object reference, so React sees no change and skips the render.' })}>
          Mutate theme directly (anti-pattern)
        </button>
      </div>
    </div>
  );
});
