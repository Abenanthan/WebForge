# WebForge

**An Interactive Web Development, Experimentation and Visualization Platform**

> *Don't just write web code. See how it works.*

WebForge is a browser-based laboratory. Users write, run, inspect and trace modern web technologies, from HTML/DOM events through AJAX, PHP and MySQL to React state and routing. Its signature feature is the **Execution Trace**: it records how one real operation travels through every layer of a web application and shows that path step by step.

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, CodeMirror 6, Vite |
| Backend | PHP 8.2 (no framework), PDO |
| Database | MySQL / MariaDB (XAMPP) |

## Documentation
- [Architecture & design](docs/architecture.md): system architecture, modules, ER design, API, roadmap
- [Local setup](docs/setup.md): XAMPP on D:, database creation, running the app

## Repository layout
```
frontend/   React SPA (Vite): src/ app, layouts, pages, components, services; e2e/ Playwright
backend/    PHP API: public/ is the only web-exposed folder
database/   schema.sql, seed.sql
docs/       design and setup documentation
```

## Status
- [x] Phase 1: architecture, schema, seed data, API core (`/api/health`)
- [x] Phase 2: React shell, routing, auth (sessions, CSRF, throttling), dashboard
- [x] Phase 3: Web Playground (CodeMirror 6, sandboxed live preview, console, problems, projects API)
- [x] Phase 4: JS Playground (execution tracer), DOM Explorer, Event Visualizer, Form Validation Lab
- [ ] Phase 5: AJAX Monitor, Canvas Studio
