# WebForge Setup (Windows, everything on D:)

Everything (XAMPP, the database, npm's cache and the test browsers) is installed on **D:**, because
the C: drive of the development machine is full. Paths below assume the project lives in
`D:\Semester 5\Web Programming\WebForge`; adjust them if yours differs.

## 1. Install XAMPP to D:
1. Download the XAMPP **8.2.x** installer for Windows from apachefriends.org.
2. Choose **Apache, MySQL, PHP** (phpMyAdmin is optional).
3. Install to **`D:\xampp`**. MySQL data then lives in `D:\xampp\mysql\data`.
4. Add `D:\xampp\php` and `D:\xampp\mysql\bin` to your user PATH (for `php` and `mysql` in a terminal).

Requirements: PHP 8.2 with `pdo_mysql`, `mbstring`, `curl` (all enabled in XAMPP), MariaDB 10.4+ or
MySQL 8, Node.js 20+.

## 2. Connect Apache to WebForge
Edit `D:\xampp\apache\conf\httpd.conf`:
- Make sure these modules are not commented out: `rewrite_module`, `headers_module`, `alias_module`.
- Add at the end:
  ```
  Include "D:/Semester 5/Web Programming/WebForge/backend/config/apache-webforge.conf"
  ```

That file maps `/webforge/api` to `backend/public` (the only web-visible backend folder) and
`/webforge` to the built app. Start **Apache** and **MySQL** from `D:\xampp\xampp-control.exe`.

## 3. Create the database
```powershell
cd "D:\Semester 5\Web Programming\WebForge"
copy backend\config\.env.example backend\config\.env    # set DB_PASS if your MySQL root has one
php backend\bin\setup.php
```
```
✔ Imported database/schema.sql
✔ Imported database/seed.sql
✔ Demo user: demo@webforge.local / Demo@1234
✔ Catalogue: 20 concepts, 36 experiments, 6 quizzes, 39 questions, 91 options
✔ Storage directories ready
```
`setup.php` **drops and recreates** the `webforge` database. Check it at
http://localhost/webforge/api/health → `{ "ok": true, "data": { "db": "connected", ... } }`.

`backend/config/.env` settings:

| Key | Default | Meaning |
|---|---|---|
| `APP_ENV` | `development` | `production` hides internal error details |
| `APP_BASE_PATH` | `/webforge` | URL prefix of the Apache alias |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | `127.0.0.1` `3306` `webforge` `root` *(empty)* | MySQL connection |
| `SESSION_NAME` | `WEBFORGE_SID` | Session cookie name |
| `SESSION_IDLE_MINUTES` | `60` | Log out after this much inactivity |

### Upgrading an existing database (keeps your data)
| Database created before | Run |
|---|---|
| Phase 11 (no `rate_limit_hits` table) | `mysql -u root < database\upgrade-phase11.sql` |

The upgrade scripts are safe to run more than once.

## 4. Run the app (development)
`frontend/.npmrc` puts npm's cache in `D:\npm-cache`, so run npm from inside `frontend/`.
```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api → http://localhost/webforge/api)
```
Log in with **demo@webforge.local / Demo@1234**, or register an account.

## 5. Run the built app on Apache (demo / production)
```powershell
cd frontend
npm run build:apache  # → frontend/dist-apache (base path /webforge/)
```
Open **http://localhost/webforge/**. The app and the API share one origin, so there is no CORS and
the session cookie works as in development. `dist-apache/.htaccess` sends every client-side route
to `index.html` and adds the security headers.

For a real server: remove `Require local` from `apache-webforge.conf`, set `APP_ENV=production`,
serve over HTTPS (the session cookie is then marked `Secure` automatically) and use a MySQL user
with rights on the `webforge` database only.

## 6. Tests
```powershell
# Backend (from the project root)
php backend\tests\run.php              # unit tests, no server needed
php backend\tests\api-security.php     # live security tests: needs Apache + MySQL

# Frontend unit and component tests
cd frontend
npm test

# End-to-end (Playwright). Browsers live on D:, so set this once per terminal:
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\pw-browsers"
npx playwright install chromium        # first time only
npm run build
npm run preview                        # second terminal: http://localhost:4173
$env:WEBFORGE_BASE_URL = "http://localhost:4173"
npm run e2e

# Optional: smoke-test the Apache deployment
$env:WEBFORGE_APACHE_URL = "http://localhost/webforge"; npx playwright test e2e/deployment.spec.js

# Regenerate the documentation screenshots (needs `npm run preview` running)
npm run screenshots                    # → docs/screenshots/
```
What each suite covers: [testing.md](testing.md).

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| `/api/health` gives 404 | The `Include` line is missing from `httpd.conf`, or Apache was not restarted. |
| `/api/health` says the database is unavailable | Start MySQL in the XAMPP control panel; check `DB_*` in `backend/config/.env`. |
| Blank page in dev, console shows `504 (Outdated Optimize Dep)` | Restart the dev server with `npm run dev -- --force`. |
| "Too many failed login attempts" while testing | Wait 15 minutes, or clear the log: `mysql -u root webforge -e "DELETE FROM login_attempts"` |
| "Too many requests" when registering many test accounts | `mysql -u root webforge -e "DELETE FROM rate_limit_hits"` |
| `npm install` fills C: | Run npm inside `frontend/` so `frontend/.npmrc` (cache on D:) is used. |
| Playwright cannot find a browser | Set `PLAYWRIGHT_BROWSERS_PATH=D:\pw-browsers` in that terminal. |
| Port 5173 or 4173 already in use | Another Vite process is still running; close it (Task Manager → Node.js). |
| http://localhost/webforge/ shows an old version | Run `npm run build:apache` again (it rebuilds `dist-apache`). |
