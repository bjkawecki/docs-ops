# Umsetzungs-Todo

Phasen und Abschnitte für die Umsetzung der internen Dokumentationsplattform. Siehe [Technologie-Stack](Technologie-Stack.md), [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md) und [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md).

**Empfohlener Einstieg:** Abschnitt 1 + 2 (Grundgerüst + Datenmodell), dann 3–4 (Auth, Rechte), danach 5–14 (Kern-API, Frontend, Layout, Settings, Admin-UI, Kontexte-Verwaltung, Company Page, Department/Team Pages, Dashboard, Catalog, Dokumente-UI). **Phase 2** (später): Abschnitte 15–20 (Versionierung, MinIO, Async Jobs, Volltextsuche, Deployment-Doku, Layout- & UX-Ergänzungen).

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

- [x] Prisma-Schema: Firma, Abteilung, Team, Nutzer, Kontexte (Prozess, Projekt, Unterkontext), Owner optional mit ownerUserId für persönliche Kontexte, Dokument, Zugriffsrechte (n:m)
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
- [x] CRUD Kontexte (Projekt, Prozess, Unterkontext); Prozesse/Projekte mit Owner = Nutzer (ownerUserId) für persönlichen Bereich
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
  - **Personal** – Entry-Point für eigene Prozesse, Projekte und Dokumente (Owner = Nutzer); Struktur analog zu Company/Department/Team (Tabs, Overview mit Recent Items, Karten); siehe §11a.
  - **Shared** – Entry-Point für per Grant geteilte Inhalte; Struktur analog zu Company/Department/Team (Tabs, Overview mit Recent Items, Karten); siehe §11a.
- **Sidebar unten:** Account-Dropdown (Trigger: E-Mail oder Name) mit **Admin** (nur bei `isAdmin`), **Settings**, Trennlinie, **Log out**. Kein Admin in der Haupt-Navigation.
- [x] **Main-Content:** Thematische Karten/Cards, einheitliche Abstände; Loading States (Skeletons/Spinner), Fehlerbehandlung (API-Fehler, 404, Fehlerseite), Toasts/Notifications für Erfolg und Fehler.

---

## 8. Settings-Seite

Vor Admin umgesetzt, damit Theme (Hell/Dunkel/Auto) früh app-weit gilt. Einstellungen von Anfang an im Backend persistieren (kein localStorage als Übergang).

- [x] **Route & Layout**
  - Einstiegsseite unter z. B. `/settings`, erreichbar aus der Sidebar (unten, wie in Abschnitt 7).
  - Seiten-Header „Settings“, darunter eine General-Ansicht mit Cards (Profile, Account, Appearance, Notifications, Language, Security, DocsOps Identity).
- [x] **Backend: Me & Preferences**
  - GET `/api/v1/me` – erweiterte Nutzerdaten inkl. Zugehörigkeiten (Teams mit Rolle Mitglied/Team Lead, Abteilung(en), Department Lead) für DocsOps-Identity; nur eigener User (Session); inkl. `hasLocalLogin` (Account-Card nur bei lokalem Login).
  - PATCH `/api/v1/me` – eigenes Profil bearbeiten (**nur Anzeigename**); nur eigener User; Validierung (Zod). E-Mail/Passwort über Account (PATCH `/api/v1/me/account`).
  - GET/PATCH `/api/v1/me/preferences` – User-Preferences (z. B. `theme: 'light'|'dark'|'auto'`, `sidebarPinned: boolean`, `locale: 'en'|'de'`, `recentItemsByScope?: Record<string, RecentItem[]>` pro Organisationseinheit, optional `hideGuideInScope?: Record<string, boolean>` zum Ausblenden der Anleitungs-Doku pro Scope). Persistenz im Backend (User-Preferences-Feld); eine Quelle der Wahrheit für alle Clients.
  - POST `/api/v1/me/deactivate` – Self-Deactivate (setzt `deletedAt`); nur für Nicht-Admins (letzter Admin darf nicht); alle Sessions des Users löschen.
  - PATCH `/api/v1/me/account` – E-Mail und/oder Passwort ändern (nur bei lokalem Login, d. h. `passwordHash` gesetzt); Zod: `email?`, `currentPassword?`, `newPassword?` (Mindestlänge 8); E-Mail-Uniqueness, Verifizierung aktuelles Passwort.
  - GET `/api/v1/me/sessions` – Liste der Sessions (id, createdAt, expiresAt, isCurrent aus Session-Cookie); DELETE `/api/v1/me/sessions/:sessionId` (nur eigene Session); optional DELETE `/api/v1/me/sessions` = alle anderen Sessions beenden.
- [x] **General (Cards: Profile, Account, Appearance, Notifications, Language, Security, DocsOps Identity)**
  - **Profile-Card:** Anzeige User (Name, E-Mail read-only, isAdmin). **Dreipunkt-Menü** (Mantine Menu): „Edit“ → Modal nur **Anzeigename**, PATCH `/api/v1/me`; „Deactivate“ (rot, nur wenn `!user.isAdmin`) → Bestätigungs-Modal, POST `/me/deactivate`, dann Logout + Redirect zu Login, Toast.
  - **Account-Card:** Nur bei lokalem Login (hasLocalLogin): E-Mail read-only, Buttons „Change email“ / „Change password“ mit Modals; PATCH `/api/v1/me/account`. Bei SSO: Hinweis „Login managed by SSO“, keine Bearbeitung.
  - **Appearance-Card:** Theme **Light / Dark / Auto**, „Pin Sidebar“; Persistenz über PATCH `/api/v1/me/preferences`; Theme app-weit (ThemeFromPreferences).
  - **Notifications-Card:** Platzhalter („Notification preferences will be available here …“); konkrete Optionen später (vgl. §17, §20).
  - **Language-Card:** Select English/Deutsch (`locale: 'en'|'de'`), PATCH `/api/v1/me/preferences` mit `locale`; gespeicherte Preference für spätere i18n-Nutzung.
  - **Security-Card (Sessions):** Liste der Sessions (Created, Expires, „Current session“-Badge), Revoke pro Zeile (außer aktueller Session), optional „Revoke all other sessions“.
  - **DocsOps-Identity-Card:** User-Entity und Ownership-/Zugehörigkeits-Entitäten (Teams inkl. Rolle, Abteilung(en), Department Lead). Daten aus GET `/api/v1/me`.
  - **Anleitungs-Doku ausblenden (optional):** Einstellung, ob die automatisch hinzugefügte DocsOps-Anleitung pro Scope (Personal, Team, Department, Company) in der UI ausgeblendet wird; Persistenz über PATCH `/api/v1/me/preferences` (z. B. `hideGuideInScope`). Vgl. §14 (DocsOps-Anleitung pro Rolle/Scope).

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

## 10. Kontexte-Verwaltung (Company Page)

Kontexte (Projekt, Prozess, Unterkontext) in der UI verwalten; Backend-CRUD existiert (Abschnitt 5). Einstieg auf der **Company-Seite** (`/company`). Company-Lead und Admin können Kontexte erstellen, aktualisieren und löschen.

### 1. Einheitliche Context-Komponenten

- [x] **Wiederverwendbare Bausteine** für alle Kontext-Seiten (Company, später Department, Team): **ContextCard** (eine Karte pro Kontext: Titel, Typ-Badge, optional Metadaten, Link zur Detail-Seite, bei Berechtigung Actions-Menü), **ContextGrid** (SimpleGrid/Flex aus ContextCards), **NewContextModal** (Modal zum Anlegen; Inhalt/Scope pro Seite).
- [x] Gleiche Komponenten auf Company-, Department- und Team-Seiten nutzen; nur Scope (companyId/departmentId/teamId) und Berechtigungen unterscheiden sich.

### 2. Modal „New Context“

- [x] **Button „New context“** (bzw. „Kontext anlegen“) in den Page-Actions; nur für Company-Lead und Admin.
- [x] **Modal-Aufbau:** (1) **Typ wählen:** zwei Optionen – **Prozess** oder **Projekt** (mit kurzem Hinweis zur Bedeutung). (2) **Name:** Pflichtfeld (max. 255 Zeichen). Owner auf Company Page fest = aktuelle Company (`effectiveCompanyId`); kein Auswahlfeld. Actions: Cancel / Create (POST `/processes` oder POST `/projects` mit `companyId`).

### 3. Darstellung der Kontexte: Card-Grid

- [x] **Card-Grid** pro Tab (Prozesse, Projekte): eine **ContextCard** pro Kontext mit Titel, **Typ-Badge** („Prozess“ / „Projekt“), optional Dokumentenanzahl/letzte Aktivität; Klick auf Karte → Kontext-Detail (später Dokumentenliste). Bei Berechtigung: **Dreipunkt-Menü** (Name bearbeiten, Löschen mit Bestätigung; PATCH/DELETE an bestehende Routen).

### 4. Company Page: Tabs und Overview-Cards

- [x] **Tabs:** **Overview** (Standard) | **Prozesse** | **Projekte** | **Dokumente**. Overview = Einstieg; die anderen Tabs je ein volles Card-Grid (bzw. Dokumente-Tab: Liste/Tabelle, Ausbau in Abschnitt 14).
- [x] **Overview-Tab – vier Karten:**
  - **Erste Karte: „Zuletzt angesehene Inhalte“** – gemischt Kontexte und Dokumente (z. B. 5–8 Einträge), klickbar → Detail-Seite. Leerer Zustand: Hinweis, dass sich die Liste beim Durchklicken füllt. Persistenz: Backend in User-Preferences als `recentItemsByScope` (eine Liste pro Company/Department/Team); die Karte erscheint in jeder Organisationseinheit (Company-, Department-, Team-Seite) mit der jeweiligen Scope-Liste.
  - **Zweite Karte: Prozesse** – Liste der fünf neuesten Prozesse (klickbar → Kontext-Detail); unten rechts Button **„View more“** → wechselt in Tab **Prozesse**.
  - **Dritte Karte: Projekte** – Liste der fünf neuesten Projekte (klickbar → Kontext-Detail); **„View more“** → Tab **Projekte**.
  - **Vierte Karte: Dokumente** – fünf neueste Dokumente (in Company-Kontexten), klickbar; **„View more“** → Tab **Dokumente**. Vollständiger Dokumente-Tab kann in §14 ausgebaut werden.
- [x] Leere Zustände in den Karten berücksichtigen („Noch keine Prozesse“ etc.; ggf. CTA oder „View more“ führt in den Tab mit „New context“).

### 5. Backend-Hinweis

- [x] **Filter Company-Kontexte:** Aktuell liefern `GET /processes` und `GET /projects` alle lesbaren Kontexte. Für Company Page: entweder **clientseitig** nach `owner.companyId === companyId` filtern (einfach, bei wenig Daten ausreichend) oder **serverseitig** erweitern (z. B. Query-Parameter `?companyId=...`), um nur Company-Kontexte zu laden und Pagination sinnvoll zu machen.
- [x] **„Zuletzt angesehene Inhalte“:** Dafür Backend-Persistenz vorsehen (z. B. in User-Preferences oder eigener Endpoint), damit die Liste geräteübergreifend und sessionübergreifend funktioniert.

---

## 11. Department- und Team-Pages (analog zu Company Page)

Department-Seite (`/department/:departmentId`) und Team-Seite (`/team/:teamId`) mit derselben Struktur und denselben Bausteinen wie die Company Page (§10): Tabs (Overview | Prozesse | Projekte | Dokumente), Card-Grids, „Zuletzt angesehene“, New-Context-Modal (Owner = Department bzw. Team), Kontext-Karten mit Bearbeiten/Löschen bei Berechtigung. Nur Scope und API-Filter (departmentId/teamId) sowie Berechtigungen (Department Lead / Team Lead) unterscheiden sich.

- [x] **Department Page:** Route, Tabs, Overview mit Recent-Items-Karte + neueste Prozesse/Projekte/Dokumente (gefiltert nach Owner = diese Abteilung); Prozesse-/Projekte-Tabs mit ContextGrid; „New context“ (Owner = Department); Berechtigung: Department Lead, Company Lead, Admin.
- [x] **Team Page:** Route, Tabs, Overview analog; Prozesse/Projekte mit Owner = dieses Team; „New context“ (Owner = Team); Berechtigung: Team Lead, Department Lead, Company Lead, Admin.
- [x] Wiederverwendung der Kontext-Komponenten aus §10 (ContextCard, ContextGrid, NewContextModal); Backend: ggf. Query-Parameter `?departmentId=...` / `?teamId=...` für Prozesse/Projekte, falls noch nicht vorhanden.

---

## 11a. Personal- und Shared-Pages (analog zu Company/Department/Team)

Personal-Seite (`/personal`) und Shared-Seite (`/shared`) mit derselben Struktur wie Company-, Department- und Team-Pages: Tabs (Overview | …), Overview mit RecentItemsCard und Vorschau-Karten, „View more“ in die Tabs. Scope nutzerbezogen (eigene Prozesse/Projekte/Dokumente bzw. per Grant geteilte Dokumente).

- [x] **Recent-Scope:** `RecentScope` um `personal` und `shared` erweitert; `scopeToKey` und Nutzung in Personal/Shared-Seiten.
- [x] **Personal Page:** Route `/personal`, Tabs (Overview | Processes | Projects | Documents), Overview mit RecentItemsCard (Scope personal) + Karten Prozesse/Projekte/Dokumente mit „View more“; Tab Processes/Projects = ContextGrid mit Prozessen/Projekten mit Owner = Nutzer (GET `/processes?ownerUserId=me`, GET `/projects?ownerUserId=me`), „Create“ öffnet NewContextModal mit Scope personal; Tab Documents = Dokumente aus eigenen Prozessen/Projekten (GET `/me/personal-documents`). Keine UserSpaces; persönliche Kontexte = Prozesse/Projekte mit Owner.ownerUserId.
- [x] **Shared Page:** Route `/shared`, Tabs (Overview | Documents), Overview mit RecentItemsCard (Scope shared) + Vorschau geteilter Dokumente; Backend GET `/me/shared-documents` (Dokumente mit Grant-Zugriff für den Nutzer).
- [x] **Einheitliche Bausteine:** RecentItemsCard, ContextGrid, NewContextModal (Scope personal), gleiche Tab-Struktur und leere Zustände wie bei Company/Department/Team.

---

## 12. Catalog (Dokumenten-Tabelle)

- [x] **Backend:** `GET /api/v1/documents` (Catalog-Liste) mit Pagination und Filtern (contextType, owner, tagIds, search); nur Dokumente zurückgeben, die der Nutzer lesen darf (canRead: Kontext + Grants); Response inkl. Kontext-Typ, Kontext-Name, Owner-Anzeige, Tags.
- [x] **Frontend:** Catalog-Seite mit Filter-Panel (Context type, Owner, Tags), Titelsuche, Tabelle (Title, Context, Context type, Owner, Tags, Updated, Actions), Pagination; Filter in URL-Query; alle Texte auf Englisch.

---

## 13. Dashboard / Home

Startseite ohne Quick Links (redundant zur Sidebar). Vier Blöcke:

- [x] **Pinned:** Nur **Dokumente** (Flag am Document: „in Liste von Scopes gepinnt“). Team Lead kann für sein Team anpinnen, Department Lead für sein Department, Company Lead für alle (es gibt nur eine Company). Nur Scope-Lead (und Admin) darf anpinnen; Anzeige für Nutzer: Pins aus eigenem Team, eigenem Department, Company-weit. Datenmodell: DocumentPinnedInScope (documentId, scopeType, scopeId, order, pinnedById); siehe [Prisma-Schema-Entwurf §7 (Pinned)](Prisma-Schema-Entwurf.md#7-pinned-geplant); danach API und Dashboard-Block.
- [x] **Recent:** Zuletzt angesehene Einträge (aus bestehender recentItemsByScope, auf dem Dashboard aggregiert, z. B. Top 10 über alle Scopes).
- [x] **Latest:** Neueste Dokumente, die der Nutzer lesen darf (z. B. Slice aus Catalog, sortiert nach updatedAt, Limit 10).
- [ ] **Drafts / Pending review:** Unveröffentlichte Dokumente und offene PRs (Details §15); Block sichtbar sobald Drafts/PR-Feature umgesetzt ist.
- [ ] Optional: Platzhalter für Benachrichtigungen/Updates (später an Async Jobs anbinden).

---

## 14. Dokumente in der UI

- [x] **Catalog:** Listen/Filter nach Kontext, Kontexttyp, Owner, Tags (umgesetzt in §13).
- [x] **Tag-Verwaltung:** Tags anzeigen, Tags anlegen (POST `/api/v1/tags`), Tags löschen (DELETE `/api/v1/tags/:tagId`), Dokumenten zuweisen, nach Tags filtern (Backend + Frontend: Multi-Select, „Create tag“, „Manage tags“).
- [x] **Markdown-Editor + Vorschau:** Markdown-Quelltext (Textarea), Vorschau per react-markdown (Tab „Preview“); Darstellung konsistent mit Lese-Ansicht.
- [x] **Anzeige mit Rechte-Checks:** GET `/documents/:id` liefert `canWrite`/`canDelete`; GET Process/Project liefert `canWriteContext`; UI zeigt Edit/Delete bzw. „New document“ nur bei Berechtigung.
- [x] **Anlegen/Bearbeiten/Löschen von Dokumenten in Kontexten:** Dokumentenliste auf Kontext-Detail-Seite (Process/Project), „New document“-Modal, DocumentPage mit Lese-/Bearbeiten-Modus, PATCH/DELETE; Recent Items beim Öffnen eines Dokuments.
- [ ] **Drafts-Tab** auf den Kontext-Seiten (Overview, Processes, Projects, Documents, **Drafts**) für unveröffentlichte Dokumente und PR-Übersicht (Details in §15; Datenmodell für Drafts/PR siehe §15 und [Prisma-Schema-Entwurf](Prisma-Schema-Entwurf.md) §3, §8).
- [ ] **DocsOps-Anleitung als erstes Dokument im Personal:** Im persönlichen Bereich (in einem Prozess) soll automatisch ein erstes Dokument „Anleitung für DocsOps“ erstellt werden (z. B. bei erstem Aufruf von /personal oder via Seed/Setup). **Pro Scope/Rolle:** Die Anleitung ist rollen- bzw. scope-spezifisch (z. B. Team Lead erhält eine Team-Lead-Anleitung, einfacher Nutzer eine Nutzer-Anleitung, Department Lead eine Department-Lead-Anleitung usw.). **Settings:** In den Einstellungen soll die Anleitungs-Doku pro Scope ausgeblendet werden können (Persistenz in User-Preferences, z. B. `hideGuideInScope?: Record<string, boolean>` oder Liste der ausgeblendeten Scopes).

---

## 15. Versionierung & PR-Workflow

Datenmodell für Document-Status und PR/Versionen siehe [Prisma-Schema-Entwurf](Prisma-Schema-Entwurf.md) (§3 Document-Status, §8 Versionierung & PR) und [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md); Umsetzung erst nach Doku-Stand.

- [ ] Snapshots pro Änderung (Version = Snapshot), Hash-IDs (Schema: [Prisma-Schema-Entwurf §8](Prisma-Schema-Entwurf.md#8-versionierung--pr-geplant))
- [ ] Deltas/Deduplizierung (diff-match-patch, Blob-Referenzen)
- [ ] **Dokument-Status draft/published:** Dokumente mit Status „draft“ (oder `publishedAt == null`); nur für Autor/Schreiber sichtbar; Veröffentlichung durch Scope-Lead (Schema und Sichtbarkeit: [Prisma-Schema-Entwurf §3](Prisma-Schema-Entwurf.md#3-dokumente)).
- [ ] **Drafts (zwei Arten):** (1) Noch nicht veröffentlichte Dokumente, (2) PRs (eingereichte Änderungen) die auf Merge warten. Leser/Writer reichen PRs ein; **Merge nur Scope-Lead** (Writer-Grant berechtigt nicht zum Mergen; vgl. [Rechtesystem 6b](../platform/datenmodell/Rechtesystem.md)).
- [ ] Merge in Hauptversion; Garbage Collection für alte Drafts (vgl. [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md)).
- [ ] **Drafts-Tab in der UI:** Auf Scope-Pages (Personal, Company, Department, Team, ggf. Shared) Tab „Drafts“ mit (1) unveröffentlichten Dokumenten, (2) offenen PRs (auf Merge warten); Filter/Unterteilung optional.

---

## 16. Objekt-Speicher (MinIO)

- [ ] S3-Client (MinIO) im Backend anbinden
- [ ] Upload/Download für Anhänge und Bilder (Dokumente)
- [ ] Speicherorte in DB referenzieren; Berechtigungen vor Download prüfen
- [ ] **Speicherübersicht (Assets aus MinIO):** Nutzung/Speicher pro Nutzer sichtbar – **Nutzer:** nur eigene Nutzung; **Team-Lead:** Nutzung aller Team-Mitglieder; **Department-Lead:** Nutzung aller Members der Abteilung (alle Teams der Abteilung); **Company-Lead / Admin:** Nutzung aller Abteilungen.

---

## 17. Async Jobs

- [ ] pg-boss einbinden (Queue, Worker)
- [ ] Worker-Prozess oder -Container für Jobs
- [ ] Jobs: Volltext-Index aktualisieren; **Markdown-Dokumente per Pandoc exportierbar** (z. B. PDF); Pandoc-Befehl/Formel konfigurierbar (Details in der Umsetzung); ggf. Benachrichtigungen
- [ ] Job-Status/Ergebnis (z. B. Download-Link für PDF) für Frontend

---

## 18. Volltextsuche

- [ ] PostgreSQL Full-Text-Search oder externe Engine (Meilisearch/Typesense)
- [ ] Such-API (Query, Filter nach Kontext/Team)
- [ ] Such-UI (Dashboard, Suche + Tags)

---

## 19. Deployment & Doku

- [ ] `install.sh` und ggf. `scripts/update.sh` finalisieren
- [ ] CI-Job für Install-Skript-Test (bereits in Abschnitt 1 angelegt; hier finalisieren)
- [ ] CI erweitern: Frontend-Tests (Unit/Component), optional E2E (z. B. Playwright)
- [ ] Caddy-Config im Repo, Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy
- [ ] Backup-Konzept (DB, MinIO), Hinweis in App vor Update
- [ ] README: Voraussetzungen, Installation, Update
- [ ] **DocsOps-Demo online:** Demo-Instanz online stellen, sobald die Plattform nutzbar ist.

---

## 20. Layout- & UX-Ergänzungen (Phase 2)

- [ ] **Suchfeld in der Sidebar:** Anbindung an Volltextsuche (vgl. Abschnitt 18).
- [ ] **Breadcrumbs:** Pfad/Kontext anzeigen (z. B. Company → Abteilung → Team → Dokument).
- [ ] **Pin Sidebar:** Sidebar ein-/ausklappbar, Option in Settings („Pin“).
- [ ] **Theme-UI:** Umschaltung Hell/Dunkel/Auto in Settings (Abschnitt 8), persistiert im Backend; technische Vorbereitung dort umgesetzt.
- [ ] **Notifications-UI in Settings:** Notifications-Card in Settings mit konkreten Optionen (E-Mail bei Dokument-Änderungen, PRs, Erinnerungen), Anbindung an Async Jobs / Preferences (vgl. §17).
- [ ] **Responsiv:** Sidebar auf kleinen Viewports (Overlay/Hamburger) definieren und umsetzen.
- [ ] **Icons & A11y:** Einheitliche Icon-Bibliothek; Tastatur/Screenreader für Sidebar und Tabs.
