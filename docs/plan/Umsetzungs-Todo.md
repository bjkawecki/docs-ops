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

- [x] Logik `canRead(userId, dokumentId)` / `canWrite(userId, dokumentId)` (vgl. [Rechtesystem](../platform/datenmodell/Rechtesystem.md))
- [x] Middleware für Dokument-Routen (z. B. `requireDocumentAccess('read'|'write')`)
- [x] Anbindung an Prisma (User inkl. Teams, Abteilungen, Superuser; Dokument inkl. Leser/Schreiber)

---

## 5. Kern-API

- [x] CRUD Organisation (Firma, Abteilung, Team)
- [x] CRUD Kontexte (Projekt, Prozess, Nutzerspace, Unterkontext)
- [x] CRUD Dokumente (Titel, Markdown-Inhalt, Kontext, Tags)
- [x] Zuweisung Leser/Schreiber pro Dokument (Nutzer, Team, Abteilung)
- [x] API für Zuordnungen (TeamMember, Team Lead, Department Lead) – GET/POST/DELETE pro Ressource; Berechtigung: Admin alles, Department Lead für Teams seiner Abteilung (Member + Team Lead), Team Lead für sein Team (nur Member)
- [x] Validierung (Zod), Fehlerbehandlung

---

## 6. Frontend-Basis

- [x] Component-/Style-Library: **Mantine**
- [x] React (Vite, TypeScript), React Router, TanStack Query
- [x] Layout (Hauptnavigation), Routing-Struktur (/, /team/, /catalog, … vgl. [Intranet-Dashboard](../platform/ui-architektur/Intranet-Dashboard.md))
- [x] **Caddy/Proxy (Szenario B):** Routing `/api` → Backend, `/` → Frontend (eine Origin, Cookie ohne CORS); Frontend als Service im Stack (Dev-Server oder Build)
- [x] API-Client (Base-URL = gleiche Origin), Typen aus Backend/Prisma teilen
- [x] Einfache Seiten pro Bereich (Platzhalter oder erste Listen)

---

## 7. Layout & Navigation

- [x] **Struktur (Backstage-orientiert):** Zweiteiliges Layout ohne Nav-Kopfleiste: nur **Sidebar** (links) + **Main** (rechts). Main immer: (1) Seiten-Header oben (Titel, ggf. Metadaten/Aktionen), (2) bei Unterbereichen Tabs, sonst direkt (3) Content.
- [x] **Tab-Bereich:** Auf **jeder Page außer Catalog** gibt es einen Tab-Bereich unter dem Seiten-Header. Gibt es keine weiteren Tabs, heißt der einzige Tab **„Overview“**. (Catalog hat keinen Tab-Bereich.)
- [x] **Sidebar (neu):** Logo oben. Haupt-Navigation in dieser Reihenfolge:
  - **Home** – Einstieg (Dashboard/Überblick; vgl. §10).
  - **Catalog** – Entry-Point für alle Dokumente als **Tabelle**, filter-, such- und sortierbar.
  - **Team / Department / Company** – **Rollenabhängige Darstellung** (Nutzer ohne Team bzw. ohne Team und Department sollen keine leeren Single-Links sehen):
    - **Team-Member:** Einstieg „Team“ bzw. sein Team (z. B. ein Link zum Team-Kontext).
    - **Department-Lead:** Sidebar zeigt **„Department“** (sein eine(s), klickbar), darunter **Zwischenüberschrift „Teams“**, darunter die **klickbaren Team-Namen** (Teams dieser Abteilung). Content-Seite wie bisher (Klick auf Department oder Team → Kontext-Übersicht).
    - **Company-Lead:** **Aufklappbare Struktur:** Zwischenüberschrift **„Departments“**, darunter Abteilungen als **aufklappbare Einträge**; unter jeder Abteilung die zugehörigen **Teams** (klickbar). Hierarchie Company → Department → Team in der Sidebar sichtbar.
  - **Personal** – Entry-Point für den eigenen UserSpace (ein Nutzer hat genau einen); Card-Grid, eine Card je Kontext (dort typisch eine Karte).
  - **Shared** – Entry-Point für per Grant geteilte Inhalte; Card-Grid, eine Card je Kontext (Kontexte, in denen mindestens ein Dokument mit mir geteilt wurde). Aktuell nur Document-Grants; **Ausblick:** Kontext-Level-Grants („ganzen Kontext teilen“) als Erweiterung möglich.
- **Sidebar unten:** Account-Dropdown (Trigger: E-Mail oder Name) mit **Admin** (nur bei `isAdmin`), **Settings**, Trennlinie, **Log out**. Kein Admin in der Haupt-Navigation.
- [x] **Main-Content:** Thematische Karten/Cards, einheitliche Abstände; Loading States (Skeletons/Spinner), Fehlerbehandlung (API-Fehler, 404, Fehlerseite), Toasts/Notifications für Erfolg und Fehler.

---

## 8. Settings-Seite

Vor Admin umgesetzt, damit Theme (Hell/Dunkel/Auto) früh app-weit gilt. Einstellungen von Anfang an im Backend persistieren (kein localStorage als Übergang).

- [x] **Route & Layout**
  - Einstiegsseite unter z. B. `/settings`, erreichbar aus der Sidebar (unten, wie in Abschnitt 7).
  - Seiten-Header „Settings“, darunter eine General-Ansicht mit Cards (Profile, Account, Appearance, Notifications, Language, Security, DocsOps Identity).
- [x] **Backend: Me & Preferences**
  - GET `/api/v1/me` – erweiterte Nutzerdaten inkl. Zugehörigkeiten (Teams mit Rolle Mitglied/Team Lead, Abteilung(en), Department Lead, ggf. eigene Nutzerspaces) für DocsOps-Identity; nur eigener User (Session); inkl. `hasLocalLogin` (Account-Card nur bei lokalem Login).
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
  - **DocsOps-Identity-Card:** User-Entity und Ownership-/Zugehörigkeits-Entitäten (Teams inkl. Rolle, Abteilung(en), Department Lead, eigene Nutzerspaces). Daten aus GET `/api/v1/me`.

---

## 9. Admin-UI / Nutzerverwaltung

**Stand Backend:** `requireAdmin` ist vorhanden (`auth/middleware.ts`), wird in Organisation- und Assignments-Routen genutzt. **Nutzer-API** unter `/api/v1/admin/users` ist umgesetzt (GET/POST/PATCH, reset-password).

- [x] **Zugang & Struktur**
  - Admin-Bereich nur für Nutzer mit `isAdmin` (Route-Guard; 403/Redirect für Nicht-Admins).
  - Route z. B. `/admin` mit Unterrouten (z. B. `/admin/users`, `/admin/teams`, `/admin/organisation`).
  - Menüpunkt „Admin“ in der Sidebar nur anzeigen, wenn aktueller Nutzer `isAdmin` (Frontend: Nutzerdaten aus Session/Me-API).
- [x] **Backend: Nutzer-API (neu)**
  - GET `/api/v1/admin/users` – Nutzerliste (paginiert); Filter optional, inkl. **Filter „nur Aktive“ / „inkl. Deaktivierte“** (z. B. Query-Parameter `includeDeactivated=true`); nur für Admins (`requireAdmin`).
  - POST `/api/v1/admin/users` – Nutzer anlegen (Name, E-Mail, Passwort, optional `isAdmin`); nur für Admins.
  - PATCH `/api/v1/admin/users/:userId` – Nutzer bearbeiten (Name, E-Mail, `isAdmin`); **Deaktivierung:** `deletedAt` setzen (Soft Delete); **Reaktivierung:** `deletedAt` auf `null` setzen (Admin kann deaktivierte Nutzer wieder aktivieren). Kein Hard-Delete.
  - **Passwort-Reset:** Nur Admin setzt für andere Nutzer ein neues Passwort (eigener Endpoint z. B. POST `/api/v1/admin/users/:userId/reset-password` mit Body `{ newPassword }` oder Teil von PATCH); keine Anzeige des bestehenden Passworts. Kein Self-Service „Passwort vergessen“ in dieser Phase.
- [x] **Frontend: Nutzerverwaltung**
  - Seite „Nutzer“ (z. B. `/admin/users`): Tabelle/Liste mit Name, E-Mail, Admin-Flag, Status (aktiv/deaktiviert); **Filter/Tabs:** z. B. „Aktive“ / „Alle (inkl. deaktiviert)“; Suche, Pagination.
  - Nutzer anlegen: Formular (Name, E-Mail, Passwort, Checkbox isAdmin); Validierung (wie §8: E-Mail eindeutig, Passwort mind. 8 Zeichen); Toast bei Erfolg/Fehler.
  - Nutzer bearbeiten: Formular (Name, E-Mail, isAdmin); **Deaktivieren**-Button/Aktion; **Reaktivieren** für deaktivierte Nutzer; keine Passwort-Anzeige, optional „Passwort setzen“ (Admin-Reset).
- [x] **Frontend: Zuordnungen (TeamMember, Team Lead, Department Lead)**
  - Anbindung an bestehende API: `GET/POST/DELETE /teams/:teamId/members`, `.../leaders`, `GET/POST/DELETE /departments/:departmentId/supervisors`.
  - Pro Team: Mitglieder anzeigen, hinzufügen (User auswählen), entfernen; Team Lead anzeigen, hinzufügen, entfernen. Berechtigung laut Backend (Department Lead/Team Lead/Admin).
  - Pro Abteilung: Department-Lead-Liste anzeigen, hinzufügen, entfernen. Nur für Admins (Department-Lead-Zuordnung).
  - UI: z. B. Unterbereich „Teams“ unter `/admin/teams` mit Navigation Team wählen → Mitglieder/Leader verwalten; oder Integration in Organisationsbaum (Abteilung → Teams → Mitglieder).
- [x] **Optional: Organisation im Admin**
  - **Nur UI:** Kern-API (Abschnitt 5) bietet bereits CRUD für Firma, Abteilung, Team; Admin-Organisation ist reine UI-Anbindung an diese Routen, keine Backend-Erweiterung nötig.
  - Firma, Abteilung, Team anzeigen (Baum oder Listen); Anlegen/Bearbeiten/Löschen – nur für Admins (vgl. [Rechtesystem](../platform/datenmodell/Rechtesystem.md)).
- [x] **Dev-Feature (Admin): Ansicht „als Nutzer X“** – Admins können die Oberfläche bzw. Daten so sehen, als wären sie ein anderer Nutzer (ohne sich auszuloggen); nur für Admins, z. B. zur Prüfung von Rechten oder Support.

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
- [ ] **Speicherübersicht (Assets aus MinIO):** Nutzung/Speicher pro Nutzer sichtbar – **Nutzer:** nur eigene Nutzung; **Team-Lead:** Nutzung aller Team-Mitglieder; **Department-Lead:** Nutzung aller Members der Abteilung (alle Teams der Abteilung); **Company-Lead / Admin:** Nutzung aller Abteilungen.

---

## 14. Async Jobs

- [ ] pg-boss einbinden (Queue, Worker)
- [ ] Worker-Prozess oder -Container für Jobs
- [ ] Jobs: Volltext-Index aktualisieren; **Markdown-Dokumente per Pandoc exportierbar** (z. B. PDF); Pandoc-Befehl/Formel konfigurierbar (Details in der Umsetzung); ggf. Benachrichtigungen
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
