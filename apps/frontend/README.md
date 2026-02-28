# Frontend

React-Anwendung (Vite, TypeScript) für die interne Dokumentationsplattform. Abschnitt 6 (Frontend-Basis): Mantine, React Router, TanStack Query, Layout, Login, Platzhalter-Seiten, eine Liste (Firmen).

- **Dev:** `pnpm run dev` (Port 5173) oder im Stack: `docker compose up` (Zugriff über http://localhost:4000, Caddy routet `/` hierher).
- **Build:** `pnpm run build` → `dist/`.
- **API:** Gleiche Origin (Szenario B); `VITE_API_URL` leer oder weglassen.
