# WebForge — Local Setup (Windows, everything on D:)

## 1. Install XAMPP to D:
1. Download the XAMPP **8.2.x** installer for Windows from apachefriends.org.
2. Choose only the components **Apache, MySQL, PHP** (and optionally phpMyAdmin).
3. Set the install folder to **`D:\xampp`**. Nothing is written to C:. MySQL data lives in `D:\xampp\mysql\data`.
4. Add `D:\xampp\php` and `D:\xampp\mysql\bin` to your user PATH (needed for `php` and `mysql` in a terminal).

## 2. Enable required PHP / Apache modules
- `D:\xampp\php\php.ini` must have `extension=pdo_mysql` uncommented. It is by default.
- `D:\xampp\apache\conf\httpd.conf`:
  - Make sure `LoadModule rewrite_module modules/mod_rewrite.so` is uncommented.
  - Add this line at the end:
    ```
    Include "D:/Semester 5/Web Programming/WebForge/backend/config/apache-webforge.conf"
    ```
- Start **Apache** and **MySQL** from `D:\xampp\xampp-control.exe`.

## 3. Configure and create the database
```powershell
cd "D:\Semester 5\Web Programming\WebForge"
copy backend\config\.env.example backend\config\.env   # edit DB_PASS if you set one
php backend\bin\setup.php
```
Expected output:
```
✔ Imported database/schema.sql
✔ Imported database/seed.sql
✔ Demo user: demo@webforge.local / Demo@1234
✔ Catalogue: 20 concepts, 36 experiments, 6 quizzes, 39 questions, 91 options
✔ Storage directories ready
```

## 4. Check the API
Open http://localhost/webforge/api/health. You should get:
```json
{ "ok": true, "data": { "db": "connected", ... }, "meta": { "traceId": "...", "trace": [ ... ] } }
```

## 5. Frontend
`frontend/.npmrc` sends the npm cache to `D:\npm-cache`. Run npm from inside `frontend/`, because npm only reads the `.npmrc` in the package folder.
```powershell
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api -> http://localhost/webforge/api
```
Open http://localhost:5173 and log in with **demo@webforge.local / Demo@1234**, or register a new account.

> **Blank page after pulling or installing packages?** If the browser console shows `504 (Outdated Optimize Dep)`, the running dev server has a stale dependency cache. Stop it (Ctrl+C) and start it again with `npm run dev -- --force`.

## 6. Tests
```powershell
cd frontend
npm test                                   # unit/component tests (Vitest)

# End-to-end (Playwright). Browsers live on D:, so set this once per terminal:
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\pw-browsers"
npx playwright install chromium            # first time only
npm run e2e                                # needs Apache + MySQL + `npm run dev` running
# Against a dev server on another port:
$env:WEBFORGE_BASE_URL = "http://localhost:5174"; npm run e2e
```

## Existing databases
`login_attempts` was added in Phase 2. If your database was created before that, add the table without losing data:
```powershell
D:\xampp\mysql\bin\mysql.exe -uroot webforge -e "CREATE TABLE IF NOT EXISTS login_attempts (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ip_address VARCHAR(45) NOT NULL, email VARCHAR(190) NOT NULL, attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_attempts_ip_time (ip_address, attempted_at), KEY idx_attempts_email_time (email, attempted_at)) ENGINE=InnoDB;"
```
(`php backend\bin\setup.php` also creates it, but it **drops and recreates** the whole database.)
