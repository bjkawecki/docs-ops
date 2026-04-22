# Frontend `src/` layout

- **`pages/`** — Route screens grouped by domain: `auth/` (login), `account/` (personal, shared, settings, notifications), `catalog/` (catalog, repositories, templates, reviews, legacy processes list), `company/` (company scope + tab modules), `department/` (department redirect + context page), `context/` (context detail, subcontext, legacy redirect), `project/` (project workspace outlet + project context entry), `process/` (process context entry), `team/` (team redirect), `document/` (document route re-export + versions), `misc/` (404). Feature-heavy screens keep co-located modules (e.g. `documentPage/`, `HomePage/`, `admin/`).
- **`components/`** — Feature packages (`appShell/`, `contexts/`, `documents/`, `notifications/`, `trashArchive/`) plus shared layers:
  - **`ui/`** — Reusable presentational pieces (headers, links, table chrome).
  - **`guards/`** — `AuthGuard`, `AdminGuard`.
  - **`system/`** — App-wide infrastructure (`ErrorBoundary`, `ThemeFromPreferences`).

Prefer importing from the leaf module path; add small `index.ts` barrels only where they reduce noise without creating cycles.
