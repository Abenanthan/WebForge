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

## 5. Frontend (from Phase 2)
The repository `.npmrc` sends the npm cache to `D:\npm-cache`.
```powershell
cd frontend
npm install
npm run dev     # http://localhost:5173, proxies /api -> http://localhost/webforge/api
```
