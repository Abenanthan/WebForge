# Viva Notes

## 60-second pitch
WebForge is a web laboratory where students do not just write web code: they *see how it works*.
It has 13 labs covering HTML/CSS/JS, the DOM, events, forms, AJAX, Canvas, PHP, sessions, files,
SQL, React components, state, hooks and routing. Everything is real: code runs in a sandbox,
requests reach a PHP API, SQL runs on MySQL, and every timing is measured.

Its signature feature is the **Execution Trace**: one form submission is recorded through every
layer, from the click, event, validation and React state, across HTTP into PHP and each SQL
statement, and back to the re-render, DOM update and paint, on a single timeline.
It is built with React 18 and Vite, plain PHP 8.2 and MySQL, and verified by 151 automated tests
including WCAG accessibility and security tests.

## Demo script (about 10 minutes)
Before the viva: XAMPP running, `npm run build:apache` done, browser at http://localhost/webforge/,
logged out, light theme. Keep http://localhost/webforge/api/health in a second tab.

| # | Do | Say |
|---|---|---|
| 1 | Show `/api/health` | "Plain PHP API, one JSON envelope everywhere; even the health check returns its server steps in `meta.trace`." |
| 2 | Open `/webforge/lab/state-lab` while logged out → login page → log in | "Protected route: the guard remembers where I was going. Login uses bcrypt, a new session id and a CSRF token." |
| 3 | Dashboard | "All figures come from my own data: experiments, quizzes, traces, mastery per category." |
| 4 | Web Playground: change the heading, Run, show console and an error line | "User code runs in a sandboxed iframe with no same-origin access and no network. Errors come back with line numbers through `postMessage`." |
| 5 | JS Playground: Run, step through | "The program is parsed with acorn and instrumented, so every assignment and condition is recorded with its real value." |
| 6 | Event Visualizer: click the button, open the flow | "A real click, followed from the event object through the listener to the DOM mutation and the repaint." |
| 7 | AJAX Monitor: Search the database preset, Send; open Server tab | "Real fetch, real headers. The Server tab shows PHP's own steps, including the prepared SQL and its bound values." |
| 8 | Database Lab: SELECT with a search | "Prepared statements: SQL and data travel separately, so injection is impossible. ORDER BY columns come from a whitelist." |
| 9 | Server Lab → Sessions: log in, members page, log out | "A separate session cookie demonstrates the session lifecycle without touching my real login." |
| 10 | Component Studio: select `<Dashboard>`, type in the search | "The render log explains every re-render: state changed, props changed, or parent re-rendered." |
| 11 | State & Hooks: `setCount(count + 1)` ×3, then `c => c + 1` ×3 | "Batching: the first adds 1, the second adds 3, both in one render. Same value → React bails out." |
| 12 | **Execution Trace → Full-stack form**: Fill sample, Submit | "This is the signature feature: 23 measured steps across nine layers, from the UI to the database." |
| 13 | Open in explorer → Flow, click INSERT; Waterfall; Replay | "The swimlanes show the path between layers. Here is the real INSERT with its bound values. The waterfall shows where time goes: mostly the database round trip." |
| 14 | Back to the form, tick "skip client-side validation", invalid email | "Client validation is for the user; the server is the authority. The trace shows PHP rejecting it with a 422." |
| 15 | Learn & Assess: a quick quiz → result | "Graded on the server; answer keys never reach the browser. Wrong answers recommend the lab that teaches the concept, and mastery updates." |
| 16 | Toggle dark theme; narrow the window | "WCAG 2.1 AA in both themes, checked automatically with axe on every page; works from 360 px." |

## Likely questions

**Why plain PHP and no framework?**
To show the mechanisms a framework hides: routing, middleware, sessions, CSRF, validation and the
response envelope are all about 100 lines each in `backend/src/Core`. The Execution Trace needs
those steps to be visible, so owning the pipeline was an advantage.

**How does the Execution Trace measure the server if the clocks differ?**
The browser measures the whole HTTP round trip. PHP measures its own steps relative to when the
request arrived and returns them in `meta.trace`. Server steps are placed inside the network span,
centred, so the gap on each side is the HTTP overhead each way. That placement is an estimate and the UI
says so; each step keeps its real server offset.

**How do you know the render time is real?**
`setState` is timestamped when it is called; React runs `useLayoutEffect` synchronously after it
commits the DOM, so the difference is the real render-plus-commit time. The paint step is the
next `requestAnimationFrame` after the commit.

**How is user code isolated?**
`<iframe srcdoc sandbox="allow-scripts allow-modals">` without `allow-same-origin`: the frame gets
an opaque origin, so it cannot read cookies, storage or the parent page. Its own CSP blocks network
access, forms and `<base>`. Messages are only accepted from that frame's window with the right run id.
The JSX Playground renders inside the app, so it uses a whitelist compiler instead.

**Is the Server Lab running my PHP?**
No. It runs fixed PHP classes with validated inputs; the source shown is the real class. Running
arbitrary PHP would hand the server to every user.

**How do you prevent SQL injection?**
PDO native prepared statements only (`ATTR_EMULATE_PREPARES=false`), so values never become part
of the SQL text. Column names cannot be parameters, so `ORDER BY` uses a whitelist. A security test
sends `' OR '1'='1` and checks it is treated as plain data.

**And CSRF?**
A random token stored in the session must come back in the `X-CSRF-Token` header on every
non-GET request. Another site can make the browser send the cookie but cannot read the token.
`SameSite=Lax` adds a second layer.

**Why does a slow request not block my other requests?**
PHP locks the session file for the whole request. The front controller calls
`session_write_close()` right after authentication unless the route writes to the session.

**How is mastery calculated?**
Per concept: the share of its experiments completed successfully and the share of its quiz
questions whose latest answer is correct; each counts half when both exist. It is recalculated after
every experiment run and quiz submission, and always shown with the numbers behind it.

**How did you test it?**
Four levels:
- 23 backend unit tests (validator, grader, router policy);
- 12 live API security tests (auth on all 47 protected routes, CSRF, cross-user isolation, injection, traversal, throttling);
- 62 frontend unit and component tests;
- 54 end-to-end Playwright tests with a real browser, PHP and MySQL, including axe WCAG scans of every page in both themes, a layout check at three widths and a JavaScript size budget.

**What about accessibility?**
WCAG 2.1 AA: skip link, landmarks, keyboard-navigable tree (WAI-ARIA tree pattern), visible
focus, labelled controls, live regions for results, and contrast ≥ 4.5:1 computed for every colour
token in both themes. axe-core reports zero violations on every page.

**What would you do next?**
Compare two traces side by side, a command palette, quiz authoring for teachers, server-sent
events to stream long traces, and running the API on PHP-FPM behind HTTPS.

## Numbers worth remembering
| | |
|---|---|
| Labs / sections | 13 labs, 16 sections |
| API | 52 endpoints, one envelope, 5 public |
| Database | 18 tables; 20 concepts, 36 experiments, 6 quizzes, 39 questions |
| Code | ~13,500 lines JS/JSX, ~3,800 lines PHP |
| Tests | 151 automated (23 + 12 + 62 + 54) |
| Full-stack trace | 23 measured steps across 9 layers |
| Accessibility | WCAG 2.1 AA, 0 axe violations, light and dark |

## Honest limitations
- The server clock alignment in traces is an estimate (stated in the UI).
- `Require local`: the Apache setup is for one machine; a public deployment needs HTTPS and a dedicated database user.
- Not built from the original plan: trace comparison, command palette, admin quiz authoring.
