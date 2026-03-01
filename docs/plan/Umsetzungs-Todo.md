# Umsetzungs-Todo

Phasen und Abschnitte für die Umsetzung der internen Dokumentationsplattform. Siehe [Technologie-Stack](Technologie-Stack.md), [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md) und [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md).

**Empfohlener Einstieg:** Abschnitt 1 + 2 (Grundgerüst + Datenmodell), dann 3–4 (Auth, Rechte), danach 5–11 (Kern-API, Frontend, Layout, Settings, Admin-UI, Dashboard, Dokumente-UI). **Phase 2** (später): Abschnitte 12–17 (Versionierung, MinIO, Async Jobs, Volltextsuche, Deployment-Doku, Layout- & UX-Ergänzungen).

---

## 1. Grundgerüst / Infrastruktur

- [x] Repo-Struktur anlegen (Backend, Frontend, `docker-compose.yml`, `docs/`, `scripts/`)
- [x] `docker-compose.yml`: App, PostgreSQL, MinIO, Caddy (ggf. separater Worker später)
- [x] Dev-Setup: **Schnell-Dev** (nur DB + MinIO in Docker, App/Frontend auf Host) und **Prod-nah** (vollständiger Stack mit Caddy, App per Volume + Watch; Zugriff über http://localhost:5000) – siehe [Infrastruktur §9](Infrastruktur-und-Deployment.md#9-entwicklungsumgebung)
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
- [x] Logger-Konfiguration (Level über `LOG_LEVEL`, Format Dev/Prod; Pino, optional pino-pretty in Dev)
- [x] Zentraler Error-Handler (Fastify `setErrorHandler`; Zod → 400, Prisma NotFound → 404, sonst 500; einheitliches Fehlerformat)

---

## 3. Auth

- [x] Login (lokal oder LDAP/SSO-Anbindung)
- [x] **Sessions** (Postgres, httpOnly-Cookie); Middleware „Nutzer aus Request“
- [x] Geschützte Routen nur mit gültiger Auth

---

## 4. Rechte

- [x] Logik `canRead(userId, dokumentId)` / `canWrite(userId, dokumentId)` (vgl. [Rechteableitung](../platform/datenmodell/Rechteableitung.md))
- [x] Middleware für Dokument-Routen (z. B. `requireDocumentAccess('read'|'write')`)
- [x] Anbindung an Prisma (User inkl. Teams, Abteilungen, Superuser; Dokument inkl. Leser/Schreiber)

---

## 5. Kern-API

- [x] CRUD Organisation (Firma, Abteilung, Team)
- [x] CRUD Kontexte (Projekt, Prozess, Nutzerspace, Unterkontext)
- [x] CRUD Dokumente (Titel, Markdown-Inhalt, Kontext, Tags)
- [x] Zuweisung Leser/Schreiber pro Dokument (Nutzer, Team, Abteilung)
- [x] API für Zuordnungen (TeamMember, TeamLeader, Supervisor) – GET/POST/DELETE pro Ressource; Berechtigung: Admin alles, Supervisor für Teams seiner Abteilung (Member + Leader), TeamLeader für sein Team (nur Member)
- [x] Validierung (Zod), Fehlerbehandlung

---

## 6. Frontend-Basis

- [x] Component-/Style-Library: **Mantine**
- [x] React (Vite, TypeScript), React Router, TanStack Query
- [x] Layout (Hauptnavigation), Routing-Struktur (/, /teams/, /repositories/, /prozesse/, … vgl. [Intranet-Dashboard](../platform/ui-architektur/Intranet-Dashboard.md))
- [x] **Caddy/Proxy (Szenario B):** Routing `/api` → Backend, `/` → Frontend (eine Origin, Cookie ohne CORS); Frontend als Service im Stack (Dev-Server oder Build)
- [x] API-Client (Base-URL = gleiche Origin), Typen aus Backend/Prisma teilen
- [x] Einfache Seiten pro Bereich (Platzhalter oder erste Listen)

---

## 7. Layout & Navigation

- [x] **Struktur (Backstage-orientiert):** Zweiteiliges Layout ohne Nav-Kopfleiste: nur **Sidebar** (links) + **Main** (rechts). Main immer: (1) Seiten-Header oben (Titel, ggf. Metadaten/Aktionen), (2) bei Unterbereichen Tabs, sonst direkt (3) Content.
- [x] **Sidebar:** Logo oben, gruppierte Nav-Einträge (Teams, Repositories, Prozesse, ggf. Admin); unten z. B. Notifications/Settings; aktiver Eintrag hervorheben.
- [x] **Main-Content:** Thematische Karten/Cards, einheitliche Abstände; Loading States (Skeletons/Spinner), Fehlerbehandlung (API-Fehler, 404, Fehlerseite), Toasts/Notifications für Erfolg und Fehler.

---

## 8. Settings-Seite

Vor Admin umgesetzt, damit Theme (Hell/Dunkel/Auto) früh app-weit gilt. Einstellungen von Anfang an im Backend persistieren (kein localStorage als Übergang).

- [x] **Route & Layout**
  - Einstiegsseite unter z. B. `/settings`, erreichbar aus der Sidebar (unten, wie in Abschnitt 7).
  - Seiten-Header „Settings“, darunter eine General-Ansicht mit Cards (Profile, Account, Appearance, Notifications, Language, Security, DocsOps Identity).
- [x] **Backend: Me & Preferences**
  - GET `/api/v1/me` – erweiterte Nutzerdaten inkl. Zugehörigkeiten (Teams mit Rolle Mitglied/Leader, Abteilung(en), Supervisor, ggf. eigene Nutzerspaces) für DocsOps-Identity; nur eigener User (Session); inkl. `hasLocalLogin` (Account-Card nur bei lokalem Login).
  - PATCH `/api/v1/me` – eigenes Profil bearbeiten (**nur Anzeigename**); nur eigener User; Validierung (Zod). E-Mail/Passwort über Account (PATCH `/api/v1/me/account`).
  - GET/PATCH `/api/v1/me/preferences` – User-Preferences (z. B. `theme: 'light'|'dark'|'auto'`, `sidebarPinned: boolean`, `locale: 'en'|'de'`). Persistenz im Backend (User-Preferences-Feld); eine Quelle der Wahrheit für alle Clients.
  - POST `/api/v1/me/deactivate` – Self-Deactivate (setzt `deletedAt`); nur für Nicht-Admins (letzter Admin darf nicht); alle Sessions des Users löschen.
  - PATCH `/api/v1/me/account` – E-Mail und/oder Passwort ändern (nur bei lokalem Login, d. h. `passwordHash` gesetzt); Zod: `email?`, `currentPassword?`, `newPassword?` (Mindestlänge 8); E-Mail-Uniqueness, Verifizierung aktuelles Passwort.
  - GET `/api/v1/me/sessions` – Liste der Sessions (id, createdAt, expiresAt, isCurrent aus Session-Cookie); DELETE `/api/v1/me/sessions/:sessionId` (nur eigene Session); optional DELETE `/api/v1/me/sessions` = alle anderen Sessions beenden.
- [x] **General (Cards: Profile, Account, Appearance, Notifications, Language, Security, DocsOps Identity)**
  - **Profile-Card:** Anzeige User (Name, E-Mail read-only, isAdmin). **Dreipunkt-Menü** (Mantine Menu): „Edit“ → Modal nur **Anzeigename**, PATCH `/api/v1/me`; „Deactivate“ (rot, nur wenn `!user.isAdmin`) → Bestätigungs-Modal, POST `/me/deactivate`, dann Logout + Redirect zu Login, Toast.
  - **Account-Card:** Nur bei lokalem Login (hasLocalLogin): E-Mail read-only, Buttons „Change email“ / „Change password“ mit Modals; PATCH `/api/v1/me/account`. Bei SSO: Hinweis „Login managed by SSO“, keine Bearbeitung.
  - **Appearance-Card:** Theme **Light / Dark / Auto**, „Pin Sidebar“; Persistenz über PATCH `/api/v1/me/preferences`; Theme app-weit (ThemeFromPreferences).
  - **Notifications-Card:** Platzhalter („Notification preferences will be available here …“); konkrete Optionen später (vgl. §14, §17).
  - **Language-Card:** Select English/Deutsch (`locale: 'en'|'de'`), PATCH `/api/v1/me/preferences` mit `locale`; gespeicherte Preference für spätere i18n-Nutzung.
  - **Security-Card (Sessions):** Liste der Sessions (Created, Expires, „Current session“-Badge), Revoke pro Zeile (außer aktueller Session), optional „Revoke all other sessions“.
  - **DocsOps-Identity-Card:** User-Entity und Ownership-/Zugehörigkeits-Entitäten (Teams inkl. Rolle, Abteilung(en), Supervisor, eigene Nutzerspaces). Daten aus GET `/api/v1/me`.

---

## 9. Admin-UI / Nutzerverwaltung

- [ ] **Zugang & Struktur**
  - Admin-Bereich nur für Nutzer mit `isAdmin` (Route-Guard; 403/Redirect für Nicht-Admins).
  - Route z. B. `/admin` mit Unterrouten (z. B. `/admin/users`, `/admin/teams`, `/admin/organisation`).
  - Menüpunkt „Admin“ in der Sidebar nur anzeigen, wenn aktueller Nutzer `isAdmin` (Frontend: Nutzerdaten aus Session/Me-API).
- [ ] **Backend: Nutzer-API (falls noch nicht vorhanden)**
  - GET `/api/v1/admin/users` – Nutzerliste (paginiert, Filter optional); nur für Admins (`requireAdmin`).
  - POST `/api/v1/admin/users` – Nutzer anlegen (Name, E-Mail, Passwort, optional `isAdmin`); nur für Admins.
  - PATCH `/api/v1/admin/users/:userId` – Nutzer bearbeiten (Name, E-Mail, `isAdmin`, ggf. `deletedAt` für Deaktivierung/Soft Delete).
  - Optional: Passwort zurücksetzen (eigener Endpoint oder Teil von PATCH); keine Anzeige des bestehenden Passworts.
- [ ] **Frontend: Nutzerverwaltung**
  - Seite „Nutzer“ (z. B. `/admin/users`): Tabelle/Liste mit Name, E-Mail, Admin-Flag, Status (aktiv/deaktiviert); Suche/Filter, Pagination.
  - Nutzer anlegen: Formular (Name, E-Mail, Passwort, Checkbox isAdmin); Validierung; Toast bei Erfolg/Fehler.
  - Nutzer bearbeiten: Formular (Name, E-Mail, isAdmin, ggf. „Deaktivieren“); keine Passwort-Anzeige, optional „Passwort setzen“.
- [ ] **Frontend: Zuordnungen (TeamMember, TeamLeader, Supervisor)**
  - Anbindung an bestehende API: `GET/POST/DELETE /teams/:teamId/members`, `.../leaders`, `GET/POST/DELETE /departments/:departmentId/supervisors`.
  - Pro Team: Mitglieder anzeigen, hinzufügen (User auswählen), entfernen; Team-Leader anzeigen, hinzufügen, entfernen. Berechtigung laut Backend (Supervisor/TeamLeader/Admin).
  - Pro Abteilung: Supervisor-Liste anzeigen, hinzufügen, entfernen. Nur für Admins oder Supervisor derselben Abteilung (falls API das erlaubt).
  - UI: z. B. Unterbereich „Teams“ unter `/admin/teams` mit Navigation Team wählen → Mitglieder/Leader verwalten; oder Integration in Organisationsbaum (Abteilung → Teams → Mitglieder).
- [ ] **Optional: Organisation im Admin**
  - Firma, Abteilung, Team anzeigen (Baum oder Listen); Anlegen/Bearbeiten/Löschen – nur für Admins (vgl. [Rechteableitung](../platform/datenmodell/Rechteableitung.md): Company/Department/Team nur von Admins).
  - Falls Kern-API bereits CRUD für Organisation bietet: reine UI-Anbindung; sonst Backend-Erweiterung prüfen.

---

## 10. Dashboard / Home

- [ ] **Startseite:** Überblick (z. B. letzte Änderungen, „meine“ Dokumente)
- [ ] **Quick Links:** Repositories, Teams, Prozesse, Firma, ggf. Vorlagen (vgl. [Intranet-Dashboard](../platform/ui-architektur/Intranet-Dashboard.md))
- [ ] Optional: Platzhalter für Benachrichtigungen/Updates (später an Async Jobs anbinden)

---

## 11. Dokumente in der UI

- [ ] Listen/Filter nach Kontext, Team, Tags
- [ ] **Tag-Verwaltung:** Tags anzeigen, Dokumenten zuweisen, nach Tags filtern
- [ ] Markdown-Editor + Vorschau (z. B. TipTap oder Textarea + Preview)
- [ ] Anzeige mit Rechte-Checks (Lesen/Schreiben nur wenn berechtigt)
- [ ] Anlegen/Bearbeiten/Löschen von Dokumenten in Kontexten

---

## 12. Versionierung & PR-Workflow

- [ ] Snapshots pro Änderung (Version = Snapshot), Hash-IDs
- [ ] Deltas/Deduplizierung (diff-match-patch, Blob-Referenzen)
- [ ] Drafts: Leser erstellen Entwurf, Schreiber prüfen/genehmigen/ablehnen
- [ ] Merge in Hauptversion; Garbage Collection für alte Drafts (vgl. [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md))

---

## 13. Objekt-Speicher (MinIO)

- [ ] S3-Client (MinIO) im Backend anbinden
- [ ] Upload/Download für Anhänge und Bilder (Dokumente)
- [ ] Speicherorte in DB referenzieren; Berechtigungen vor Download prüfen

---

## 14. Async Jobs

- [ ] pg-boss einbinden (Queue, Worker)
- [ ] Worker-Prozess oder -Container für Jobs
- [ ] Jobs: Volltext-Index aktualisieren, PDF-Export (Pandoc), ggf. Benachrichtigungen
- [ ] Job-Status/Ergebnis (z. B. Download-Link für PDF) für Frontend

---

## 15. Volltextsuche

- [ ] PostgreSQL Full-Text-Search oder externe Engine (Meilisearch/Typesense)
- [ ] Such-API (Query, Filter nach Kontext/Team)
- [ ] Such-UI (Dashboard, Suche + Tags)

---

## 16. Deployment & Doku

- [ ] `install.sh` und ggf. `scripts/update.sh` finalisieren
- [ ] CI-Job für Install-Skript-Test (bereits in Abschnitt 1 angelegt; hier finalisieren)
- [ ] CI erweitern: Frontend-Tests (Unit/Component), optional E2E (z. B. Playwright)
- [ ] Caddy-Config im Repo, Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy
- [ ] Backup-Konzept (DB, MinIO), Hinweis in App vor Update
- [ ] README: Voraussetzungen, Installation, Update

---

## 17. Layout- & UX-Ergänzungen (Phase 2)

- [ ] **Suchfeld in der Sidebar:** Anbindung an Volltextsuche (vgl. Abschnitt 15).
- [ ] **Breadcrumbs:** Pfad/Kontext anzeigen (z. B. Company → Abteilung → Team → Dokument).
- [ ] **Pin Sidebar:** Sidebar ein-/ausklappbar, Option in Settings („Pin“).
- [ ] **Theme-UI:** Umschaltung Hell/Dunkel/Auto in Settings (Abschnitt 8), persistiert im Backend; technische Vorbereitung dort umgesetzt.
- [ ] **Notifications-UI in Settings:** Notifications-Card in Settings mit konkreten Optionen (E-Mail bei Dokument-Änderungen, PRs, Erinnerungen), Anbindung an Async Jobs / Preferences (vgl. §14).
- [ ] **Responsiv:** Sidebar auf kleinen Viewports (Overlay/Hamburger) definieren und umsetzen.
- [ ] **Icons & A11y:** Einheitliche Icon-Bibliothek; Tastatur/Screenreader für Sidebar und Tabs.
