/** Built-in document for the DOM Explorer: semantic structure plus a script that changes the DOM. */
export const SAMPLE_PAGE = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DOM sample</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <h1 id="title">Campus Events</h1>
    <nav>
      <a href="#events" class="active">Events</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <main id="app">
    <section id="events" class="card">
      <h2>Upcoming</h2>
      <ul id="event-list">
        <li class="event">Hackathon · Fri</li>
        <li class="event featured">Web Dev Workshop · Sat</li>
      </ul>
      <button id="add-event" class="btn">Add event</button>
    </section>
    <p class="note">Click the button: the page script changes the DOM and the tree updates live.</p>
  </main>

  <footer>© 2026 Student Council</footer>
  <script src="script.js"></script>
</body>
</html>
`,
  'style.css': `body { font-family: system-ui, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
.site-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background: #1e1b4b; color: white; }
.site-header h1 { margin: 0; font-size: 1.3rem; }
nav a { color: #c7d2fe; margin-left: 1rem; text-decoration: none; }
nav a.active { color: white; font-weight: 600; }
main { padding: 1.5rem; }
.card { background: white; border-radius: 12px; padding: 1rem 1.25rem; box-shadow: 0 4px 16px rgb(15 23 42 / .08); }
.event { padding: .4rem 0; }
.featured { color: #7c3aed; font-weight: 600; }
.btn { margin-top: .5rem; padding: .5rem 1rem; border: 0; border-radius: 8px; background: #4f46e5; color: white; cursor: pointer; }
.note { color: #64748b; font-size: .9rem; }
footer { padding: 1rem 1.5rem; color: #64748b; font-size: .85rem; }
`,
  'script.js': `const list = document.getElementById('event-list');
let count = 0;

document.getElementById('add-event').addEventListener('click', () => {
  count++;
  const item = document.createElement('li');
  item.className = 'event';
  item.textContent = 'New event #' + count;
  list.appendChild(item);
});
`,
};
