# WebForge — Phase 0 Design Blueprint

> "Don't just write web code. See how it works."

## Context
The repository at `D:\Semester 5\Web Programming\WebForge` is empty: `main` has no commits. Node 24 is installed. PHP and MySQL are not.

The goal is an academic-grade platform for interactive web-development labs and visualization. Stack: React + React Router + CodeMirror 6 on the frontend, plain PHP 8 on the backend, MySQL/MariaDB through XAMPP.

**Hard environment constraint: the C: drive is full.** All tooling, caches, uploads and DB data must live on D:. This document covers the 14 design deliverables you asked for. No application code is written until you approve it.

---

## 1. System Architecture

```
┌──────────────────────── Browser (React SPA, Vite) ───────────────────────────┐
│  AppShell (Router, Theme, Auth, Trace providers)                              │
│   ├─ Lab modules (lazy-loaded routes)                                         │
│   ├─ Sandboxed iframes (srcdoc, sandbox="allow-scripts")  ◄─ user code runs   │
│   │      └─ postMessage bridge → console / DOM snapshot / event taps          │
│   ├─ TraceBus (in-memory event bus: every instrumented op emits spans)        │
│   └─ apiClient (fetch wrapper) → emits request/response spans + X-Trace-Id    │
└────────────────────────────────┬──────────────────────────────────────────────┘
                                 │ JSON over HTTP (same-origin via Vite proxy / Apache)
┌────────────────────────────────▼──────────────────────────────────────────────┐
│  PHP 8.2 front controller  backend/public/index.php                           │
│   Router → Middleware (CORS-off/same-origin, session, CSRF, auth, rate-limit) │
│   → Controller → Service → Repository (PDO prepared statements)               │
│   ServerTracer: records steps (validate, process, sql, respond) with timings  │
│   → returned in response envelope `meta.trace` and persisted                  │
└────────────────────────────────┬──────────────────────────────────────────────┘
                                 │ PDO (utf8mb4, ERRMODE_EXCEPTION, emulate=false)
                  ┌──────────────▼───────────────┐   ┌──────────────────────────┐
                  │ MySQL/MariaDB (XAMPP on D:)  │   │ backend/storage/sandbox/ │
                  │ webforge DB                  │   │ per-user file lab dir    │
                  └──────────────────────────────┘   └──────────────────────────┘
```

**Key architectural decisions**
- **All user code runs client-side in sandboxed iframes.** That covers HTML/CSS/JS, the JS Playground and JSX. The iframe has no `allow-same-origin`, so it cannot read the cookies or storage of the app. It has its own CSP in srcdoc (`connect-src 'none'`). Communication happens only through `postMessage` with a message-type whitelist.
- **No arbitrary server code, ever.** The Server Lab is a catalogue of fixed PHP "experiments" (variables, loops, strings…). Each experiment is a whitelisted class that takes validated inputs and returns `{output, steps[], sourceSnippet}`. The PHP source shown to the user is read-only text, embedded beside the real implementation.
- **The Execution Trace is real, not animated.** One trace is a tree of spans with `traceId`.
  - Client spans come from instrumented hooks: `useTracedState`, `apiClient`, form validators, and router listeners.
  - Server spans come from `ServerTracer` and are merged back through `meta.trace` in the response.
  - Finished traces are POSTed to `/api/traces` and stored. The Trace page replays and inspects them.
- **Uniform response envelope:** `{ ok, data, error:{code,message,fields}, meta:{traceId, durationMs, trace:[...] } }`.

## 2. Feature / Module Breakdown (consolidated: 14 nav sections, 22 functional areas)

| # | Nav Section | Contains | Backend? |
|---|---|---|---|
| 1 | **Dashboard** | welcome, quick-launch, recent projects/activity, stats, progress | yes |
| 2 | **Web Playground** | file explorer (html/css/js), CM6 editors, live preview, console, errors, desktop/tablet/mobile toggle, run/reset/save (→ Projects) | save |
| 3 | **JS Playground** | 8 topic tabs with seed snippets; runs in a Worker/iframe; panels: Input → Execution (step log) → Output → Errors; timeout guard | log |
| 4 | **DOM & Events** | *DOM Explorer*: tree, inspector (tag/id/classes/attrs/text/parent/children/computed styles), and controlled mutations. *Event Visualizer*: 9 event types, a 7-stage pipeline with highlighting, and event history. *Form Validation Lab*: client vs server columns. | validation endpoint |
| 5 | **AJAX Monitor** | request builder over demo endpoints, network log table, request/response detail tabs, flow diagram, loading/success/error, simulated latency/error toggles (done server-side, so they are real) | yes |
| 6 | **Canvas Studio** | pencil/line/rect/circle/eraser, size/color, undo/redo (snapshot stack), clear, PNG export, save to project | save |
| 7 | **Server Lab** | PHP experiments (variables…functions), Form processing, **Sessions demonstrator**, **File Handling lab**. Flow: INPUT → SERVER PROCESSING (steps) → OUTPUT | yes |
| 8 | **Database Lab** | per-user sandbox table `lab_contacts`; INSERT/SELECT/UPDATE/DELETE forms; live table; read-only SQL panel showing the real prepared statement + bound params | yes |
| 9 | **Component Studio** | live mini React app (App→Header/Sidebar/Dashboard→Card/Table/Footer). Tree comes from a component-registry HOC; inspector shows props/state/parent/children/render count. Includes a **JSX Playground** (Sucrase transform → `createElement` tree view → rendered UI in sandbox) and a **Props Visualizer** (animated edge parent→child with prop name/value). | – |
| 10 | **State & Hooks** | State Visualizer (counter/todo; BEFORE→ACTION→UPDATE→AFTER→RENDER→UI; history and time-travel). Hooks Lab (useState; useEffect mount/deps/cleanup log). | – |
| 11 | **Routing Visualizer** | nested MemoryRouter with /home /about /dashboard /profile /settings (+ param + 404). Pipeline CURRENT→ACTION→ROUTER→MATCH→COMPONENT, plus history stack. | – |
| 12 | **Execution Trace** ★ | trace list, flow-graph view, step detail drawer (request/server/db/state panels), timeline (waterfall) view, filter by module. Plus a guided "Full-stack Form" scenario that produces a complete 11-step trace. | yes |
| 13 | **Projects** | CRUD + rename + open-in-playground. Types: web / canvas / jsx | yes |
| 14 | **Learn** | Activity history, progress per concept, **Assessments** (MCQ, T/F, output-prediction, find-the-error, match), results with explanations and recommended labs | yes |

## 3. Primary User Flow (demo script)
Register/Login → Dashboard → **Web Playground**: edit, Run, view the preview → "Inspect in DOM Explorer" (the current snapshot is passed along) → click a node, change style → **Event Visualizer**: click a button, watch the pipeline → **Form Lab**: submit → client validation → async request → **AJAX Monitor** shows it → **Server Lab** step view → **Database Lab** shows the row inserted → **Component Studio**: tree, props flow → **State**: increment, re-render highlight → **Routing**: navigate → **Execution Trace**: open the trace of that form submission and click through all 11 steps → **Assessment** → score → back to the Playground, **Save as Project**.

Cross-module links make it one product, not separate demos:
- Each module has a "View trace" button.
- The Playground has "Inspect DOM".
- Every module has a "Take related quiz" button.
- The Dashboard shows recent activity.

## 4. ER Design

```
users 1──* projects 1──* project_files
users 1──* experiments_log (activity)        experiments (catalog) 1──* experiments_log
users 1──* traces 1──* trace_steps
users 1──* quiz_attempts 1──* attempt_answers *──1 quiz_questions *──1 quizzes
quiz_questions 1──* question_options
users 1──* user_progress *──1 concepts ; experiments *──1 concepts ; quizzes *──1 concepts
users 1──* lab_contacts   (Database-Lab sandbox data, isolated per user)
users 1──* lab_files      (metadata for File-Lab files on disk)
```

## 5. Database Schema (`database/schema.sql`, InnoDB, utf8mb4)
- `users` — id PK, name, email UNIQUE, password_hash, role ENUM('student','admin') default 'student', created_at, last_login_at
- `concepts` — id, slug UNIQUE, title, category ENUM('html','css','js','dom','ajax','php','sql','react','routing')
- `projects` — id, user_id FK→users ON DELETE CASCADE, title, type ENUM('web','canvas','jsx'), description, created_at, updated_at; INDEX(user_id, updated_at)
- `project_files` — id, project_id FK CASCADE, filename, language, content MEDIUMTEXT, UNIQUE(project_id, filename)
- `experiments` — id, slug UNIQUE, module, title, concept_id FK
- `experiment_runs` — id, user_id FK, experiment_id FK, status ENUM('success','error'), input_json JSON, created_at; INDEX(user_id, created_at)
- `traces` — id, trace_uid CHAR(36) UNIQUE, user_id FK, module, label, status, total_ms, created_at; INDEX(user_id, created_at)
- `trace_steps` — id, trace_id FK CASCADE, seq, layer ENUM('ui','dom','event','validation','network','server','database','state','render','router'), name, started_ms, duration_ms, detail_json JSON; INDEX(trace_id, seq)
- `quizzes` — id, slug, title, concept_id FK, difficulty
- `quiz_questions` — id, quiz_id FK, type ENUM('mcq','true_false','output','find_error','match'), prompt, code_snippet TEXT NULL, explanation, payload_json JSON (match pairs / correct answer key — **never sent to the client before submission**)
- `question_options` — id, question_id FK, label, is_correct
- `quiz_attempts` — id, user_id FK, quiz_id FK, score, max_score, started_at, submitted_at
- `attempt_answers` — id, attempt_id FK CASCADE, question_id FK, answer_json JSON, is_correct
- `user_progress` — user_id FK, concept_id FK, mastery TINYINT 0–100, experiments_done, last_activity_at; PK(user_id, concept_id)
- `lab_contacts` — id, user_id FK CASCADE, name, email, age, city, created_at
- `lab_files` — id, user_id FK, filename, size_bytes, created_at, updated_at; UNIQUE(user_id, filename)
- `database/seed.sql` — concepts, experiments catalogue, around 6 quizzes with about 40 questions, and a demo user.

## 6. REST API (`/api/...`, JSON, session cookie + `X-CSRF-Token` header on mutating requests)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/csrf` |
| Projects | `GET /projects`, `POST /projects`, `GET /projects/{id}`, `PUT /projects/{id}` (files+title), `PATCH /projects/{id}` (rename), `DELETE /projects/{id}` |
| Server Lab | `GET /lab/server/experiments`, `POST /lab/server/run/{slug}` → `{output, steps, source}` |
| Forms | `POST /lab/forms/validate` (server-side rules → field errors + steps) |
| Sessions | `POST /lab/session/login`, `GET /lab/session/state` (sanitized: id hash prefix, created, last activity, custom vars), `POST /lab/session/set`, `POST /lab/session/destroy` |
| Files | `GET /lab/files`, `POST /lab/files` (create), `PUT /lab/files/{name}` (write), `POST /lab/files/{name}/append`, `GET /lab/files/{name}`, `GET /lab/files/{name}/info`, `DELETE /lab/files/{name}` |
| Database Lab | `GET /lab/db/contacts`, `POST`, `PUT /{id}`, `DELETE /{id}`, `POST /lab/db/reset` — each response carries `meta.sql` {statement, params, rowsAffected, ms} |
| AJAX demo | `GET /demo/echo`, `GET /demo/users?delay=&fail=`, `POST /demo/echo`, `GET /demo/status/{code}` |
| Traces | `GET /traces?module=`, `GET /traces/{uid}`, `POST /traces` (client spans + server spans merged), `DELETE /traces/{uid}` |
| Learning | `GET /activity`, `POST /activity`, `GET /progress`, `GET /stats/dashboard` |
| Quizzes | `GET /quizzes`, `GET /quizzes/{slug}` (no answers), `POST /quizzes/{slug}/attempts` → graded results + explanations + recommended concepts, `GET /attempts` |

## 7. React Component Architecture
- **Providers:** `ThemeProvider` (dark/light, persisted), `AuthProvider`, `TraceProvider` (TraceBus + current trace), `ToastProvider`.
- **Layout:** `AppShell` = `Sidebar` (collapsible, grouped nav) + `Topbar` (command palette Ctrl+K, theme toggle, user menu, live trace indicator) + `<Outlet/>`. `ProtectedRoute` wraps everything except `/login` and `/register`.
- **Shared UI kit** (`components/ui`): Button, IconButton, Card, Tabs, SplitPane (resizable), Panel, Badge, StatusDot, Tooltip, Modal, Drawer, CodeBlock, JsonViewer, EmptyState, ErrorState, Skeleton, KeyValueTable.
- **Visualization primitives** (`visualizers/`): `FlowPipeline` (vertical/horizontal stages, active highlight, clickable), `TreeView` (keyboard navigable, ARIA tree), `Waterfall`, `DataEdge` (props arrow).
- **Engine pieces:**
  - `sandbox/SandboxFrame` + `sandbox/bridge.js` (injected runtime for console capture, error capture, DOM serialization and event taps)
  - `trace/TraceBus`, `trace/useTracedState`, `trace/tracedFetch`
  - `editor/CodeEditor` (a CM6 wrapper)
- **Hooks:** `useApi` (loading/success/error/empty), `useDebounce`, `useLocalDraft`, `useUndoRedo`.
- **Modules:** one folder per nav section, each lazy-loaded with `React.lazy` + `Suspense`.

## 8. Folder Structure
```
webforge/
├── frontend/                 Vite + React 18 (JS)
│   ├── src/{app,layouts,pages,modules/<module>/,components/ui,visualizers,
│   │        trace,sandbox,editor,hooks,services,utils,styles}
│   ├── vite.config.js        (proxy /api → http://localhost/webforge/backend/public)
│   └── package.json
├── backend/
│   ├── public/index.php      front controller (only web-exposed dir) + .htaccess
│   ├── config/               config.php reads .env (gitignored); .env.example
│   ├── src/{Core(Router,Request,Response,Db,Session,Csrf,Validator,ServerTracer),
│   │        Middleware,Controllers,Services,Repositories,Experiments}
│   └── storage/{sandbox,logs}  (outside web root, gitignored)
├── database/{schema.sql,seed.sql}
├── docs/                     architecture, API, viva notes, screenshots
└── README.md
```
**Dependencies (justified):**
- Frontend: `react`, `react-dom`, `react-router-dom`, `@uiw/react-codemirror` + `@codemirror/lang-{html,css,javascript}`, `sucrase` (JSX→JS, ~200KB, client-only), `lucide-react` (icons).
- Dev: `vitest`, `@testing-library/react`, `playwright`.
- Styling: plain CSS with design tokens and CSS Modules. No Tailwind/UI framework, so the stack stays as you specified.
- Backend: no Composer dependencies. PHPUnit is optional for tests.

## 9. UI Wireframes
- **Visual language:** a developer tool in the style of VS Code or Chrome DevTools.
  - Neutral slate surfaces with an indigo→cyan accent gradient, used sparingly.
  - Fonts: Inter for UI, JetBrains Mono for code.
  - 8px spacing grid, 1px borders, layer colour-coding reused everywhere: network = blue, server = violet, DB = amber, state = green, DOM = pink.
- **Dashboard:** hero strip with greeting, streak and stats. Quick-launch grid of 8 cards (icon, name, one-line description). A two-column lower area with Recent Projects, Recent Activity timeline, Concept Progress bars, and Execution stats (last traces with mini waterfalls).
- **Web Playground:** a 3-column resizable split (Files | Editor tabs | Preview with device toggle and refresh). The bottom dock has Console | Errors | DOM tabs. The toolbar holds Run (Ctrl+Enter), Reset, Save, and Auto-run.
- **Lab pages share a template:** a header with title, concept chips, "View Trace" and "Quiz" buttons; a left **Control panel** with inputs and presets; a centre **Visualization** (FlowPipeline/tree); a right **Inspector**. On narrow screens the panels stack into tabs.
- **Execution Trace:** a trace list on the left; a centre layered flow graph (lanes by layer) that can switch to a waterfall; a right detail drawer for the selected step (Request/Response tabs, SQL, state diff, JSON viewer).
- **Assessment:** one question per card with a progress bar and code blocks. The result screen shows a score ring, the review list with explanations, and "Recommended labs" links.

## 10. Development Roadmap (each phase ends with run → test → fix → integration check → commit)
| Phase | Deliverable |
|---|---|
| 1 | This design (current). Then: XAMPP setup on D:, repo scaffold, schema.sql + seed.sql |
| 2 | Vite/React setup, router, AppShell, theme, UI kit, auth pages + PHP auth core (Router, Db, Session, CSRF), Dashboard (real stats endpoint) |
| 3 | CodeEditor, SandboxFrame + bridge, Web Playground (console/errors/device toggle, local draft) |
| 4 | JS Playground, DOM Explorer, Event Visualizer, Form Validation Lab (client side) |
| 5 | apiClient + AJAX Monitor + demo endpoints, Canvas Studio |
| 6 | Server Lab experiments, Form server validation, Sessions, File Lab, Database Lab |
| 7 | Component registry, Component Studio, JSX Playground, Props Visualizer |
| 8 | State Visualizer, Hooks Lab, Routing Visualizer |
| 9 | TraceBus end-to-end, ServerTracer merge, Trace UI, "Full-stack Form" scenario |
| 10 | Projects CRUD (Playground/Canvas save), Activity/Progress, Assessments |
| 11 | Security hardening pass, tests, a11y audit, responsiveness, perf (lazy routes, memo) |
| 12 | README, docs/, screenshots, viva notes, final polish |

## 11. MVP vs Advanced
- **MVP (must work for the demo):**
  - Auth and the Dashboard
  - Web Playground and the DOM Explorer
  - Event Visualizer, Form Lab, AJAX Monitor
  - Database Lab, Sessions, File Lab, plus 4 Server experiments
  - Component Studio, Props, State
  - Routing Visualizer
  - Execution Trace for the form scenario plus generic API calls
  - Projects CRUD, 3 quizzes
- **Advanced (if time allows):**
  - Trace waterfall and comparison of two traces
  - State time-travel
  - Canvas save to project
  - Ctrl+K command palette
  - Export a trace as JSON
  - Admin role for quiz authoring
  - All 10 server experiments
  - Match-type questions
  - Concept mastery recommendations

## 12. Testing Strategy
- **Frontend unit tests** (Vitest): validators, TraceBus span ordering, undo/redo, DOM serializer, quiz grading helpers.
- **Component tests** (RTL): FlowPipeline highlighting, TreeView keyboard nav, ProtectedRoute redirect.
- **Backend:** PHPUnit for the Validator, Router, experiments, FileService path guard and quiz grader. An API smoke script (`backend/tests/smoke.php`, or a Node script) hits every endpoint and checks the response envelope.
- **E2E** (Playwright): the full demo script from §3.
- **Manual checklist** for each phase: keyboard-only pass, dark/light, 375px width, console free of errors.

## 13. Security Strategy
- **Passwords:** `password_hash` (bcrypt or argon2id) and `password_verify`. Brute-force throttling is stored per session + IP.
- **Sessions:**
  - Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` when on HTTPS, `use_strict_mode`.
  - `session_regenerate_id` on login; full destruction on logout; idle timeout.
- **CSRF:** a synchronizer token in the session, required in the `X-CSRF-Token` header for every non-GET request.
- **SQL:** PDO with only prepared statements and `ATTR_EMULATE_PREPARES=false`. In the Database Lab, the "SQL panel" text is generated from the statement template. The user never writes SQL.
- **Authorization:** every repository query is scoped by `user_id`. Ownership is checked on projects, traces and lab data.
- **Input:** a server-side Validator for every endpoint, with length limits, a JSON body size cap and type coercion.
- **Output:** JSON only, with the `Content-Type` and `X-Content-Type-Options: nosniff` headers. React escapes text by default. `dangerouslySetInnerHTML` is never used outside the sandbox.
- **File Lab:**
  - Filenames must match `^[a-zA-Z0-9_-]{1,40}\.txt$`.
  - Each user gets their own directory under `storage/sandbox/{userId}` (outside the web root).
  - `realpath` prefix check; quota of 20 files at 64KB each.
  - No uploads of executable types.
- **Code execution:** user code runs only in sandboxed iframes with `connect-src 'none'`, plus timeouts and loop-guard injection in the JS Playground. There is no `eval` on the server. Server experiments are a fixed class whitelist.
- **Secrets:** `.env` stays outside the web root and is gitignored. The frontend holds no keys. Apache serves only `backend/public`.
- **Headers:** CSP on the SPA, `X-Frame-Options` for the app (sandbox frames use srcdoc), `Referrer-Policy`.

## 14. Deployment Strategy (all on D:)
- **Local dev setup:**
  - XAMPP is installed to **`D:\xampp`** (Apache, PHP 8.2, MariaDB; MariaDB's datadir defaults to `D:\xampp\mysql\data`).
  - The project is exposed through an Apache Alias, `/webforge/api` → `D:\Semester 5\Web Programming\WebForge\backend\public`. Copying the project into htdocs is avoided.
  - npm cache goes on D: (`npm config set cache "D:\npm-cache"`), so `npm install` doesn't write to `%LocalAppData%` on C:. Vite's cache already sits inside `frontend/node_modules`.
  - Playwright browsers go on D: (`PLAYWRIGHT_BROWSERS_PATH=D:\pw-browsers`).
  - During development, Vite runs on :5173 and proxies `/api` to Apache.
- **Production/demo:**
  - `npm run build` → `frontend/dist`, served by the same Apache vhost. SPA fallback rewrite goes to `index.html`, and `/api` goes to the PHP front controller (same origin, so no CORS).
  - A one-command DB setup: `mysql < schema.sql && mysql < seed.sql`.
  - A README section for a clean-machine install.

## Verification (Phase 1 exit, after approval)
- The XAMPP Apache and MySQL services start from D:.
- `schema.sql` and `seed.sql` import without errors.
- `GET /api/health` returns `{ok:true, db:"connected"}` through the Vite proxy.
- `npm run dev` renders the shell.

Each later phase is verified with its own checklist, plus Playwright from Phase 2 onward.
