# Permission-Oberflächen-Analyse – Backend API

Diese Analyse prüft, ob jede API-Route des Backends konsistent durch das Permission-System geschützt ist. Fokus: Zugriffsregeln für documents, contexts, assignments, organisation, pinned, admin und user data. Basis: [Dokument-Lifecycle-Analyse](Dokument-Lifecycle-Analyse.md). Alle Routen haben das Präfix **/api/v1**.

---

## A. Gefundene API-Routen

Vollständige Liste der HTTP-Endpunkte (aus `backend/src/routes/` + `auth/routes.ts`). Auth-Routen: nur `requireAuthPreHandler` wo angegeben; Organisation/Context/Documents/Assignments/Pinned/Me/Admin siehe Spalte Permission.

### Auth (`auth/routes.ts`)

| Methode | Pfad         | PreHandler            | Permission im Handler |
| ------- | ------------ | --------------------- | --------------------- |
| POST    | /auth/login  | —                     | — (öffentlich)        |
| POST    | /auth/logout | —                     | — (Cookie)            |
| GET     | /auth/me     | requireAuthPreHandler | — (eigener User)      |

### Organisation (`organisation.ts`)

| Methode | Pfad                              | PreHandler                                    | Permission im Handler |
| ------- | --------------------------------- | --------------------------------------------- | --------------------- |
| GET     | /companies                        | requireAuthPreHandler                         | —                     |
| POST    | /companies                        | requireAuthPreHandler, requireAdminPreHandler | —                     |
| GET     | /companies/:companyId             | requireAuthPreHandler                         | —                     |
| PATCH   | /companies/:companyId             | requireAuthPreHandler, requireAdminPreHandler | —                     |
| DELETE  | /companies/:companyId             | requireAuthPreHandler, requireAdminPreHandler | —                     |
| GET     | /companies/:companyId/departments | requireAuthPreHandler                         | —                     |
| POST    | /companies/:companyId/departments | requireAuthPreHandler, requireAdminPreHandler | —                     |
| GET     | /departments/:departmentId        | requireAuthPreHandler                         | —                     |
| PATCH   | /departments/:departmentId        | requireAuthPreHandler, requireAdminPreHandler | —                     |
| DELETE  | /departments/:departmentId        | requireAuthPreHandler, requireAdminPreHandler | —                     |
| GET     | /departments/:departmentId/teams  | requireAuthPreHandler                         | —                     |
| POST    | /departments/:departmentId/teams  | requireAuthPreHandler, requireAdminPreHandler | —                     |
| GET     | /teams/:teamId                    | requireAuthPreHandler                         | —                     |
| PATCH   | /teams/:teamId                    | requireAuthPreHandler, requireAdminPreHandler | —                     |
| DELETE  | /teams/:teamId                    | requireAuthPreHandler, requireAdminPreHandler | —                     |

### Contexts (`contexts.ts`)

| Methode | Pfad                             | PreHandler            | Permission im Handler                  |
| ------- | -------------------------------- | --------------------- | -------------------------------------- |
| GET     | /processes                       | requireAuthPreHandler | canReadContext pro Eintrag (gefiltert) |
| POST    | /processes                       | requireAuthPreHandler | canCreateProcessOrProjectForOwner      |
| GET     | /processes/:processId            | requireAuthPreHandler | canReadContext, canWriteContext        |
| PATCH   | /processes/:processId            | requireAuthPreHandler | canWriteContext                        |
| DELETE  | /processes/:processId            | requireAuthPreHandler | canWriteContext                        |
| POST    | /processes/:processId/restore    | requireAuthPreHandler | canWriteContext                        |
| GET     | /projects                        | requireAuthPreHandler | canReadContext pro Eintrag             |
| POST    | /projects                        | requireAuthPreHandler | canCreateProcessOrProjectForOwner      |
| GET     | /projects/:projectId             | requireAuthPreHandler | canReadContext, canWriteContext        |
| PATCH   | /projects/:projectId             | requireAuthPreHandler | canWriteContext                        |
| POST    | /projects/:projectId/restore     | requireAuthPreHandler | canWriteContext                        |
| POST    | /projects/:projectId/subcontexts | requireAuthPreHandler | canWriteContext (Project)              |
| GET     | /projects/:projectId/subcontexts | requireAuthPreHandler | canReadContext                         |
| DELETE  | /projects/:projectId             | requireAuthPreHandler | canWriteContext                        |
| POST    | /projects/:projectId/subcontexts | (siehe oben)          | canWriteContext                        |
| GET     | /subcontexts/:subcontextId       | requireAuthPreHandler | canReadContext, canWriteContext        |
| PATCH   | /subcontexts/:subcontextId       | requireAuthPreHandler | canWriteContext (Project)              |
| DELETE  | /subcontexts/:subcontextId       | requireAuthPreHandler | canWriteContext (Project)              |

### Documents (`documents.ts`)

Zielbild für Bearbeitung veröffentlichter Inhalte: [Edit-System-Plan](Edit-System-Blocks-Suggestions-Lead-Draft.md). Die **vollständige** Route-Liste und jede Permission-Prüfung sind maßgeblich im Quellcode unter `apps/backend/src/routes/documents.ts` (und zugehörigen Services) — die Tabelle nennt die zentralen Les-/Schreib-Pfade.

| Methode | Pfad                                             | PreHandler                                            | Permission im Handler                            |
| ------- | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| GET     | /documents                                       | requireAuthPreHandler                                 | getReadableCatalogScope (Where-Filter)           |
| GET     | /contexts/:contextId/documents                   | requireAuthPreHandler                                 | canReadContext, canWriteContext                  |
| POST    | /documents                                       | requireAuthPreHandler                                 | canWriteContext (wenn contextId), sonst nur Auth |
| GET     | /documents/:documentId                           | requireAuthPreHandler, requireDocumentAccess('read')  | canSeeDocumentInTrash bei Trash                  |
| PATCH   | /documents/:documentId                           | requireAuthPreHandler, requireDocumentAccess('write') | canWriteContext bei contextId-Änderung           |
| DELETE  | /documents/:documentId                           | requireAuthPreHandler                                 | canDeleteDocument                                |
| POST    | /documents/:documentId/restore                   | requireAuthPreHandler                                 | canDeleteDocument oder canSeeDocumentInTrash     |
| GET     | /documents/:documentId/grants                    | requireAuthPreHandler, requireDocumentAccess('read')  | —                                                |
| PUT     | /documents/:documentId/grants/users              | requireAuthPreHandler, requireDocumentAccess('write') | —                                                |
| PUT     | /documents/:documentId/grants/teams              | requireAuthPreHandler, requireDocumentAccess('write') | —                                                |
| PUT     | /documents/:documentId/grants/departments        | requireAuthPreHandler, requireDocumentAccess('write') | —                                                |
| POST    | /documents/:documentId/publish                   | requireAuthPreHandler, requireDocumentAccess('read')  | canPublishDocument                               |
| GET     | /documents/:documentId/versions                  | requireAuthPreHandler, requireDocumentAccess('read')  | —                                                |
| GET     | /documents/:documentId/versions/:versionId       | requireAuthPreHandler, requireDocumentAccess('read')  | —                                                |
| GET     | /documents/:documentId/attachments               | requireAuthPreHandler, requireDocumentAccess('read')  | —                                                |
| POST    | /documents/:documentId/attachments               | requireAuthPreHandler, requireDocumentAccess('write') | —                                                |
| GET     | /documents/:documentId/attachments/:attachmentId | requireAuthPreHandler, requireDocumentAccess('read')  | —                                                |
| DELETE  | /documents/:documentId/attachments/:attachmentId | requireAuthPreHandler, requireDocumentAccess('write') | —                                                |
| GET     | /tags/catalog                                    | requireAuthPreHandler                                 | Catalog-Tags (getReadableCatalogScope)           |
| GET     | /tags                                            | requireAuthPreHandler                                 | canReadScopeForOwner(ownerId)                    |
| POST    | /tags                                            | requireAuthPreHandler                                 | canCreateTagForOwner(ownerId)                    |
| DELETE  | /tags/:tagId                                     | requireAuthPreHandler                                 | canCreateTagForOwner(tag.ownerId)                |

### Assignments (`assignments.ts`)

| Methode | Pfad                                                | PreHandler            | Permission im Handler    |
| ------- | --------------------------------------------------- | --------------------- | ------------------------ |
| GET     | /companies/:companyId/company-leads                 | requireAuthPreHandler | canViewCompany           |
| POST    | /companies/:companyId/company-leads                 | requireAuthPreHandler | canManageCompanyLeads    |
| DELETE  | /companies/:companyId/company-leads/:userId         | requireAuthPreHandler | canManageCompanyLeads    |
| GET     | /teams/:teamId/members                              | requireAuthPreHandler | canViewTeam              |
| POST    | /teams/:teamId/members                              | requireAuthPreHandler | canManageTeamMembers     |
| DELETE  | /teams/:teamId/members/:userId                      | requireAuthPreHandler | canManageTeamMembers     |
| GET     | /teams/:teamId/team-leads                           | requireAuthPreHandler | canViewTeam              |
| POST    | /teams/:teamId/team-leads                           | requireAuthPreHandler | canManageTeamLeaders     |
| DELETE  | /teams/:teamId/team-leads/:userId                   | requireAuthPreHandler | canManageTeamLeaders     |
| GET     | /departments/:departmentId/department-leads         | requireAuthPreHandler | canViewDepartment        |
| POST    | /departments/:departmentId/department-leads         | requireAuthPreHandler | canManageDepartmentLeads |
| DELETE  | /departments/:departmentId/department-leads/:userId | requireAuthPreHandler | canManageDepartmentLeads |

### Pinned (`pinned.ts`)

| Methode | Pfad        | PreHandler            | Permission im Handler                |
| ------- | ----------- | --------------------- | ------------------------------------ |
| GET     | /pinned     | requireAuthPreHandler | getVisiblePinnedScopeIds (Filter)    |
| POST    | /pinned     | requireAuthPreHandler | canPinForScope + canRead(documentId) |
| DELETE  | /pinned/:id | requireAuthPreHandler | canPinForScope                       |

### Me (`me.ts`)

| Methode | Pfad                   | PreHandler            | Permission im Handler                                    |
| ------- | ---------------------- | --------------------- | -------------------------------------------------------- |
| GET     | /me                    | requireAuthPreHandler | effectiveUserId (eigene Daten)                           |
| GET     | /me/personal-documents | requireAuthPreHandler | ownerUserId = userId (implizit)                          |
| GET     | /me/trash              | requireAuthPreHandler | scope + getTrashOrArchiveItems (leer bei kein Zugriff)   |
| GET     | /me/archive            | requireAuthPreHandler | scope + getTrashOrArchiveItems                           |
| GET     | /me/can-write-in-scope | requireAuthPreHandler | getScopeLead, getWritableCatalogScope                    |
| GET     | /me/shared-documents   | requireAuthPreHandler | Grants des Users (implizit)                              |
| GET     | /me/drafts             | requireAuthPreHandler | getDraftsScope, writable (implizit)                      |
| PATCH   | /me                    | requireAuthPreHandler | userId = request.user.id (nur eigenes Profil)            |
| GET     | /me/storage            | requireAuthPreHandler | canPinForScope bei team/department/company               |
| POST    | /me/deactivate         | requireAuthPreHandler | userId = request.user.id + isAdmin-Check (letzter Admin) |
| GET     | /me/preferences        | requireAuthPreHandler | effectiveUserId                                          |
| PATCH   | /me/preferences        | requireAuthPreHandler | request.user.id (nur eigenes)                            |
| PATCH   | /me/account            | requireAuthPreHandler | request.user.id (nur eigenes)                            |
| GET     | /me/sessions           | requireAuthPreHandler | request.user.id (eigene Sessions)                        |
| DELETE  | /me/sessions           | requireAuthPreHandler | request.user.id (eigene löschen)                         |

### Admin (`admin.ts`)

| Methode                | Pfad                             | PreHandler              | Permission im Handler |
| ---------------------- | -------------------------------- | ----------------------- | --------------------- |
| POST                   | /admin/impersonate               | preAdmin (Auth + Admin) | —                     |
| DELETE                 | /admin/impersonate               | preAdmin                | —                     |
| GET                    | /admin/users                     | preAdmin                | —                     |
| GET                    | /admin/users/:userId             | preAdmin                | —                     |
| PATCH                  | /admin/users/:userId             | preAdmin                | —                     |
| POST                   | /admin/users                     | preAdmin                | —                     |
| GET                    | /admin/departments/member-counts | preAdmin                | —                     |
| (weitere Admin-Routen) | preAdmin                         | —                       |

---

## B. Permission-Surface-Map

Kompakte Tabelle: **Route | Permission | Scope Level | Ownership Check | Risiko**.

| Route                                                                        | Permission                                                    | Scope Level             | Ownership Check   | Risiko                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------- | ----------------- | ------------------------------- |
| GET /documents                                                               | getReadableCatalogScope (Where)                               | catalog                 | implizit in Where | low                             |
| GET /documents/:id                                                           | requireDocumentAccess('read'), canSeeDocumentInTrash          | document                | canRead(doc)      | low                             |
| POST /documents                                                              | canWriteContext / nur Auth (kontextfrei)                      | context / —             | —                 | low                             |
| PATCH /documents/:id                                                         | requireDocumentAccess('write'), canWriteContext bei contextId | document                | canWrite(doc)     | low (nur Metadaten)             |
| POST /documents/:id/archive                                                  | requireDocumentAccess('write')                                | document                | canWrite(doc)     | low                             |
| DELETE /documents/:id                                                        | canDeleteDocument                                             | document/context        | canWriteContext   | low                             |
| POST /documents/:id/restore                                                  | canDeleteDocument oder canSeeDocumentInTrash                  | document                | Owner/Lead        | low                             |
| POST /documents/:id/publish                                                  | canPublishDocument                                            | document/context        | canWriteContext   | low                             |
| GET/PUT …/grants/\*                                                          | requireDocumentAccess read/write                              | document                | canRead/canWrite  | low                             |
| GET /contexts/:contextId/documents                                           | canReadContext, canWriteContext                               | context                 | —                 | low                             |
| GET /processes, /projects                                                    | canReadContext pro Item                                       | context                 | —                 | low                             |
| GET /processes/:id, /projects/:id                                            | canReadContext, canWriteContext                               | context                 | —                 | low                             |
| PATCH/DELETE /processes/:id, /projects/:id                                   | canWriteContext                                               | context                 | —                 | low                             |
| POST …/restore (process/project)                                             | canWriteContext                                               | context                 | —                 | low                             |
| Subcontexts                                                                  | canReadContext, canWriteContext (Project)                     | context                 | —                 | low                             |
| GET /companies, /companies/:id                                               | canViewCompany (optional) / nur Auth                          | company                 | —                 | low (mit Check) / medium (ohne) |
| GET /companies/:id/departments                                               | canViewCompany (optional)                                     | company                 | —                 | low / medium                    |
| GET /departments/:id, /departments/:id/teams                                 | canViewDepartment (optional)                                  | department              | —                 | low / medium                    |
| GET /teams/:id                                                               | canViewTeam (optional)                                        | team                    | —                 | low / medium                    |
| POST/PATCH/DELETE Organisation                                               | requireAdminPreHandler                                        | —                       | —                 | low                             |
| GET/POST/DELETE …/company-leads, …/members, …/team-leads, …/department-leads | canView*, canManage*                                          | company/department/team | —                 | low                             |
| GET /pinned                                                                  | getVisiblePinnedScopeIds                                      | scope                   | —                 | low                             |
| POST /pinned                                                                 | canPinForScope, canRead(doc)                                  | scope, document         | —                 | low                             |
| DELETE /pinned/:id                                                           | canPinForScope                                                | scope                   | —                 | low                             |
| GET /me/\*                                                                   | Auth, effectiveUserId / scope-Filter                          | user / scope            | —                 | low                             |
| PATCH /me, /me/preferences, /me/account                                      | nur eigenes (request.user.id)                                 | user                    | —                 | low                             |
| GET /me/storage (team/dept/company)                                          | canPinForScope                                                | scope                   | —                 | low                             |
| POST /me/deactivate                                                          | Auth, isAdmin (letzter Admin)                                 | user                    | —                 | low                             |
| Admin-Routen                                                                 | requireAdminPreHandler                                        | —                       | —                 | low                             |
| GET /tags                                                                    | canReadScopeForOwner(ownerId)                                 | owner                   | —                 | low                             |
| POST /tags                                                                   | canCreateTagForOwner(ownerId)                                 | owner                   | —                 | low                             |
| DELETE /tags/:id                                                             | canCreateTagForOwner(tag.ownerId)                             | owner                   | —                 | low                             |
| GET /tags/catalog                                                            | Catalog-Scope (getReadableCatalogScope)                       | catalog                 | —                 | low                             |

---

## C. Routen ohne oder mit schwachen Checks

- **Organisation GET (optional mit Scope-Permissions):**  
  **GET /companies**, **GET /companies/:companyId**, **GET /companies/:companyId/departments**, **GET /departments/:departmentId**, **GET /departments/:departmentId/teams**, **GET /teams/:teamId** können mit **canViewCompany**, **canViewDepartment**, **canViewTeam** abgesichert werden (bei false 403); GET /companies kann auf sichtbare Companies gefiltert werden. Ohne diese Prüfung sieht jeder angemeldete Nutzer die komplette Struktur (oft gewollt bei Single-Tenant).

- **POST /documents ohne contextId:**  
  Nur Auth; jeder angemeldete User kann kontextfreie Drafts anlegen. Kein canWriteContext (weil kein Kontext). Akzeptabel (Drafts sind erstmal nur für Ersteller sichtbar).

- **Me-Routen (eigene Daten):**  
  GET/PATCH /me, /me/preferences, /me/account, /me/sessions nutzen `request.user.id` bzw. effectiveUserId; es werden nur eigene Daten gelesen/geändert. Kein zusätzlicher Objekt-Permission-Check nötig.

---

## D. Duplizierte Permission-Logik

- **can-write-in-scope:** Die Logik ist in eine Hilfsfunktion **canWriteInScope(prisma, userId, scopeRef)** (permissions) ausgelagert; GET /me/can-write-in-scope ruft sie für company/department/team auf.

- **Routen:** Es gibt **keine** Inline-Checks der Form `if (user.isAdmin) …` oder `if (user.id === ownerId)` für Zugriffsentscheidungen in den Route-Handlern (außer in me.ts für „eigenes Profil“ und deactivate). Alle dokument- und kontextbezogenen Entscheidungen laufen über Funktionen in `permissions/`.

- **Frontend:** Siehe Abschnitt F; keine Backend-Permission-Logik im Frontend nachgebaut für Dokument-Zugriff.

---

## E. Hierarchie-Analyse

- **Auflösung:**  
  **scopeResolution.ts:** `getContextIdsForScope(scopeRef)` liefert alle Kontext-IDs für Company/Department/Team (Organisation → Kontexte).  
  **scopeLead.ts:** `getScopeLead(prisma, userId, scopeRef)` entscheidet, ob der User Scope-Lead ist (Company Lead, Department Lead oder Team Lead für den Scope). Hierarchie: Company → Department → Team; Rechte „nach unten“ (Company Lead sieht Company-Scope, Department Lead Department + Teams, Team Lead nur Team).

- **Rechtevererbung:**
  - **Lesen:** canRead (Document) berücksichtigt Company Lead, Department Lead, Owner (ownerUserId), Grants. Leserechte werden „nach oben“ vererbt (Rechtesystem).
  - **Schreiben Kontext:** canWriteContext = Scope-Lead der Owner-Unit oder expliziter Writer-Grant am Dokument. Keine Quer-Vererbung.
  - **Dokument:** canRead/canWrite/canDeleteDocument/canPublishDocument nutzen alle entweder Kontext-Owner (canWriteContext) oder Dokument-Grants; keine Umgehung der Hierarchie.

- **Sonderfälle:**
  - Kontextfreie Dokumente (contextId null): nur createdById und Grants; canPublishDocument = false bis contextId gesetzt.
  - Trash: canSeeDocumentInTrash prüft Owner (ownerUserId, companyId, departmentId, teamId) bzw. createdById für kontextfreie Docs.
  - Persönliche Kontexte (ownerUserId): nur Owner und explizite Grants; Company Lead hat kein automatisches Leserecht.

- **Einzelne Routen:** Keine Route umgeht die Hierarchie; Organisation-GET-Routen prüfen gar keine Scope-Zugehörigkeit (siehe C).

---

## F. Frontend-Permission-Logik

- **Dokument:**  
  canWrite, canDelete, canPublish kommen aus der **GET /api/v1/documents/:id** Response. Das Frontend zeigt Buttons (Edit, Publish, Archive, Delete, Assign) ausschließlich basierend auf diesen Feldern. **Keine** eigene Ableitung von Rollen oder Ownership für Zugriffsentscheidungen auf Dokumentebene.

- **Scope (Drafts/Trash/Archive-Tabs):**  
  **canShowWriteTabs(me, canManage)** in `lib/canShowWriteTabs.ts`: `me?.user?.isAdmin === true || canManage`. `canManage` wird pro Seite aus **GET /me** (identity: companyLeads, departmentLeads, teamLeads) und ggf. Team/Department-Lead-Zugehörigkeit berechnet. Das entspricht der Backend-Logik „Scope-Lead oder Admin“, ist aber **im Frontend aus Identity abgeleitet**, nicht aus einem Aufruf von GET /me/can-write-in-scope. Nur UI-Sichtbarkeit; keine sicherheitskritische Entscheidung (Backend filtert Trash/Archive/Drafts ohnehin).

- **Rollen-/Ownership-Checks:**  
  Keine Stellen wie `if (document.ownerId === user.id)` oder `if (user.role === 'admin')` für **Sicherheitsentscheidungen**. `isAdmin` und identity werden für Anzeige (Tabs, Admin-Link) genutzt. Akzeptabel.

---

## G. Sicherheitsrisiken

1. **Organisation: Optional Scope-Checks**  
   GET /companies, /companies/:id, … können mit canViewCompany/canViewDepartment/canViewTeam abgesichert werden (siehe H.2). Ohne diese Prüfung sieht jeder angemeldete Nutzer die Struktur (Single-Tenant oft gewollt).

2. **Keine weiteren kritischen Lücken**  
   Alle mutierenden Aktionen (POST/PUT/PATCH/DELETE) auf Dokumenten, Kontexten, Assignments, Pinned, Tags und Admin sind durch Auth + entweder requireDocumentAccess, canWriteContext, canDeleteDocument, canPublishDocument, canPinForScope, canView*/canManage*, canReadScopeForOwner/canCreateTagForOwner oder requireAdmin abgesichert. Me-Routen operieren auf effectiveUserId/request.user.id (eigene Ressourcen).

---

## H. Empfohlene Minimalverbesserungen

1. **PATCH /documents/:id** – Erledigt: Lifecycle-Felder (publishedAt, archivedAt) aus PATCH entfernt; nur über POST …/publish, POST …/archive, POST …/restore. documentService zentralisiert Lifecycle-Logik.

2. **Organisation GET optional absichern** (umgesetzt bei Bedarf)  
   Falls die Organisationsstruktur nicht für alle sichtbar sein soll: Vor Auslieferung von GET /companies/:id, GET /companies/:id/departments, GET /departments/:id, GET /departments/:id/teams, GET /teams/:id **canViewCompany**, **canViewDepartment**, **canViewTeam** aufrufen und bei false 403 zurückgeben. GET /companies (Liste) ggf. auf Einträge filtern, die der User sehen darf (canViewCompany pro Company).

3. **can-write-in-scope** – Erledigt: Hilfsfunktion `canWriteInScope` in permissions; GET /me/can-write-in-scope nutzt sie.

4. **Keine weiteren Änderungen**  
   Keine zentrale „Permission-Service“-Schicht oder Neuarchitektur; Ownership und Scope werden bereits in `permissions/` und documentLoad/contextPermissions konsistent genutzt. Frontend weiterhin nur Backend-Flags für Sichtbarkeit nutzen.

---

**Stand:** Analyse basiert auf Code in `apps/backend/src/routes/`, `apps/backend/src/permissions/`, `apps/backend/src/auth/` und Frontend `lib/canShowWriteTabs.ts`, `pages/DocumentPage.tsx`. Bei Änderungen an Routen oder Permissions sollte diese Analyse aktualisiert werden.
