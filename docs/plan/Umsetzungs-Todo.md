# Umsetzungs-Todo

Phasen und Abschnitte für die Umsetzung der internen Dokumentationsplattform. Siehe [Technologie-Stack](Technologie-Stack.md), [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md) und [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md).

**Empfohlener Einstieg:** Abschnitt 1 + 2 (Grundgerüst + Datenmodell), dann 3–4 (Auth, Rechte), danach 5–7 (Kern-API, Frontend, Dokumente-UI). **Phase 2** (später): Abschnitte 8–11 (Versionierung, MinIO, Async Jobs, Volltextsuche, Deployment-Doku).

---

## 1. Grundgerüst / Infrastruktur

- [x] Repo-Struktur anlegen (Backend, Frontend, `docker-compose.yml`, `docs/`, `scripts/`)
- [x] `docker-compose.yml`: App, PostgreSQL, MinIO, Caddy (ggf. separater Worker später)
- [x] Dev-Setup: **Schnell-Dev** (nur DB + MinIO in Docker, App/Frontend auf Host) und **Prod-nah** (vollständiger Stack mit Caddy, App per Volume + Watch; Zugriff über http://localhost) – siehe [Infrastruktur §9](Infrastruktur-und-Deployment.md#9-entwicklungsumgebung)
- [x] `install.sh`: Voraussetzungen prüfen (Docker/Podman), Stack starten
- [x] Caddy-Beispiel-Config (Reverse Proxy auf App)
- [x] Minimale App startet und ist über Caddy erreichbar
- [x] **CI:** Job zum Test des Install-Skripts (frischer Runner, `install.sh` ausführen, Health-Check) – siehe [Infrastruktur §10](Infrastruktur-und-Deployment.md#10-test-des-install-skripts)

---

## 2. Datenmodell & Backend-Basis

- [x] Prisma-Schema: Firma, Abteilung, Team, Nutzer, Kontexte (Prozess, Projekt, Unterkontext, Nutzerspace), Dokument, Zugriffsrechte (n:m)
- [x] Migrationen anlegen und ausführen (`prisma migrate`)
- [x] Fastify-Skelett (TypeScript), Prisma anbinden
- [x] Health-Route (DB-Erreichbarkeit)
- [x] Erste Lese-Route gegen DB (z. B. Liste Firma/Abteilungen) zum Abgleich mit Schema

---

## 3. Auth

- [x] Login (lokal oder LDAP/SSO-Anbindung)
- [x] **Sessions** (Postgres, httpOnly-Cookie); Middleware „Nutzer aus Request“
- [x] Geschützte Routen nur mit gültiger Auth

---

## 4. Rechte

- [ ] Logik `canRead(userId, dokumentId)` / `canWrite(userId, dokumentId)` (vgl. [Rechteableitung](../platform/datenmodell/Rechteableitung.md))
- [ ] Middleware für Dokument-Routen (z. B. `requireDocumentAccess('read'|'write')`)
- [ ] Anbindung an Prisma (User inkl. Teams, Abteilungen, Superuser; Dokument inkl. Leser/Schreiber)

---

## 5. Kern-API

- [ ] CRUD Organisation (Firma, Abteilung, Team)
- [ ] CRUD Kontexte (Projekt, Prozess, Nutzerspace, Unterkontext)
- [ ] CRUD Dokumente (Titel, Markdown-Inhalt, Kontext, Tags)
- [ ] Zuweisung Leser/Schreiber pro Dokument (Nutzer, Team, Abteilung)
- [ ] Validierung (Zod), Fehlerbehandlung

---

## 6. Frontend-Basis

- [ ] Passende Component-/Style-Library auswählen (noch zu finden)
- [ ] React (Vite, TypeScript), React Router, TanStack Query
- [ ] Layout (Hauptnavigation), Routing-Struktur (/, /teams/, /repositories/, /prozesse/, … vgl. [Intranet-Dashboard](../platform/ui-architektur/Intranet-Dashboard.md))
- [ ] API-Client (Base-URL, Auth-Header), Typen aus Backend/Prisma teilen
- [ ] Einfache Seiten pro Bereich (Platzhalter oder erste Listen)

---

## 7. Dokumente in der UI

- [ ] Listen/Filter nach Kontext, Team, Tags
- [ ] Markdown-Editor + Vorschau (z. B. TipTap oder Textarea + Preview)
- [ ] Anzeige mit Rechte-Checks (Lesen/Schreiben nur wenn berechtigt)
- [ ] Anlegen/Bearbeiten/Löschen von Dokumenten in Kontexten

---

## 8. Versionierung & PR-Workflow

- [ ] Snapshots pro Änderung (Version = Snapshot), Hash-IDs
- [ ] Deltas/Deduplizierung (diff-match-patch, Blob-Referenzen)
- [ ] Drafts: Leser erstellen Entwurf, Schreiber prüfen/genehmigen/ablehnen
- [ ] Merge in Hauptversion; Garbage Collection für alte Drafts (vgl. [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md))

---

## 9. Objekt-Speicher (MinIO)

- [ ] S3-Client (MinIO) im Backend anbinden
- [ ] Upload/Download für Anhänge und Bilder (Dokumente)
- [ ] Speicherorte in DB referenzieren; Berechtigungen vor Download prüfen

---

## 10. Async Jobs

- [ ] pg-boss einbinden (Queue, Worker)
- [ ] Worker-Prozess oder -Container für Jobs
- [ ] Jobs: Volltext-Index aktualisieren, PDF-Export (Pandoc), ggf. Benachrichtigungen
- [ ] Job-Status/Ergebnis (z. B. Download-Link für PDF) für Frontend

---

## 11. Volltextsuche

- [ ] PostgreSQL Full-Text-Search oder externe Engine (Meilisearch/Typesense)
- [ ] Such-API (Query, Filter nach Kontext/Team)
- [ ] Such-UI (Dashboard, Suche + Tags)

---

## 12. Deployment & Doku

- [ ] `install.sh` und ggf. `scripts/update.sh` finalisieren
- [ ] CI-Job für Install-Skript-Test (bereits in Abschnitt 1 angelegt; hier finalisieren)
- [ ] Caddy-Config im Repo, Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy
- [ ] Backup-Konzept (DB, MinIO), Hinweis in App vor Update
- [ ] README: Voraussetzungen, Installation, Update
