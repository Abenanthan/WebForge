# Testing

| Suite | Tool | Tests | Command | Needs |
|---|---|---|---|---|
| Backend unit | own PHP harness | 23 | `php backend/tests/run.php` | PHP only |
| API security | own PHP harness + curl | 12 | `php backend/tests/api-security.php` | Apache + MySQL |
| Frontend unit / component | Vitest + Testing Library | 62 | `cd frontend && npm test` | Node |
| End-to-end | Playwright (Chromium) | 54 (+1 deployment smoke test) | `cd frontend && npm run e2e` | Apache + MySQL + preview server |

How to run them, including the environment variables for Playwright: [setup.md §6](setup.md#6-tests).

## Backend
The backend has no Composer dependencies, so its tests use a tiny harness (`backend/tests/lib.php`):
a suite is a PHP file returning `['test name' => fn() => ...]`, with `eq`, `ok` and `throwsHttp` assertions.

- **`unit/ValidatorTest.php`**: trimming and whitelisting, per-field messages, type checks, name and password rules, `in` whitelists, rule-by-rule reports.
- **`unit/QuizGraderTest.php`**: all five question types, including foreign option ids, normalised text answers and malformed matching answers.
- **`unit/CoreTest.php`**: trace ids, failing steps, router parameters, 404 vs 405, **every non-public route requires login**, no duplicate routes.
- **`api-security.php`** (live, against Apache): security headers, cookie flags, every protected route rejects anonymous requests (all 47), CSRF, cross-user isolation on every resource type, SQL injection, path traversal, body limits, answer-key secrecy, login throttling, registration rate limit. It creates a throw-away second user and deletes everything it created.

## Frontend unit and component tests (`frontend/src/**/*.test.js(x)`)
| File | Covers |
|---|---|
| `services/apiClient.test.js` | Envelope handling, CSRF header and retry, error mapping, which 401s log the user out |
| `trace/traceBus.test.js` | Step ordering, server/client time alignment, detail clipping, network + server steps from `apiRequest`, traces from logged requests |
| `sandbox/sandbox.test.js` | Sandbox document: CSP and bridge injected before user markup; syntax errors with line and column; the infinite-loop guard (including a real infinite loop); unlinked, missing and external files |
| `sandbox/traceInstrument.test.js` | Execution recording: declarations and changes with values, conditions, loop checks, calls and returns, closures, in-place mutations, syntax errors |
| `modules/component-studio/jsx/jsxCompiler.test.js` | JSX compilation (elements, components, fragments, keyed lists, whitespace, attributes) and every blocked construct (19 tests) |
| `modules/canvas-studio/canvasOps.test.js` | Undo/redo history, shape operations |
| `components/RouteGuards.test.jsx` | Login redirect and return to the requested page |
| `visualizers/visualizers.test.jsx` | Flow pipeline status announcements; tree keyboard navigation (WAI-ARIA tree pattern) |
| `utils/validation.test.js` | Client-side validation rules (mirroring the server's) |

## End-to-end (`frontend/e2e`)
Real browser, real PHP, real MySQL. Each phase of the build has a spec:

| Spec | Covers |
|---|---|
| `phase2-auth-dashboard` | Register, login, logout, session, dashboard, theme, mobile drawer |
| `phase3-web-playground` | Editing, live preview, console, errors with line numbers, save/reload project, unsaved-changes guard |
| `phase4-labs` | JS Playground stepping, DOM Explorer picking and mutations, Event Visualizer flow, Form Lab client vs server |
| `phase5-ajax-canvas` | AJAX Monitor (request, response, server trace, cancel), Canvas Studio drawing, undo, save as PNG |
| `phase6-server-database` | PHP experiments, form processing (XSS escaped), sessions, file handling, database CRUD with SQL panel |
| `phase7-component-studio` | Component tree inspector, render reasons, `React.memo`, JSX playground, props flow |
| `phase8-state-routing` | State updates, batching, bail-outs, time travel; hooks lifecycle; routing, params, guards, history |
| `phase9-execution-trace` | Full-stack form trace (every layer), client/server validation paths, explorer, AJAX Monitor link |
| `phase10-projects-learn` | Projects CRUD, JSX projects, quizzes (perfect and partial), progress, history |
| `phase11-quality` | **WCAG 2.1 AA** (axe-core) on every page in both themes plus dialogs and results; no sideways scrolling at 360/768/1280 px; skip link |
| `phase11-performance` | JavaScript budget per page on a cold load |
| `deployment` | The Apache build at `/webforge/` (skipped unless `WEBFORGE_APACHE_URL` is set) |

Tests clean up what they create (projects, lab rows, temporary users), so the suite can be run
repeatedly against the demo account. The full suite takes about 7 minutes.

## Manual checks done for each phase
Keyboard-only use, light and dark themes, phone width (390 px), no console errors, and the new
features exercised by hand in the running app.
