# WebForge Security

WebForge deliberately runs code that users write, so security is part of the design, not an add-on.
Every control below is enforced in code and most are checked by an automated test
(`backend/tests/api-security.php`, `backend/tests/unit/CoreTest.php`, the e2e suite).

## Threats and controls

| Threat | Control | Where | Tested by |
|---|---|---|---|
| **User code attacking the app** (stealing the session, calling the API, reading data) | User HTML/CSS/JS runs only in `<iframe srcdoc sandbox="allow-scripts allow-modals">`: no same-origin access, no forms, popups or top navigation; its own CSP blocks all network access (`connect-src 'none'`) | `frontend/src/sandbox/` | `sandbox.test.js`, e2e |
| Forged messages between page and sandbox | `postMessage` handlers accept only the expected window (`event.source`) and run id | `SandboxFrame.jsx`, `inspectorRuntime.js` | e2e |
| Unsafe JSX in the JSX Playground (which renders in the app itself) | Single-expression whitelist compiler: no statements, assignments, `new`, `this`, unknown globals, `<script>`/`<iframe>`, `dangerouslySetInnerHTML`, `constructor`/`__proto__` | `jsxCompiler.js` | `jsxCompiler.test.js` |
| **Running arbitrary code on the server** | No `eval`, no user code: the Server Lab runs fixed PHP classes with validated inputs | `backend/src/Experiments/` | review |
| **SQL injection** | PDO native prepared statements only (`ATTR_EMULATE_PREPARES=false`); `ORDER BY` columns from a whitelist; `LIKE` wildcards escaped; `LIMIT` values are integers built in code | `Core/Db.php`, controllers | security test "SQL injection payloads are treated as plain data" |
| **XSS** | React escapes all text; no `dangerouslySetInnerHTML` in the app; the API returns JSON only with `Content-Type: application/json`, `X-Content-Type-Options: nosniff` and `CSP: default-src 'none'`; the Server Lab shows `htmlspecialchars` output | frontend, `Response.php` | security test "API responses carry security headers" |
| **CSRF** | Synchronizer token in the session, required in the `X-CSRF-Token` header on every non-GET request (checked before authentication); cookie `SameSite=Lax` | `index.php`, `Session.php` | "logged-in writes without the CSRF token are refused" |
| **Session hijacking / fixation** | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS; strict mode; 48-character ids; new id on login; destroyed on logout; 60-minute idle timeout | `Session.php` | "the session cookie is HttpOnly and SameSite=Lax" |
| **Broken access control** (seeing other users' data) | Every query is scoped by `user_id`; other users' records answer 404, never 403; every route except five public ones requires login | repositories, controllers, `routes.php` | "user B cannot read, change or delete user A's data"; unit test "every route except the public ones requires login" |
| **Password attacks** | bcrypt (`password_hash`), rehash when the algorithm changes; strong-password rule; login throttling (5 failures per email, 20 per IP per 15 min); password check always runs so timing does not reveal whether an email exists | `AuthController.php` | "repeated failed logins are throttled" |
| **Abuse / resource exhaustion** | Rate limits: registration 10/hour/IP; trace saves, quiz submissions and project saves per user per 10 min; 3 MB request limit; per-user quotas (50 lab rows, 20 lab files of 64 KB, 10 project files, 100 traces) | `RateLimiter.php`, controllers | "registration is rate limited per address", "oversized and malformed bodies are refused" |
| **Path traversal** in the File Lab | Names must match `^[A-Za-z0-9_-]{1,40}\.txt$`; each user has a folder outside the web root; `realpath` must stay inside it | `FileLabController.php` | "file names cannot escape the per-user sandbox" |
| **Cheating in assessments** | Answer keys never leave the server before grading; grading happens on the server | `QuizController.php` | "quiz questions never reveal their answer keys" |
| **Leaking internals** | Errors are logged server-side; outside development the client gets a generic message; `config/`, `src/` and `storage/` are not web-reachable (only `backend/public` is aliased) | `index.php`, Apache config | manual check: traversal requests return the app's HTML, never `.env` |
| **Clickjacking / embedding** | `X-Frame-Options: DENY`, `frame-ancestors 'none'` on the API and the app; `Cross-Origin-Resource-Policy: same-origin` on the API | `Response.php`, `public/.htaccess` | security header test |
| **Secrets in the repository** | `.env` is git-ignored; only `.env.example` is committed; the frontend holds no secrets | `.gitignore` | review |
| **Vulnerable dependencies** | Few dependencies; `npm audit` reports 0 vulnerabilities (Phase 11) | `package.json` | `npm audit` |

## Content-Security-Policy of the app
```
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; connect-src 'self'
```
It does not restrict scripts, styles or images on purpose: sandboxed `srcdoc` iframes inherit the
page's policy, and the labs must be able to run the user's inline scripts and load images. The
sandbox adds its own, much stricter policy on top (no network, no forms, no `<base>`), and the
browser applies both.

## Known limitations
- `Require local` in the Apache config limits access to the same machine (it is a lab/demo setup).
  A public deployment also needs HTTPS and a dedicated MySQL user.
- Registering with an email that already exists says so (helpful for students; it reveals that the
  email has an account). Rate limiting slows down probing.
- Rate limits use the client IP as Apache sees it; behind a reverse proxy this would need trusted
  forwarding headers.
