# WebForge API Reference

Base URL: `/api` (development and preview, proxied by Vite) or `/webforge/api` (Apache deployment).
The route table lives in [`backend/src/routes.php`](../backend/src/routes.php); 52 endpoints in total.

## Conventions

### Response envelope
Every endpoint returns the same JSON shape, success or failure:

```json
{
  "ok": true,
  "data": { "...": "endpoint-specific" },
  "error": null,
  "meta": {
    "status": 200,
    "traceId": "2f6c3b1e-...-uuid",
    "durationMs": 12.4,
    "trace": [
      { "layer": "server",   "name": "Request received",          "startedMs": 0.1,  "durationMs": 0.0, "status": "success", "detail": {} },
      { "layer": "database", "name": "SELECT projects with file stats", "startedMs": 3.2, "durationMs": 1.9, "status": "success",
        "detail": { "sql": "SELECT ... WHERE p.user_id = ? ...", "params": [1] } }
    ]
  }
}
```

On failure `ok` is `false`, `data` is `null` and `error` is `{ "code", "message", "fields" }`.
`fields` maps input names to messages for validation errors (422).

`meta.trace` lists the real server-side steps: validation, each SQL statement with its bound parameters,
and the response. The Execution Trace merges these with the browser's own steps.
The Database Lab endpoints also return `meta.sql` (statement, parameters, rows affected, time).

### Headers
| Request header | Purpose |
|---|---|
| `X-CSRF-Token` | Required on every non-GET request. Get it from `GET /auth/csrf` or `GET /auth/me`. |
| `X-Trace-Id` | Optional UUID. The server reuses it as `meta.traceId`, so client and server steps share one id. |
| `Content-Type: application/json` | Request bodies are JSON (3 MB limit). |

Every response also carries `X-Trace-Id`, `Cache-Control: no-store` and security headers
(`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`).

### Authentication
Session cookie (`WEBFORGE_SID`, HttpOnly, SameSite=Lax). All endpoints except the five public ones
below require a logged-in user; every query is scoped to that user, and other users' records
answer **404** (their existence is never revealed).

### Common errors
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_JSON` | Body is not a JSON object |
| 401 | `UNAUTHENTICATED` / `SESSION_EXPIRED` | Not logged in / idle timeout (60 min) |
| 403 | `CSRF_INVALID` | Missing or wrong `X-CSRF-Token` |
| 404 | `NOT_FOUND`, `PROJECT_NOT_FOUND`, `TRACE_NOT_FOUND`, … | Unknown route or record (or another user's) |
| 405 | `METHOD_NOT_ALLOWED` | Path exists, method does not |
| 409 | `EMAIL_TAKEN`, `TRACE_EXISTS` | Conflict |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 3 MB |
| 422 | `VALIDATION_FAILED`, `QUOTA_EXCEEDED` | Invalid input (see `fields`), lab quota reached |
| 429 | `TOO_MANY_ATTEMPTS`, `TOO_MANY_REQUESTS` | Login throttling, rate limits (`Retry-After: 60`) |
| 503 | `DATABASE_UNAVAILABLE` | MySQL is down |

### Rate limits
| Action | Limit | Per |
|---|---|---|
| Failed logins | 5 per email, 20 per IP in 15 minutes | email / IP |
| Register | 10 per hour | IP address |
| Save trace | 120 per 10 minutes | user |
| Submit quiz | 40 per 10 minutes | user |
| Create/save project | 120 per 10 minutes | user |

---

## Public endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API and database status, catalogue counts. Stateless (no session cookie). |
| GET | `/auth/csrf` | `{ csrfToken }` for this session. |
| GET | `/auth/me` | `{ user \| null, csrfToken, sessionExpired }`. Called when the app starts. |
| POST | `/auth/register` | `{ name, email, password }` → 201 `{ user, csrfToken }`, logged in. Password: 8–72 chars, upper, lower, digit, symbol. |
| POST | `/auth/login` | `{ email, password }` → `{ user, csrfToken }`. Regenerates the session id. |

## Account and dashboard
| Method | Path | Description |
|---|---|---|
| POST | `/auth/logout` | Destroys the session. |
| GET | `/stats/dashboard` | Totals, recent projects, recent activity, mastery by category, recent traces. |

## Projects
| Method | Path | Description |
|---|---|---|
| GET | `/projects` | Your projects with file count and size. |
| POST | `/projects` | `{ title, type: web\|canvas\|jsx, description?, files: [{ filename, content }] }` → 201. |
| GET | `/projects/{id}` | One project with its files. |
| PUT | `/projects/{id}` | Full save: `{ title, description?, files }` (files are replaced). |
| PATCH | `/projects/{id}` | Rename: `{ title, description? }`. |
| DELETE | `/projects/{id}` | Delete the project and its files. |

File rules: at most 10 files; names `[A-Za-z0-9_-]{1,40}` + `.html .css .js .jsx .png`; text ≤ 256 KB;
PNG only as a base64 data URL ≤ 2 MB.

## AJAX Monitor demo endpoints
| Method | Path | Description |
|---|---|---|
| GET POST PUT PATCH DELETE | `/demo/echo` | Echoes method, query, headers and body. `?delay=ms` (≤ 3000) really sleeps; `?fail=1` raises a real server error. |
| GET | `/demo/concepts` | `?search=&limit=` (1–20): searches the concept catalogue with a prepared `LIKE`. |
| GET | `/demo/status/{code}` | Responds with the chosen HTTP status (one of 200, 201, 400, 401, 403, 404, 409, 422, 429, 500, 503) and its meaning. |

## Labs
### Form Validation Lab
| Method | Path | Description |
|---|---|---|
| POST | `/lab/forms/validate` | Server-side validation of the registration form: rule-by-rule report, duplicate-email database check. |

### Server Lab
| Method | Path | Description |
|---|---|---|
| GET | `/lab/server/experiments` | The fixed PHP experiments (variables, operators, conditions, loops, arrays, strings, functions) with their source. |
| POST | `/lab/server/run/{slug}` | Runs one experiment with validated inputs → `{ output, steps }`. Never runs user code. |
| POST | `/lab/server/form` | Processes a form the way a PHP page does: sanitising, validation, `htmlspecialchars` output. |
| GET | `/lab/session/state` | The Session Demonstrator's own session (`WEBFORGE_LAB_SID`): id prefix, created, last seen, data. |
| POST | `/lab/session/login` | Logs into the lab session (separate from your WebForge login). |
| GET | `/lab/session/protected` | A "members-only page": 401 unless logged into the lab session. |
| POST | `/lab/session/data` | `{ key, value }` stored in `$_SESSION`. |
| POST | `/lab/session/logout` | Destroys the lab session. |
| GET | `/lab/files` | Files in your sandbox folder. |
| POST | `/lab/files` | `{ name, content }`: create (fails if it exists, like `fopen($f, 'x')`). |
| GET | `/lab/files/{name}` | Read a file. |
| PUT | `/lab/files/{name}` | Overwrite (`'w'` mode). |
| POST | `/lab/files/{name}/append` | Append (`'a'` mode). |
| DELETE | `/lab/files/{name}` | Delete (`unlink`). |

File Lab rules: names `[A-Za-z0-9_-]{1,40}.txt`; at most 20 files of 64 KB each; one folder per user
under `backend/storage/sandbox/` (outside the web root, checked with `realpath`).

### Database Lab
| Method | Path | Description |
|---|---|---|
| GET | `/lab/db/contacts` | `?search=&city=&minAge=&sort=name\|age\|city\|created&dir=asc\|desc` → `{ rows }`. |
| POST | `/lab/db/contacts` | `{ name, email, age?, city? }` → 201 `{ id, row }` (at most 50 rows per user). |
| PUT | `/lab/db/contacts/{id}` | Update a row. |
| DELETE | `/lab/db/contacts/{id}` | Delete a row. |
| POST | `/lab/db/reset` | Replace your rows with the five sample contacts (one transaction). |

Each response includes `meta.sql`: the prepared-statement template, bound parameters, rows affected and timing.

## Execution Trace
| Method | Path | Description |
|---|---|---|
| GET | `/traces` | `?module=`: your 50 newest traces with step counts and layers, plus `modules` (for the filter). |
| POST | `/traces` | `{ traceId, module, label, status, steps: [{ layer, name, startedMs, durationMs, status?, detail? }] }` → 201. 1–80 steps, detail ≤ 16 KB each. 409 if already saved. |
| GET | `/traces/{uid}` | One trace with all steps in order. |
| DELETE | `/traces/{uid}` | Delete a trace. |

Layers: `ui event validation state render dom router network server database`. Each user keeps their newest 100 traces.

## Learn & Assess
| Method | Path | Description |
|---|---|---|
| GET | `/quizzes` | The six quizzes with your attempts and best score. |
| GET | `/quizzes/{slug}` | Questions **without answer keys**: options for multiple choice, true/false and find-the-error; left/right lists for matching. |
| POST | `/quizzes/{slug}/attempts` | `{ answers: { "<questionId>": answer }, durationSec? }` → 201 graded review and recommended labs. Answers: option id (number), text (output questions) or an array of right-hand indices (matching). |
| GET | `/attempts` | Your 50 latest attempts. |
| GET | `/attempts/{id}` | Full review of one attempt. |
| GET | `/activity` | `?kind=experiment\|assessment\|project\|trace&page=`: timeline, 25 per page, `hasMore`. |
| GET | `/progress` | Mastery (0–100) for each of the 20 concepts, recomputed from your experiments and latest quiz answers. |
| POST | `/experiments/{slug}/runs` | `{ status: success\|error, input? }`: records that you ran a lab experiment (input ≤ 4 KB). |

## Example
```bash
# Log in and list projects with curl (cookie jar + CSRF token)
curl -c jar -b jar http://localhost/webforge/api/auth/csrf
curl -c jar -b jar -H "X-CSRF-Token: <token>" -H "Content-Type: application/json" \
     -d '{"email":"demo@webforge.local","password":"Demo@1234"}' http://localhost/webforge/api/auth/login
curl -b jar http://localhost/webforge/api/projects
```
