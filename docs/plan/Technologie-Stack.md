# Technologie-Stack

Festgelegter Stack für die interne Dokumentationsplattform. Siehe auch [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md).

---

## 1. Reverse Proxy

- **Einsatz:** Caddy. Übernimmt Port 80/443, terminiert TLS (automatisch ACME), leitet auf die App weiter. Minimale Config (z. B. `reverse_proxy app:8080`).
- **Alternativen** (nur bei Bedarf dokumentieren): nginx, Traefik.

---

## 2. Container (Docker / Podman)

- Laufzeit: **Docker** oder **Podman** (Install-Skript unterstützt beide).
- Orchestrierung: **Docker Compose** / **Podman Compose** (eine `compose.yml` für App, ggf. DB, ggf. Reverse Proxy).
- Details: siehe [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md), Abschnitt 4.

---

## 3. Sprache & Framework (App)

### Backend

- **Runtime:** Node.js (TypeScript). Optional Bun als drop-in-Alternative.
- **Framework:** Fastify. Validierung mit **Zod** (Request-Bodies, Parameter); kein Fastify-JSON-Schema für Request-Input.
- **ORM:** Prisma. Schema in `prisma/schema.prisma`, Migrationen mit `prisma migrate`, generierte Typen teilbar mit Frontend.

### Frontend

- **Framework:** React mit Vite und TypeScript (kein Next.js).

---

## 4. Datenbank & ORM

- **Datenbank:** PostgreSQL 18 (Docker-Image `postgres:18-alpine`). Nutzer, Organisation (Firma/Abteilung/Team), Kontexte, Dokumente, Rechte n:m (vgl. [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md)); Full-Text-Search.
- **Zugriff:** Prisma. `prisma migrate dev` (Entwicklung), `prisma migrate deploy` (Deploy).

---

## 5. Objektspeicher (S3-kompatibel, lokal)

- **Einsatz:** MinIO (Container, S3-API). Anhänge, Bilder, Exporte, ggf. Avatare. Markdown-Inhalte in der DB; Binärdateien in MinIO.

---

## 6. Async Tasks / Job-Queue

- **Einsatz:** pg-boss (PostgreSQL als Queue, kein Redis). Worker für: Volltext-Index, Versionierung/Snapshots, Benachrichtigungen (Slack/Teams), PDF-Export. PDF-Export mit Pandoc im Worker (Markdown → PDF); Ergebnis in MinIO, Download-Link für Nutzer.

---

## 7. Weitere genutzte Technologien

- **Auth:** **Sessions** (Postgres, httpOnly-Cookie); lokaler Login (E-Mail + Passwort), später Passport.js oder Fastify-Plugin mit LDAP/OIDC für SSO.
- **Markdown:** remark oder markdown-it, gray-matter für Frontmatter/Tags.
- **Validierung:** **Zod** (verbindlich). Request-Bodies und Parameter mit Zod-Schemas validieren; Schemas und abgeleitete Typen mit Frontend teilbar.
- **S3/MinIO:** @aws-sdk/client-s3 oder minio (npm).
- **Frontend:** TanStack Query, React Router; Backend Deltas/Versionierung: diff-match-patch.
- **Logging:** pino. Health-Check-Route für Deploy/Monitoring.
- **Optional (später):** Swagger/OpenAPI, Vitest + Supertest, Pandoc im Container für PDF-Worker.

---

## Nächste Schritte (Plan)

- [x] Stack festgelegt (siehe oben).
- [ ] Caddy-Config in Repo und Install-Skript integrieren.
- [ ] Stack in `compose.yml` abbilden (App, PostgreSQL, MinIO, Caddy, ggf. Worker).
