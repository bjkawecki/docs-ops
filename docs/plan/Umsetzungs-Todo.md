# Umsetzungs-Todo

Phasen und Abschnitte für die Umsetzung der internen Dokumentationsplattform. Siehe [Technologie-Stack](Technologie-Stack.md), [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md) und [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md).

**Empfohlener Einstieg:** Abschnitt 1 + 2 (Grundgerüst + Datenmodell), dann 3–4 (Auth, Rechte), danach 5–14 (Kern-API, Frontend, Layout, Settings, Admin-UI, Kontexte-Verwaltung, Company Page, Department/Team Pages, Dashboard, Catalog, Dokumente-UI). **Phase 2** (später): Abschnitte 15–20 (Versionierung, MinIO, Async Jobs, Volltextsuche, Deployment-Doku, Layout- & UX-Ergänzungen). **Optional:** Abschnitt 21 (KI-Assistent / Dokumenten-Frage).

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
- [x] **Login-Seite (UI/UX):** Aktuell minimales zentriertes Paper mit E-Mail/Passwort und Button. Vorschläge zur besseren Gestaltung:
  - [x] **Layout:** Volle Viewport-Höhe nutzen, Formular vertikal zentrieren (`minHeight: 100vh`, Flexbox); dezenter Hintergrund (z. B. helles Grau oder subtiler Verlauf), damit die Karte sich abhebt; leichter Schatten auf dem Paper.
  - [x] **Branding & Kontext:** Produktname/Logo oberhalb des Formulars; kurzer Untertitel (z. B. „Internal documentation“); bei SSO optional Hinweis „Use your company account“ oder „Sign in with SSO“.
  - [x] **Formular:** Autofocus auf E-Mail-Feld; Fehlermeldung nach Login-Fehler als Alert oder klar hervorgehoben; Submit-Button optisch betonen (Primary, ggf. größer); optional „Remember me“, falls Backend persistente Session unterstützt.
  - [x] **Barrierefreiheit:** Nach fehlgeschlagenem Login Fokus auf E-Mail oder Fehlermeldung setzen; Labels mit Inputs verbinden (for/id); Fehlermeldung per aria-describedby anbinden.
  - [x] **Optionale Inhalte:** „Forgot password?“-Link, falls Reset-Flow existiert; Hinweis „Contact IT for access“ für neue Nutzer, falls kein öffentliches Sign-up.
  - [x] **Konsistenz:** Login-Seite an gleiches Theme (Hell/Dunkel) wie die App anbinden (z. B. ThemeFromPreferences), damit der Übergang nach dem Login stimmig ist; gleiche Mantine-Variablen (Schrift, Abstände) wie im Rest der App.

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
  - Route `/admin` mit Unterrouten: `/admin/users`, `/admin/teams`, `/admin/departments`, `/admin/company` (Organisation-Tab entfällt).
  - Menüpunkt „Admin“ in der Sidebar nur anzeigen, wenn aktueller Nutzer `isAdmin` (Frontend: Nutzerdaten aus Session/Me-API).
- **Einheitliches Tab-Design (vier Tabs):** Jeder Tab nutzt dasselbe UX-Muster: **Filter/Suche** (scope-spezifisch), **Liste/Tabelle** aller Einträge, **Create-Button** immer sichtbar und klickbar (Parent z. B. Company/Department im Modal), **Zeile auswählen** → Detailbereich (Members, Leads, Edit, Delete). Company-Tab: Bei nur einer Firma eine **einzelne Karte** (Name, Company leads, Edit); bei mehreren Firmen gleiches Listen-/Filter-Pattern.
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
- [ ] **Admin Tab „Teams“ (einheitliches Design):** Alle Teams listen (aus allen Departments), Filter (Name, Department); Create Team immer möglich (Department im Modal); Zeile auswählen → Members/Team leaders, Edit, Delete.
- [ ] **Admin Tab „Departments“:** Alle Abteilungen listen, Filter (Name, Company); Create Department (Company im Modal); Zeile auswählen → Department leads, Edit, Delete.
- [ ] **Admin Tab „Company“:** Company-Verwaltung (eine Karte oder Liste) + Company leads; Create Company falls mehrere erlaubt.
- [ ] **Organisation-Tab entfernen:** Inhalte auf Tabs Company, Departments, Teams verteilen; Route `/admin/organisation` und Komponente `AdminOrganisationTab` entfallen.
- [x] **Dev-Feature (Admin): Ansicht „als Nutzer X“** – Admins können die Oberfläche bzw. Daten so sehen, als wären sie ein anderer Nutzer (ohne sich auszuloggen); nur für Admins, z. B. zur Prüfung von Rechten oder Support.
- [ ] **Admin: KI-Settings** – Konfiguration des KI-Assistenten (vgl. §21): API-Endpoint, Modell, Feature-Flag ein/aus, ggf. globale Rate-Limits; nur für Admins; Persistenz in Config/DB.
- [ ] **Admin: Chat-History pro User** – Übersicht der KI-Chat-Verläufe pro Nutzer (z. B. Liste der Sitzungen/Threads, letzte Frage, Datum); nur für Admins; dient Support und Audit; Backend speichert Chat-Verläufe pro User (vgl. §21).
- [ ] **Admin: Token-Verbrauch pro User** – Anzeige des verbrauchten Token-Volumens (Input/Output) pro Nutzer (aggregiert oder pro Zeitraum); nur für Admins; Backend trackt Token-Nutzung je Anfrage (vgl. §21).

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
- [x] **Catalog-Sortierung nach Kontext/Owner (DB):** Context und Owner haben gecachte Anzeigenamen (Context: displayName, contextType, ownerDisplayName; Owner: displayName). Sortierung nach contextName, contextType, ownerDisplay erfolgt in der DB (orderBy auf Context), kein 2000er-Limit mehr. Sync bei Create/Update von Process, Project, Subcontext sowie bei Namensänderung Company/Department/Team/User (siehe [Prisma-Schema-Entwurf §2](Prisma-Schema-Entwurf.md#2-kontexte), [Pseudocode Datenmodell Kontext](../platform/datenmodell/Pseudocode%20Datenmodell.md)).

---

## 13. Dashboard / Home

Startseite ohne Quick Links (redundant zur Sidebar). **Suchleiste** oben mit Schalter **Normal / KI-Modus** (vgl. §18, §21): Normal = klassische Volltextsuche → Suchseite/Catalog; KI = Frage an Dokumente → Suchseite mit KI-Chat. Drei Blöcke (weitere Blöcke siehe §15e, §17; optional KI-Assistent §21):

- [ ] **Suchleiste mit Schalter (Normal/KI-Modus):** Einheitliches Suchfeld auf dem Dashboard (ggf. auch in Sidebar §20); Schalter oder Tabs „Normal“ / „KI“. Normal: Eingabe führt zu klassischer Suche (Suchseite oder Catalog mit Treffern). KI: Eingabe öffnet bzw. fokussiert Suchseite im KI-Chat-Modus (vgl. §18).
- [x] **Pinned:** Nur **Dokumente** (Flag am Document: „in Liste von Scopes gepinnt“). Team Lead kann für sein Team anpinnen, Department Lead für sein Department, Company Lead für alle (es gibt nur eine Company). Nur Scope-Lead (und Admin) darf anpinnen; Anzeige für Nutzer: Pins aus eigenem Team, eigenem Department, Company-weit. Datenmodell: DocumentPinnedInScope (documentId, scopeType, scopeId, order, pinnedById); siehe [Prisma-Schema-Entwurf §7 (Pinned)](Prisma-Schema-Entwurf.md#7-pinned-geplant); danach API und Dashboard-Block.
- [x] **Recent:** Zuletzt angesehene Einträge (aus bestehender recentItemsByScope, auf dem Dashboard aggregiert, z. B. Top 10 über alle Scopes).
- [x] **Latest:** Neueste Dokumente, die der Nutzer lesen darf (z. B. Slice aus Catalog, sortiert nach updatedAt, Limit 10).

---

## 14. Dokumente in der UI

- [x] **Catalog:** Listen/Filter nach Kontext, Kontexttyp, Owner, Tags (umgesetzt in §13).
- [x] **Tag-Verwaltung:** Tags anzeigen, Tags anlegen (POST `/api/v1/tags`), Tags löschen (DELETE `/api/v1/tags/:tagId`), Dokumenten zuweisen, nach Tags filtern (Backend + Frontend: Multi-Select, „Create tag“, „Manage tags“).
- [x] **Tags mit Scope:** Tags sind an einen Scope (Owner) gebunden (`Tag.ownerId`); Eindeutigkeit pro Scope `(ownerId, name)`. GET/POST/DELETE Tags erfordern Scope (Query `ownerId` oder `contextId`; ohne Parameter → 400). Dokumente dürfen nur Tags desselben Kontext-Scopes zugewiesen bekommen (Validierung bei POST/PATCH Document). Rechte: Lesen = canReadScopeForOwner; Anlegen/Löschen = canCreateTagForOwner (Scope-Lead/Admin, bei Personal der Nutzer selbst).
- [x] **Markdown-Editor + Vorschau:** Markdown-Quelltext (Textarea), Vorschau per react-markdown (Tab „Preview“); Darstellung konsistent mit Lese-Ansicht.
- [x] **Anzeige mit Rechte-Checks:** GET `/documents/:id` liefert `canWrite`/`canDelete`; GET Process/Project liefert `canWriteContext`; UI zeigt Edit/Delete bzw. „New document“ nur bei Berechtigung.
- [x] **Anlegen/Bearbeiten/Löschen von Dokumenten in Kontexten:** Dokumentenliste auf Kontext-Detail-Seite (Process/Project), „New document“-Modal, DocumentPage mit Lese-/Bearbeiten-Modus, PATCH/DELETE; Recent Items beim Öffnen eines Dokuments. Create-Button als Menu (Process | Project | Document); bei Document nur Kontext + Titel im Modal, **kein Redirect** nach Anlegen – Nutzer bleibt auf der Seite.
- [x] **Subcontext-UI (Unterkontexte unter Projekten):** Auf Projekt-Detailseite Block „Unterkontexte“ mit Liste und „Unterkontext anlegen“; Subcontext-Detailseite (`/subcontexts/:subcontextId`) mit Dokumentenliste, „Neues Dokument“, Bearbeiten/Löschen; GET Subcontext liefert `canWriteContext`; Breadcrumb/Link „Unterkontext von [Projektname]“.
- [x] **Kontextfreie Drafts (Teil 2):** Document.contextId optional (Prisma + Migration). Rechte: bei contextId null nur Creator (createdById) und Grants (canRead/canWrite); getWritableCatalogScope um documentIdsFromCreator erweitern; POST /documents mit optionalem contextId (ohne = Draft ohne Kontext); PATCH contextId (null → Kontext) erlauben; Publish nur mit Kontext. Frontend: „Draft ohne Kontext“ im Create-Menü (Personal), Anzeige in Drafts-Tab/Card, DocumentPage „Assign to context“, Catalog.
- [x] **Trash & Archive (Personal & Organization):** Trash-Tab (soft-deleted documents/drafts), GET `/me/trash`, POST `/documents/:id/restore`; Archive-Tab (archivierte Dokumente), Document.archivedAt (Prisma + Migration), GET `/me/archive`, PATCH document.archivedAt; Catalog/Listen filtern archivierte Dokumente aus; Tabs auf Personal-, Company-, Department- und Team-Seite (Sichtbarkeit: Admin oder Scope-Lead, Rechte nach unten).
- [x] **Kontext Trash & Archive (Variante B):** Schema: Process/Project mit `archivedAt`; Soft-Delete (DELETE Kontext → deletedAt + Kaskade auf Dokumente, Pins entfernen); POST restore/unarchive für Kontexte; POST documents/restore bei trashed Kontext = Abkoppeln (contextId null). GET /me/trash und /me/archive inkl. Kontexte (items mit type document|process|project, displayTitle, Filter/Sort), Scopes **personal**, **company**, **department**, **team**. **Rechte §4b:** Schreib-Tabs (Drafts, Trash, Archive) nur für Admin oder Scope-Lead (Company/Department/Team Lead; Rechte gelten nach unten); GET /me/drafts – offene PRs nur für Schreiber (writable); bei fehlendem Zugriff leere Liste (kein 403). Frontend: Trash/Archive als Tabelle (Filter Typ, Sort, Restore/Unarchive pro Zeile); „Move to trash“ und „Archive“ an Kontexten; Archive/Unarchive auf DocumentPage. Einheitliche Regel: `canShowWriteTabs(me, canManage)` (lib/canShowWriteTabs.ts).

---

## 15. Versionierung & PR-Workflow

**Versionierung nur für veröffentlichte Dokumente.** Snapshots (Versionen) entstehen ausschließlich (a) bei der **ersten Veröffentlichung** eines Dokuments (Draft → Published) und (b) bei **Merge** eines PRs in die veröffentlichte Version. Keine Versionen für reine Draft-Zustände; Speichern eines Drafts erzeugt keine neue Version.

**Workflow:** (1) Draft anlegen. (2) Veröffentlichung eines Drafts → erzeugt ersten Snapshot (Version). (3) Weitere Änderungen → Bearbeitung in einem Draft (Speichern ohne neue Version). (4) Antrag stellen → Draft als PR einreichen. (5) Antrag annehmen (Merge) → Draft wird Teil des veröffentlichten Dokuments → neuer Snapshot (neue Version).

Datenmodell: [Prisma-Schema-Entwurf](Prisma-Schema-Entwurf.md) (§3, §8), [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md). Umsetzung in **Phasen 15a–15e**.

### 15a. Datenmodell, Rechte, Sichtbarkeit (Draft/Published)

Detaillierter Plan: [Plan-15a-Datenmodell-Rechte-Sichtbarkeit](Plan-15a-Datenmodell-Rechte-Sichtbarkeit.md).

- [x] **Prisma-Schema:** Document um `currentPublishedVersionId` (→ DocumentVersion) ergänzen; Modelle **DocumentVersion**, **DraftRequest**, **DocumentDraft** (pro User, mit basedOnVersionId) anlegen. Migration ausführen. Schema: [Prisma-Schema-Entwurf §8](Prisma-Schema-Entwurf.md#8-versionierung--pr-geplant).
- [x] **Rechte:** `canPublishDocument(prisma, userId, documentId)` und `canMergeDraftRequest(prisma, userId, draftRequestId)` (beide über canWriteContext); Export und Tests.
- [x] **Sichtbarkeit Draft:** Dokumente mit `publishedAt == null` nur für Nutzer mit `canWrite` (oder isAdmin) sichtbar. **Catalog** und **GET `/documents/:id`** sowie **Listen in Kontexten** anpassen: Filter „published ODER canWrite“ über getWritableCatalogScope (o.ä.), keine N×canWrite. Bei GET document (Draft, Nutzer ohne canWrite): **403 Forbidden** (nicht 404). Response GET document um `canPublish` ergänzen.
- [x] **Dokument-Status:** `publishedAt: DateTime?` (null = Draft) nutzen; Sichtbarkeit wie oben. [Prisma-Schema-Entwurf §3](Prisma-Schema-Entwurf.md#3-dokumente).

**Ergebnis 15a:** Draft-Dokumente sind nur für Schreiber/Scope-Lead sichtbar; Leser sehen nur veröffentlichte; Basis für Publish/PR in 15b/15c.

### 15b. Publish & Versionen (Snapshot, History, Diff)

- [x] **Snapshots/Full-Version:** Version = Snapshot mit vollem Inhalt; nur bei Veröffentlichung und bei Merge (vgl. §8). Optional: Policy „nur letzte N Versionen“.
- [x] **API:** POST `/documents/:id/publish` (Scope-Lead), GET `/documents/:id/versions`, GET `/documents/:id/versions/:versionId`.
- [x] **DocumentPage:** Badge Draft/Published, Button **„Publish“** (wenn canPublish), **History** (Versionsliste), **Versionsvergleich** (zwei Versionen, Diff rot/grün, z. B. diff-match-patch).

**Ergebnis 15b:** Erstes Veröffentlichen erzeugt Version 1; Nutzer können Versionen ansehen und zwei Versionen vergleichen.

### 15c. PR-Workflow & DocumentDraft (pro User)

- [x] **Drafts (zwei Arten):** (1) Unveröffentlichte Dokumente, (2) PRs (eingereichte Änderungen). Nur Writer (und Scope-Lead) reichen PRs ein; Merge nur Scope-Lead (vgl. [Rechtesystem 6b](../platform/datenmodell/Rechtesystem.md)).
- [x] **API:** POST/GET `/documents/:id/draft-requests`, PATCH `/draft-requests/:id` (merge/reject, nur Scope-Lead); Merge in Transaction. GET/PUT `/documents/:id/draft` (DocumentDraft pro User, basedOnVersionId).
- [x] **DocumentPage:** Bearbeitung an veröffentlichtem Dokument im **DocumentDraft**; Button **„Submit for review“** (PR aus Draft-Inhalt); Scope-Lead: Merge/Reject von PRs.
- [x] Merge in Hauptversion (wie in §8); Garbage Collection für alte Drafts optional später.

**Ergebnis 15c:** Vollständiger PR-Flow; mehrere offene PRs möglich; DocumentDraft mit basedOnVersionId.

### 15d. „Auf neueste Version updaten“ (3-Wege-Merge, Konflikte)

- [x] **API:** POST `/documents/:id/draft/update-to-latest` (Basis/Theirs/Ours → 3-Wege-Merge; bei Konflikten Response mit mergedContent + Konflikt-Info).
- [x] **DocumentDraft:** basedOnVersionId beim Anlegen/Öffnen setzen; nach Update: Merged-Text speichern, basedOnVersionId = currentPublishedVersionId.
- [x] **DocumentPage:** Hinweis „Sie arbeiten mit alter Version“, Button **„Auf neueste Version updaten“**; Konflikte anzeigen und lösen lassen; Merged-Text speichern (vgl. [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md)).

**Ergebnis 15d:** Mehrere Bearbeiter können ihren Draft auf den neuesten Stand bringen; Konflikte werden in der UI aufgelöst.

### 15e. Drafts-Listen-UI (Tab, Card, Dashboard)

- [x] **API:** GET `/api/v1/me/drafts` (Query: scope, companyId, departmentId, teamId; optional scope=shared). Response: draftDocuments, openDraftRequests.
- [x] **Drafts-Tab:** Auf Scope-Pages (Personal, Company, Department, Team, ggf. Shared) Tab „Drafts“ mit unveröffentlichten Dokumenten und offenen PRs des Scopes.
- [x] **Drafts-Card:** Auf Overview-Seiten (Personal, Company, Department, Team) Card „Drafts“ (z. B. neueste 5).
- [x] **Dashboard-Block:** Auf der Startseite Block „Drafts / Pending review“ (aggregiert über alle Scopes).

**Ergebnis 15e:** Zentrale Übersicht über Drafts und offene PRs (Tab, Card, Dashboard).

---

## 16. Objekt-Speicher (MinIO)

Basis für PDF-Export-Downloads (§17); Markdown-Inhalte bleiben in der DB, Binärdateien in MinIO.

- [x] S3-Client (MinIO) im Backend anbinden
- [x] Upload/Download für Anhänge, Bilder und Exporte (z. B. PDF aus §17) in Dokumenten
- [x] Speicherorte in DB referenzieren (z. B. `Document.pdfUrl` für Export-PDFs; vgl. §17); Berechtigungen vor Download prüfen
- [x] **Speicherübersicht (Assets aus MinIO):** Nutzung/Speicher pro Nutzer sichtbar – **Nutzer:** nur eigene Nutzung; **Team-Lead:** Nutzung aller Team-Mitglieder; **Department-Lead:** Nutzung aller Members der Abteilung (alle Teams der Abteilung); **Company-Lead / Admin:** Nutzung aller Abteilungen.
- [x] **Speicherübersicht im Frontend:** Settings-Tab „Storage“ mit Scope-Auswahl (Personal, Team/Department/Company für Leads/Admin), Anzeige von genutzten Bytes und Anhänge-Anzahl; bei Lead-Scope Tabelle „pro Nutzer“.

---

## 17. Async Jobs

- [ ] pg-boss einbinden (Queue, Worker)
- [ ] Worker-Prozess oder -Container für Jobs
- [ ] Jobs: Volltext-Index aktualisieren; **Markdown-Dokumente per Pandoc exportierbar** (z. B. PDF); Pandoc-Befehl/Formel konfigurierbar (Details in der Umsetzung); ggf. Benachrichtigungen
- [ ] Job-Status/Ergebnis (z. B. Download-Link für PDF) für Frontend
- [ ] **Optional: Dashboard-Platzhalter für Benachrichtigungen/Updates** (später an Async Jobs anbinden)

---

## 18. Volltextsuche & Suchseite

- [ ] PostgreSQL Full-Text-Search oder externe Engine (Meilisearch/Typesense)
- [ ] Such-API (Query, Filter nach Kontext/Team)
- [ ] **Suchseite:** Dedizierte Route (z. B. `/search`) mit einheitlicher Such-UI; Anbindung an Volltextsuche (Filter, Tags). Bei Aufruf aus dem Dashboard im **KI-Modus** (vgl. §13): gleiche Suchseite, aber **KI-Chat-Ansicht** – Nutzer sieht Konversation (Frage → Antwort + Quellen), Fortsetzung des Dialogs möglich. Normal-Modus: klassische Trefferliste (Dokumente, Kontexte). Eine Suchseite, zwei Darstellungsmodi (Listen- vs. Chat-UI) je nach Herkunft oder expliziter Umschaltung.
- [ ] Such-UI auf Dashboard (Suchleiste + Schalter §13), optional Suchfeld in Sidebar (§20)

---

## 19. Deployment & Doku

- [ ] `install.sh` und ggf. `scripts/update.sh` finalisieren
- [ ] CI-Job für Install-Skript-Test (bereits in Abschnitt 1 angelegt; hier finalisieren)
- [ ] CI erweitern: Frontend-Tests (Unit/Component), optional E2E (z. B. Playwright)
- [ ] Caddy-Config im Repo, Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy
- [ ] Backup-Konzept (DB, MinIO), Hinweis in App vor Update
- [ ] README: Voraussetzungen, Installation, Update
- [ ] **DocsOps-Demo online:** Demo-Instanz online stellen, sobald die Plattform nutzbar ist.
- [ ] **Optionale öffentliche Seiten für Demo:** Per Feature-Flag (z. B. `VITE_LANDING_PAGE_ENABLED`) schaltbar: **(1) Landing** unter `/` (Produktname, Kurzbeschreibung, „Sign in“ / „Try demo“, Link zu Docs); **(2) Docs-Page** unter `/docs` – eine öffentliche Dokumentation mit Abschnitten z. B. Features/Versionen (Changelog), Getting started, optional API-Überblick (ohne vollständige OpenAPI); Inhalte statisch (Markdown) oder aus Build. Wenn Flag aus: bisheriges Verhalten (Redirect zu Login bzw. Home). Nützlich für öffentliche Demo-URL; intern bleibt reiner Login-Einstieg.

---

## 20. Layout- & UX-Ergänzungen (Phase 2)

- [ ] **Optionale öffentliche Seiten (Demo):** Siehe §19 (Landing + Docs per Flag). UI/UX: Landing (Logo, Titel „DocsOps“, Untertitel, CTA „Sign in“ / „Try demo“, Link „Docs“); Docs-Page (`/docs`) mit Struktur Features/Versionen, Getting started, ggf. API-Überblick.
- [ ] **Suchfeld in der Sidebar:** Anbindung an Volltextsuche (vgl. Abschnitt 18).
- [ ] **Tabs auf Kontext-Detailseiten:** Tabs (z. B. „Documents“ | „Subcontexts“ | „Settings“ | „History“) lohnen sich, wenn pro Kontext noch mehr dazu kommt (Mitglieder, Einstellungen, Nutzung/History). Aktuell keine Tabs auf Process/Project/Subcontext-Detail; bei Erweiterung um diese Bereiche Tabs einführen.
- [ ] **Breadcrumbs:** Pfad anzeigen: Scope → Kontext (Process/Project) → ggf. Subcontext → Dokument; klickbare Links für jede Ebene. Scope = Personal/Company/Department/Team, dann Kontext/Subcontext/Dokument (umgesetzt für Kontext-, Subcontext- und Dokument-Detailseiten).
- [ ] **Pin Sidebar:** Sidebar ein-/ausklappbar, Option in Settings („Pin“).
- [ ] **Theme-UI:** Umschaltung Hell/Dunkel/Auto in Settings (Abschnitt 8), persistiert im Backend; technische Vorbereitung dort umgesetzt.
- [ ] **Notifications-UI in Settings:** Notifications-Card in Settings mit konkreten Optionen (E-Mail bei Dokument-Änderungen, PRs, Erinnerungen), Anbindung an Async Jobs / Preferences (vgl. §17).
- [ ] **Responsiv:** Sidebar auf kleinen Viewports (Overlay/Hamburger) definieren und umsetzen.
- [ ] **Icons & A11y:** Einheitliche Icon-Bibliothek; Tastatur/Screenreader für Sidebar und Tabs.
- [ ] **DocsOps-Anleitung im Personal:** Im persönlichen Bereich (in einem Prozess) automatisch ein erstes Dokument „Anleitung für DocsOps“ (z. B. bei erstem Aufruf von /personal oder via Seed/Setup). **Pro Scope/Rolle:** Anleitung rollen-/scope-spezifisch (z. B. Team Lead, Nutzer, Department Lead). **Settings:** Anleitungs-Doku pro Scope ausblendbar (Persistenz in User-Preferences, z. B. `hideGuideInScope`). Hängt vom fertigen Produktstand ab.

---

## 21. Optional: KI-Assistent (Dokumenten-Frage)

**Ziel:** Auf der Startseite (oder eigener Block) eine **KI-Suche**, mit der Nutzer ihre **zugreifbaren Dokumente** in natürlicher Sprache befragen können (z. B. „Welche Prozesse gibt es für Onboarding?“). Antworten basieren nur auf Dokumenten, auf die der Nutzer Leserecht hat. **Jede Antwort enthält Quellen:** Links zu den Dokumenten, aus denen die Antwort abgeleitet wurde. **Sichere DB-Nutzung:** Die KI darf nur über definierte Wege auf Daten zugreifen – siehe [KI – Datenbank sicher durchsuchen](../platform/KI-Datenbank-sicher-durchsuchen.md) (RAG, optional Agent mit nutzerabhängigen Tools/MCP; nur Dokument-Fragen erlauben; semantische/Volltextsuche für natürlichsprachige Fragen).

- [ ] **Abhängigkeiten:** Volltext- oder Vektorsuche über Dokumentinhalte (vgl. §18); Rechtefilter (lesbare Kontexte + Grant-Dokumente, analog `getReadableCatalogScope`) – nur diese Dokumente dürfen in die KI-Anfrage.
- [ ] **Backend:** Endpoint (z. B. `POST /api/v1/ask`): Frage entgegennehmen, lesbare Dokument-IDs für den Nutzer ermitteln, **Retrieval** (relevante Passagen nur aus diesen Dokumenten; pro Passage Dokument-ID und ggf. Titel mitführen), **RAG**: Prompt aus Treffern bauen, Aufruf einer LLM-API; Response enthält **Antworttext** und **Quellen** (z. B. `sources: [{ documentId, title, excerpt? }]`), damit das Frontend Links zu `/documents/:id` anzeigen kann.
- [ ] **Sicherheit:** Rechteprüfung ausschließlich im Backend; keine Dokumentinhalte an die KI senden, auf die der Nutzer keinen Zugriff hat. Keine Rechte-Logik im Frontend. **Kein direkter DB-Zugriff durch die KI** – nur über Backend-APIs und feste Retrieval-Pfade (vgl. Plattform-Doku oben).
- [ ] **Startseite / Suchseite:** Suchleiste mit Schalter Normal/KI (§13); KI-Modus führt zur **Suchseite mit KI-Chat** (§18): Konversationsverlauf, Antwort + Quellen, Fortsetzung des Dialogs. Optional: Rate-Limits, Caching, Audit-Log.
- [ ] **Chat-History & Token pro User:** Backend speichert Chat-Verläufe pro Nutzer (für Suchseite und Admin-Übersicht); Token-Verbrauch pro Anfrage erfassen und pro User aggregieren – Anzeige in Admin (§9: Chat-History pro User, Token-Verbrauch pro User).
- [ ] **Kosten/Betrieb:** LLM-API-Kosten und Latenz pro Anfrage; Konfiguration über Umgebungsvariablen (API-Key, Endpoint); **Admin: KI-Settings** (§9) für Feature-Flag und Konfiguration.

**Ergebnis:** Nutzer können (Dashboard/Suchseite) im KI-Modus Fragen in natürlicher Sprache stellen und erhalten eine Antwort mit **Links zu den Quell-Dokumenten**, ausschließlich aus Dokumenten, die sie lesen dürfen. Admin hat Übersicht über KI-Settings, Chat-History und Token-Verbrauch pro User.
