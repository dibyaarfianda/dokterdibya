# Staff Portal Overview

This folder contains the internal (staff) portal: a Node.js/Express backend under `backend/` and a static AdminLTE front-end under `public/`. Development happens entirely on desktop now; all Android-wrapper files were zipped into `android-archive.zip` and the original Gradle project was removed.

## Key directories

- `backend/` – REST API, Socket.IO server, database migrations, and supporting scripts.
- `public/` – AdminLTE dashboard pages, JS modules, CSS overrides, and media assets.
- `docs/` – operational notes (intake structure, secrets, etc.).
- `public/scripts/` – modularized front-end logic (auth handling, medical exam flows, sidebar/mobile helpers).

## Archive locations

All scratch files, experiments, and retired tests are parked under `unused/` folders to keep deployments predictable:

- `public/unused/` – old AdminLTE pages (debug dashboards, manual API testers).
- `unused/` – staff shell helpers (`test-auth-flow.sh`, auth bug writeups, etc.).
- `backend/unused/` – Jest suites, fixtures (`test_intake_data.json`), legacy integration tests, and backup scripts. If you need to run those tests locally, move the folder back temporarily, run them, then return it so the production tree stays lean.
- `backend/unused/scripts/` – archived quick scripts such as `test-quick-id-flow.js` or backup readmes.

Whenever you add a new diagnostic tool, drop it into the matching `unused/` directory and annotate it here so teammates know where to look.

## Shared AdminLTE components

The goal is to keep the sidebar/header markup defined once and reused everywhere:

1. **Sidebar partial** – create `public/partials/sidebar.html` (or a small JS renderer) that contains the `<aside class="main-sidebar">…</aside>` block. All pages should include this partial instead of copying the markup. Preserve existing role/patient toggles (`.superadmin-only`, `.medical-exam-menu`) so scripts like `auth.js` and `medical-exam.js` continue to work.
2. **Header partial** – move the navbar (user avatar, logout button, pushmenu trigger) into the same partials folder so the layout stays consistent across every `kelola-*` page.
3. **Loader script** – add `public/scripts/layout.js` that injects the partials and re-runs AdminLTE’s PushMenu plus `mobile-menu.js` initialization after insertion. This keeps the component sharing strategy encapsulated without server-side templating.

Document any new partials or loaders you add so future contributors know the single source of truth for shared UI pieces.