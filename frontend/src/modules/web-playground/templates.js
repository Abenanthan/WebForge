/**
 * Starter experiments for the Web Playground. Each is a real three-file project:
 * index.html links style.css and script.js exactly as a deployed site would.
 */

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
${body}
  <script src="script.js"></script>
</body>
</html>
`;

export const TEMPLATES = [
  {
    id: 'starter',
    title: 'Starter page',
    description: 'Semantic HTML, a little CSS and a click handler.',
    files: {
      'index.html': page('My first experiment', `  <header>
    <h1>Hello, WebForge!</h1>
    <p class="tagline">Edit the code, then press <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.</p>
  </header>

  <main>
    <button id="counter" type="button">Clicked 0 times</button>
  </main>
`),
      'style.css': `body {
  font-family: system-ui, sans-serif;
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-content: center;
  text-align: center;
  background: linear-gradient(135deg, #eef2ff, #ecfeff);
  color: #0f172a;
}

h1 {
  margin-bottom: 0.25rem;
}

.tagline {
  color: #475569;
}

button {
  margin-top: 1.5rem;
  padding: 0.75rem 1.5rem;
  border: 0;
  border-radius: 999px;
  background: #4f46e5;
  color: white;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.1s;
}

button:active {
  transform: scale(0.96);
}
`,
      'script.js': `const button = document.querySelector('#counter');
let clicks = 0;

button.addEventListener('click', () => {
  clicks++;
  button.textContent = \`Clicked \${clicks} time\${clicks === 1 ? '' : 's'}\`;
  console.log('click #' + clicks, { clicks, at: new Date().toLocaleTimeString() });
});

console.info('script.js loaded. Click the button and watch this console.');
`,
    },
  },
  {
    id: 'todo',
    title: 'To-do list (DOM)',
    description: 'Create, update and remove elements in response to events.',
    files: {
      'index.html': page('To-do list', `  <main class="app">
    <h1>To-do</h1>
    <form id="todo-form">
      <label for="todo-input" class="sr-only">New task</label>
      <input id="todo-input" placeholder="What needs doing?" autocomplete="off">
      <button type="submit">Add</button>
    </form>
    <ul id="todo-list"></ul>
    <p id="summary"></p>
  </main>
`),
      'style.css': `* { box-sizing: border-box; }

body {
  font-family: system-ui, sans-serif;
  background: #f8fafc;
  color: #0f172a;
  margin: 0;
  padding: 2rem 1rem;
}

.app {
  max-width: 420px;
  margin: 0 auto;
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  padding: 0.6rem 0.8rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

button {
  padding: 0.6rem 1rem;
  border: 0;
  border-radius: 8px;
  background: #0f766e;
  color: white;
  cursor: pointer;
}

ul { list-style: none; padding: 0; }

li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid #e2e8f0;
}

li.done span { text-decoration: line-through; color: #94a3b8; }
li button { margin-left: auto; background: #e11d48; padding: 0.3rem 0.6rem; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`,
      'script.js': `const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const summary = document.getElementById('summary');

function updateSummary() {
  const total = list.children.length;
  const done = list.querySelectorAll('li.done').length;
  summary.textContent = total ? \`\${done} of \${total} done\` : 'Nothing to do. Add a task!';
}

function addTask(text) {
  const item = document.createElement('li');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  const label = document.createElement('span');
  label.textContent = text;            // textContent: safe from HTML injection
  const remove = document.createElement('button');
  remove.textContent = 'Delete';

  checkbox.addEventListener('change', () => {
    item.classList.toggle('done', checkbox.checked);
    updateSummary();
  });
  remove.addEventListener('click', () => {
    item.remove();
    console.log('removed:', text);
    updateSummary();
  });

  item.append(checkbox, label, remove);
  list.append(item);
  console.log('added:', item);
  updateSummary();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();               // stay on the page
  const text = input.value.trim();
  if (!text) return console.warn('Empty task ignored');
  addTask(text);
  input.value = '';
  input.focus();
});

['Read about the DOM', 'Inspect this list'].forEach(addTask);
`,
    },
  },
  {
    id: 'flexbox',
    title: 'Responsive card grid (CSS)',
    description: 'Flexbox, CSS variables and a media query. Try the device toggle.',
    files: {
      'index.html': page('Card grid', `  <h1>Web technologies</h1>
  <section class="grid">
    <article class="card html"><h2>HTML</h2><p>Structure and meaning.</p></article>
    <article class="card css"><h2>CSS</h2><p>Layout, colour and type.</p></article>
    <article class="card js"><h2>JavaScript</h2><p>Behaviour and interactivity.</p></article>
    <article class="card php"><h2>PHP</h2><p>Server-side processing.</p></article>
  </section>
`),
      'style.css': `:root {
  --gap: 1rem;
  --radius: 14px;
}

body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 2rem;
  background: #0f172a;
  color: #e2e8f0;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
}

.card {
  flex: 1 1 200px;          /* grow, shrink, minimum width before wrapping */
  padding: 1.25rem;
  border-radius: var(--radius);
  background: #1e293b;
  border-top: 4px solid var(--accent);
}

.html { --accent: #f97316; }
.css  { --accent: #3b82f6; }
.js   { --accent: #eab308; }
.php  { --accent: #8b5cf6; }

/* Phones: one column */
@media (max-width: 480px) {
  body { padding: 1rem; }
  .card { flex-basis: 100%; }
}
`,
      'script.js': `// Report the active layout whenever the preview is resized.
const query = window.matchMedia('(max-width: 480px)');
const report = () => console.log(\`viewport \${window.innerWidth}px → \${query.matches ? 'mobile (1 column)' : 'wrapping grid'}\`);
query.addEventListener('change', report);
report();
`,
    },
  },
  {
    id: 'form',
    title: 'Form validation',
    description: 'Constraint validation API and custom messages.',
    files: {
      'index.html': page('Sign-up form', `  <form id="signup" novalidate>
    <h1>Create account</h1>
    <label>Email
      <input type="email" name="email" required>
    </label>
    <label>Password
      <input type="password" name="password" required minlength="8">
    </label>
    <label>Age
      <input type="number" name="age" min="13" max="120">
    </label>
    <button type="submit">Sign up</button>
    <output id="result"></output>
  </form>
`),
      'style.css': `body {
  font-family: system-ui, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  background: #f1f5f9;
}

form {
  display: grid;
  gap: 0.9rem;
  width: min(340px, 90vw);
  padding: 1.5rem;
  background: white;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgb(15 23 42 / 0.08);
}

label { display: grid; gap: 0.3rem; font-weight: 600; font-size: 0.9rem; }
input { padding: 0.55rem; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
input.invalid { border-color: #dc2626; background: #fef2f2; }
button { padding: 0.65rem; border: 0; border-radius: 8px; background: #2563eb; color: white; font-weight: 600; }
output { min-height: 1.2em; font-size: 0.9rem; }
`,
      'script.js': `const form = document.getElementById('signup');
const result = document.getElementById('result');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const problems = [];

  for (const input of form.elements) {
    if (!(input instanceof HTMLInputElement)) continue;
    input.classList.toggle('invalid', !input.checkValidity());
    if (!input.checkValidity()) {
      problems.push(\`\${input.name}: \${input.validationMessage}\`);
    }
  }

  if (problems.length) {
    console.warn('Validation failed', problems);
    result.textContent = '✗ ' + problems.length + ' field(s) need attention';
    result.style.color = '#dc2626';
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  delete data.password;                 // never log passwords
  console.log('Valid! Would send to the server:', data);
  result.textContent = '✓ All fields valid';
  result.style.color = '#16a34a';
});
`,
    },
  },
  {
    id: 'debugging',
    title: 'Debugging challenge',
    description: 'Contains bugs. Use the Errors panel to find and fix them.',
    files: {
      'index.html': `<html>
<head>
  <title>Find the bugs</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Shopping total</h1>
  <ul id="cart"></ul>
  <p>Total: <strong id="total">?</strong></p>
  <script src="script.js"></script>
</body>
</html>
`,
      'style.css': `body { font-family: system-ui, sans-serif; padding: 2rem; }
#total { color: #16a34a; }
`,
      'script.js': `const cart = [
  { name: 'Keyboard', price: 49.99 },
  { name: 'Mouse', price: 19.5 },
  { name: 'Monitor', price: 179 },
];

const list = document.getElementById('cart');
for (const item of cart) {
  const li = document.createElement('li');
  li.textContent = item.name + ' - $' + item.price.toFixed(2);
  list.appendChild(li);
}

// Bug: "total" is misspelled below, which throws a ReferenceError.
const total = cart.reduce((sum, item) => sum + item.price, 0);
document.getElementById('total').textContent = '$' + totl.toFixed(2);
console.log('Total computed:', total);
`,
    },
  },
];

export const DEFAULT_TEMPLATE_ID = 'starter';
export const FILE_ORDER = ['index.html', 'style.css', 'script.js'];

export function templateById(id) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
