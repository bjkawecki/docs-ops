# Dokument-Lifecycle – Analyse und Zustandsmaschine

Diese Analyse rekonstruiert den vollständigen Lifecycle von Dokumenten im DocsOps-Backend und -Frontend, identifiziert beteiligte Dateien, Zustandsänderungen, Permission-Checks und Seiteneffekte. Ziel: Prüfung auf Konsistenz und Vollständigkeit der Lifecycle-Operationen.

**Referenzen:** [Prisma-Schema](../platform/datenmodell/Pseudocode%20Datenmodell.md), [Rechtesystem](../platform/datenmodell/Rechtesystem.md), [Versionierung](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md). Implementierung: `apps/backend/`, `apps/frontend/`.

---

## A. Dokument-Lifecycle Übersicht

Erkannte Lifecycle-Events (mit Backend-Endpoint bzw. Ort):

| Event                           | Endpoint / Ort                                                                                       | Implementiert | Anmerkung                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| **Create document**             | `POST /api/v1/documents`                                                                             | ✅            | Mit oder ohne contextId; mit contextId optional publishedAt im Body                                    |
| **Edit draft**                  | `PATCH /api/v1/documents/:documentId` (content/title) oder `PUT /api/v1/documents/:documentId/draft` | ✅            | Draft = Document mit publishedAt null; User-Draft = DocumentDraft (für published Docs)                 |
| **Merge draft (PR)**            | `PATCH /api/v1/draft-requests/:draftRequestId` (action: merge)                                       | ✅            | Erstellt neue DocumentVersion, setzt Document.content und currentPublishedVersionId                    |
| **Publish document**            | `POST /api/v1/documents/:documentId/publish`                                                         | ✅            | Erstellt DocumentVersion (Version 1), setzt publishedAt und currentPublishedVersionId                  |
| **Update document**             | `PATCH /api/v1/documents/:documentId`                                                                | ✅            | title, content, description, tagIds, contextId, **publishedAt**, **archivedAt** – siehe Inkonsistenzen |
| **Create new version**          | Implizit bei Publish (Version 1) und bei Merge (n+1)                                                 | ✅            | Kein eigener Endpoint; nur über Publish bzw. Merge                                                     |
| **Assign document**             | `PATCH /api/v1/documents/:documentId` (contextId)                                                    | ✅            | Zuweisung zu anderem Kontext; canWriteContext auf Zielkontext                                          |
| **Pin document**                | `POST /api/v1/pinned`                                                                                | ✅            | DocumentPinnedInScope; nur nicht gelöschte/nicht archivierte Docs                                      |
| **Unpin document**              | `DELETE /api/v1/pinned/:id`                                                                          | ✅            | Löscht DocumentPinnedInScope-Eintrag                                                                   |
| **Archive document**            | `PATCH /api/v1/documents/:documentId` (archivedAt: Date)                                             | ✅            | Nur canWrite; kein eigener Endpoint                                                                    |
| **Unarchive document**          | `PATCH /api/v1/documents/:documentId` (archivedAt: null)                                             | ✅            | Ebenfalls über PATCH                                                                                   |
| **Move to trash**               | `DELETE /api/v1/documents/:documentId`                                                               | ✅            | Soft-Delete: setzt deletedAt; entfernt alle Pins des Dokuments                                         |
| **Restore document**            | `POST /api/v1/documents/:documentId/restore`                                                         | ✅            | deletedAt = null; wenn Kontext gelöscht: contextId = null (Draft)                                      |
| **Permanently delete document** | —                                                                                                    | ❌            | Nicht implementiert; nur Soft-Delete (deletedAt)                                                       |

Zusätzliche dokumentnahe Operationen (keine Zustandsänderung des Dokuments selbst):

- **Grants setzen:** `PUT /api/v1/documents/:documentId/grants/users` (analog teams, departments) – requireDocumentAccess('write').
- **Draft Request anlegen:** `POST /api/v1/documents/:documentId/draft-requests` – canWrite.
- **Draft Request ablehnen:** `PATCH /api/v1/draft-requests/:id` (action: reject).
- **Draft auf neueste Version bringen:** `POST /api/v1/documents/:documentId/draft/update-to-latest` – 3-Way-Merge (mergeThreeWay).

---

## B. Lifecycle-Zustandsmaschine

Relevante Felder im Document-Modell: `publishedAt`, `deletedAt`, `archivedAt`, `contextId`, `content`, `currentPublishedVersionId`.

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │  Create (POST /documents)                                    │
                    │  contextId=null → draft, contextId set → draft or published  │
                    └───────────────────────────┬─────────────────────────────────┘
                                                │
                                                ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  DRAFT (publishedAt = null)                                                        │
  │  - Edit: PATCH (content, title, …)                                                 │
  │  - Assign: PATCH (contextId) → bleibt Draft                                        │
  │  - Publish: POST …/publish → PUBLISHED (wenn contextId gesetzt)                    │
  │  - Delete: DELETE → TRASH                                                          │
  └───────────────────────────────────────────────────────────────────────────────────┘
    │                           │
    │ Assign context            │ Publish (POST /publish)
    │ (PATCH contextId)         │
    ▼                           ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  PUBLISHED (publishedAt set, currentPublishedVersionId set)                        │
  │  - Update content: nur über Merge (DraftRequest); Document.content = Draft-Inhalt   │
  │  - User-Draft: PUT …/draft (DocumentDraft); PR: POST …/draft-requests → Merge/Reject│
  │  - Archive: PATCH (archivedAt) → ARCHIVED                                          │
  │  - Delete: DELETE → TRASH                                                          │
  └───────────────────────────────────────────────────────────────────────────────────┘
    │
    │ PATCH (archivedAt: Date)
    ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  ARCHIVED (archivedAt set)                                                         │
  │  - Unarchive: PATCH (archivedAt: null) → PUBLISHED                                  │
  │  - Delete: DELETE → TRASH                                                          │
  └───────────────────────────────────────────────────────────────────────────────────┘

  DELETE /documents/:id (von DRAFT, PUBLISHED oder ARCHIVED)
    │
    ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  TRASH (deletedAt set)                                                             │
  │  - Restore: POST …/restore → deletedAt=null; wenn Kontext gelöscht: contextId=null │
  │  - Permanently delete: nicht implementiert                                         │
  └───────────────────────────────────────────────────────────────────────────────────┘
```

**Pin/Unpin** ändern den Dokument-Lifecycle nicht; sie betreffen nur die Tabelle `DocumentPinnedInScope` (Dokument muss `deletedAt` und `archivedAt` null haben zum Pinnen).

---

## C. Event → betroffene Dateien

| Event               | Backend-Dateien                                                                                                                                                             | Frontend (relevant)                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Create document     | `routes/documents.ts` (POST /documents), `routes/schemas/documents.ts`, `permissions/contextPermissions.ts` (canWriteContext), `permissions/documentLoad.ts` (nicht direkt) | `components/contexts/NewDocumentModal.tsx`, `pages/ContextDetailPage.tsx`, `pages/SubcontextDetailPage.tsx`  |
| Edit draft          | `routes/documents.ts` (PATCH, PUT …/draft), `permissions/middleware.ts` (requireDocumentAccess('write'))                                                                    | `pages/DocumentPage.tsx` (Edit-Mode, Speichern Draft/PR)                                                     |
| Merge draft         | `routes/documents.ts` (PATCH …/draft-requests/:id), `permissions/canMergeDraftRequest.ts`                                                                                   | `pages/DocumentPage.tsx` (handleMergeReject)                                                                 |
| Publish document    | `routes/documents.ts` (POST …/publish), `permissions/canPublishDocument.ts`                                                                                                 | `pages/DocumentPage.tsx` (Publish-Button, canPublish)                                                        |
| Update document     | `routes/documents.ts` (PATCH), `routes/schemas/documents.ts` (updateDocumentBodySchema)                                                                                     | `pages/DocumentPage.tsx` (Assign context, Archive/Unarchive, Titel/Inhalt bei Draft)                         |
| Assign document     | `routes/documents.ts` (PATCH contextId), `permissions/contextPermissions.ts` (canWriteContext für Zielkontext)                                                              | `pages/DocumentPage.tsx` (Assign-Context-Modal)                                                              |
| Pin / Unpin         | `routes/pinned.ts`, `permissions/pinnedPermissions.ts` (canPinForScope), `permissions/canRead.ts` (Pin: canRead Doc)                                                        | `pages/HomePage.tsx`, Pinned-Bereiche; Pin/Unpin-UI (z. B. Settings oder Kontext-Seiten)                     |
| Archive / Unarchive | `routes/documents.ts` (PATCH archivedAt)                                                                                                                                    | `pages/DocumentPage.tsx` (Archive/Unarchive im Menu)                                                         |
| Move to trash       | `routes/documents.ts` (DELETE), `permissions/canDeleteDocument.ts`                                                                                                          | `pages/DocumentPage.tsx`, `components/TrashTabContent.tsx` (Liste), Kontext-Löschen (contexts.ts kaskadiert) |
| Restore document    | `routes/documents.ts` (POST …/restore), `permissions/canDeleteDocument.ts`, `permissions/canRead.ts` (canSeeDocumentInTrash)                                                | `components/TrashTabContent.tsx` (Restore-Button)                                                            |

Weitere beteiligte Backend-Dateien (keine direkten Lifecycle-Events, aber Logik):

- `mergeThreeWay.ts` – 3-Way-Merge für „Update draft to latest“.
- `contextOwnerDisplay.ts` – Wird bei Erstellung von Process/Project/Subcontext aufgerufen (Context.displayName etc.); **nicht** bei Dokument-Zuweisung (Kontext existiert bereits).
- `routes/meTrashArchive.ts` – Liefert Listen für Trash/Archive (getTrashOrArchiveItems); keine Zustandsänderung.
- `routes/assignments.ts` – Team/Department/Company-Lead-Zuordnungen, **keine** Dokument-Zuweisung („assign document“ = PATCH contextId).
- `routes/contexts.ts` – CRUD für Prozesse/Projekte/Unterkontexte; beim Löschen eines Kontexts kaskadieren Documents (Schema: Context → Document). Kein eigener „move document to trash“ durch Kontext-Löschung für das Dokument – Kontext-Löschung löscht den Kontext und damit die Verknüpfung; Dokumente haben `contextId` mit onDelete: SetNull, also wird contextId auf null gesetzt (Schema prüfen). Prisma: `contextId` bei Document hat `onDelete: SetNull` – beim Löschen des Context wird also contextId = null gesetzt, Dokument bleibt erhalten. Kontext-Löschung in contexts.ts löscht Process/Project/Subcontext; Context wird mit gelöscht (Cascade von Process/Project/Subcontext auf Context). Wenn Context gelöscht wird, sind Document.contextId FKs betroffen: Schema sagt `onDelete: SetNull` für Document.context. Also: Context löschen → alle Documents mit diesem contextId erhalten contextId = null. Dokumente werden nicht physisch gelöscht und nicht in Trash gesetzt – sie werden kontextfrei. Trash ist nur über DELETE /documents/:id (deletedAt).

---

## D. Permission-Prüfung

| Event                      | Verwendete Permission-Funktion                                                                  | Route / Stelle                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Create document            | canWriteContext(contextId) bei contextId; bei contextId=null kein weiterer Check (nur Auth)     | documents.ts POST /documents                    |
| Edit document (PATCH)      | requireDocumentAccess('write') → canWrite                                                       | documents.ts PATCH                              |
| Publish                    | canPublishDocument(prisma, userId, documentId)                                                  | documents.ts POST …/publish                     |
| Merge PR                   | canMergeDraftRequest(prisma, userId, draftRequestId)                                            | documents.ts PATCH …/draft-requests/:id         |
| Assign (PATCH contextId)   | requireDocumentAccess('write') + canWriteContext(userId, body.contextId) für neues contextId    | documents.ts PATCH                              |
| Archive/Unarchive          | requireDocumentAccess('write')                                                                  | documents.ts PATCH (archivedAt)                 |
| Delete (trash)             | canDeleteDocument(prisma, userId, documentId)                                                   | documents.ts DELETE                             |
| Restore                    | canDeleteDocument **oder** canSeeDocumentInTrash(prisma, userId, doc)                           | documents.ts POST …/restore                     |
| Pin                        | canPinForScope(prisma, userId, scopeType, scopeId) + canRead(prisma, userId, documentId)        | pinned.ts POST /pinned                          |
| Unpin                      | canPinForScope(prisma, userId, scopeType, scopeId)                                              | pinned.ts DELETE /pinned/:id                    |
| GET document (inkl. Trash) | requireDocumentAccess('read') → canRead; bei deletedAt set: canSeeDocumentInTrash im Middleware | documents.ts GET …/documents/:id, middleware.ts |

**Vollständigkeit:** Create mit Kontext prüft canWriteContext; Publish prüft canPublishDocument (Scope-Lead); Merge prüft canMergeDraftRequest; Delete/Restore und Pin/Unpin sind explizit geprüft. **Inkonsistenz:** PATCH erlaubt `publishedAt` und `archivedAt` mit nur requireDocumentAccess('write'), ohne canPublishDocument – siehe Abschnitt F.

---

## E. Seiteneffekte pro Event

| Event                      | Seiteneffekte                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create document            | DocumentTag bei tagIds; bei contextId: Tags validiert gegen Kontext-Owner. Keine Version, kein Pin, kein Recent (Backend).                                                                                      |
| Edit draft (PATCH content) | updatedAt; keine neue DocumentVersion.                                                                                                                                                                          |
| Merge draft (PR merge)     | DocumentVersion erstellt; Document.content und currentPublishedVersionId aktualisiert; DraftRequest.status = merged, mergedAt, mergedById. DocumentDraft wird **nicht** automatisch gelöscht oder aktualisiert. |
| Publish                    | DocumentVersion (Version 1) erstellt; Document.publishedAt, currentPublishedVersionId gesetzt.                                                                                                                  |
| Update document (PATCH)    | Optional tagIds: DocumentTag deleteMany + createMany. contextId-Änderung: nur DB-Update; Context-Display (contextOwnerDisplay) wird **nicht** aufgerufen (Kontext existiert bereits).                           |
| Assign document            | Nur contextId-Update. Kein Aufruf von contextOwnerDisplay (wird nur bei Process/Project/Subcontext Create/Update aufgerufen).                                                                                   |
| Pin                        | DocumentPinnedInScope erstellt; pinnedById = userId.                                                                                                                                                            |
| Unpin                      | DocumentPinnedInScope gelöscht.                                                                                                                                                                                 |
| Archive                    | Document.archivedAt gesetzt. Pinned-Einträge bleiben (GET /pinned filtert bereits auf archivedAt: null).                                                                                                        |
| Move to trash              | DocumentPinnedInScope.deleteMany({ documentId }); Document.deletedAt = new Date().                                                                                                                              |
| Restore                    | Document.deletedAt = null; wenn Kontext gelöscht (Process/Project deletedAt): contextId = null (Draft). Pins werden **nicht** wiederhergestellt.                                                                |

**Recent Items:** Werden nur im Frontend bzw. über PATCH /me/preferences (recentItemsByScope) gepflegt; kein Backend-Seiteneffekt bei Lifecycle-Events.

**Storage (Attachments):** Kein automatisches Löschen von Attachments bei Soft-Delete; bei permanent delete (nicht vorhanden) müsste Storage bereinigt werden.

---

## F. Gefundene Inkonsistenzen

1. **PATCH erlaubt publishedAt/archivedAt mit nur canWrite**
   - `updateDocumentBodySchema` erlaubt `publishedAt` und `archivedAt`.
   - PATCH verwendet nur `requireDocumentAccess('write')`.
   - **Risiko:** Ein Nutzer mit Writer-Grant (ohne Scope-Lead) kann theoretisch `publishedAt` setzen und damit „publizieren“, ohne dass eine DocumentVersion angelegt wird (POST /publish legt Version 1 an).
   - **Empfehlung:** Entweder publishedAt/archivedAt aus dem PATCH-Body entfernen und nur über dedizierte Endpoints (POST …/publish, ggf. POST …/archive) setzen, oder im PATCH bei Änderung von publishedAt canPublishDocument prüfen und bei Setzen von publishedAt dieselbe Versionierungslogik wie bei POST …/publish ausführen.

2. **Kein permanentes Löschen**
   - Nur Soft-Delete (deletedAt). Weder API noch Schema sehen physisches Löschen vor.
   - Attachments und DocumentVersion/DraftRequest/DocumentDraft bleiben erhalten.
   - Für Compliance/Audit kann das gewollt sein; für Speicherbereinigung fehlt eine definierte Strategie.

3. **Merge: DocumentDraft nicht bereinigt**
   - Nach Merge eines DraftRequest wird die User-Draft (DocumentDraft) nicht gelöscht oder angepasst. Der Nutzer könnte weiter mit veralteter basedOnVersionId arbeiten.
   - Akzeptables Verhalten („Draft bleibt lokal“), aber dokumentieren oder optional nach Merge DocumentDraft zurücksetzen/löschen.

4. **Restore: Pins nicht wiederhergestellt**
   - Beim Move to trash werden Pins gelöscht; beim Restore werden sie nicht wiederhergestellt. Konsistent mit „Trash löscht Pins“, aber Nutzer müssen erneut pinnen.

5. **Context-Löschung vs. Document-Trash**
   - Beim Löschen eines Kontexts (Process/Project) setzt das Schema (onDelete: SetNull) document.contextId = null; Dokumente werden nicht in Trash (deletedAt) gesetzt.
   - Trash-Liste (me/trash) enthält nur Dokumente mit deletedAt. Kontextfreie Dokumente nach Kontext-Löschung erscheinen nicht im Trash, sondern als „kontextfreie“ Drafts.
   - Keine technische Inkonsistenz, aber konzeptionell: „Kontext gelöscht“ könnte erwarten, dass zugehörige Dokumente im Trash landen (aktuell nicht so).

6. **Versionierung nur bei Publish und Merge**
   - Neue DocumentVersion entsteht nur bei POST …/publish (Version 1) und bei PATCH draft-request (action: merge).
   - Direktes PATCH von content bei **published** Document ändert Document.content ohne neue Version – wird im aktuellen Design durch „nur über PR ändern“ verhindert; Frontend zeigt bei published nur Draft/PR-Flow. Sollte so bleiben (kein direkter PATCH content für published im UI), aber API erlaubt es mit canWrite.

7. **canSeeDocumentInTrash nur für Restore und GET**
   - Restore erlaubt canDeleteDocument **oder** canSeeDocumentInTrash. GET document verwendet requireDocumentAccess('read'), das bei deletedAt auf canSeeDocumentInTrash umschaltet. Konsistent.

8. **Catalog filtert nicht nach Kontext-Status (Process/Project deletedAt)**
   - GET /documents (Catalog) filtert mit `deletedAt: null`, `archivedAt: null` auf dem Document. Es wird nicht geprüft, ob der zugehörige Process/Project soft-gelöscht (deletedAt gesetzt) ist. Dokumente in einem „gelöschten“ Kontext könnten damit weiter im Catalog erscheinen, sofern die Scope-Logik sie trifft. GET /contexts/:contextId/documents und Trash/Archive-Listen berücksichtigen Kontext-Status anders (Kontext-Listen liefern nur Dokumente des Kontexts; Trash listet Dokumente mit deletedAt).

---

## G. Empfohlene Minimalverbesserungen

1. **PATCH publishedAt/archivedAt absichern**
   - Option A: `publishedAt` und `archivedAt` aus updateDocumentBodySchema entfernen; Publish nur über POST …/publish; Archive/Unarchive über dedizierte Endpoints (z. B. POST …/archive, DELETE …/archive) mit canWrite und ggf. klarer Semantik.
   - Option B: Im PATCH bei `body.publishedAt !== undefined` canPublishDocument prüfen und bei erstmaligem Setzen dieselbe Transaktion wie bei POST …/publish ausführen (DocumentVersion anlegen, dann publishedAt/currentPublishedVersionId setzen). Bei archivedAt nur canWrite beibehalten.

2. **Lifecycle in einer Übersicht dokumentieren**
   - In `docs/platform/` oder `docs/plan/` einen kurzen Abschnitt „Dokument-Lifecycle“ pflegen (Zustandsübergänge, welche Endpoints welchen Zustand ändern), Verweis auf dieses Analyse-Dokument. Verhindert versehentliche Doppel- oder Schattenlogik.

3. **Nach Merge: DocumentDraft optional bereinigen**
   - Beim Merge (PATCH draft-request merge) optional den DocumentDraft des Submitters (falls vorhanden) auf basedOnVersionId = neue Version setzen oder löschen, damit „Update to latest“ keine veraltete Basis mehr hat. Kein Muss, aber klarer für Nutzer.

4. **Permanentes Löschen (optional)**
   - Falls gewünscht: Eigenen Endpoint (z. B. DELETE …/documents/:id/permanent) nur für Admin oder Scope-Lead, der deletedAt prüft, dann Attachments (Storage + DB), DocumentVersion, DraftRequest, DocumentDraft, DocumentGrant\*, DocumentTag, DocumentPinnedInScope und zuletzt Document löscht. Ohne Anforderung nicht umsetzen.

5. **Kontext-Löschung und Dokumente**
   - Wenn fachlich gewünscht: Beim Soft-Delete eines Process/Project alle Dokumente mit diesem contextId auf deletedAt setzen („mit in Trash“), statt nur contextId = null. Dafür Anpassung in contexts.ts (DELETE Process/Project) und Absprache mit Rechtesystem (Restore aus Kontext-Trash).

6. **Einheitliche Prüfung für „sichtbar in Listen“**
   - Catalog, Trash, Archive, Kontext-Dokumente filtern jeweils getrennt (deletedAt, archivedAt, publishedAt, canRead/canWrite). Prüfen, ob überall dieselben Regeln gelten (z. B. GET /pinned: deletedAt null, archivedAt null; GET /documents: deletedAt null, archivedAt null; me/trash: deletedAt not null). Keine Änderung nötig, nur einmal abgleichen und in Doku festhalten.

7. **Frontend: Keine doppelte Permission-Logik**
   - Frontend nutzt canWrite, canDelete, canPublish aus GET …/documents/:id Response; keine eigene Ableitung. So beibehalten; neue Lifecycle-Features nur nach Backend-Vorgabe anzeigen.

---

## Ergänzung: Domänenkonsistenz-Check (Lifecycle-Events)

Folgende Abschnitte prüfen die Lifecycle-Events systematisch auf Permission, State Change, Versionierung, Seiteneffekte und Response – Fokus Domänenkonsistenz, nicht Code-Stil.

---

### A. Erkannte Lifecycle-Events

Alle **realen dokumentbezogenen Aktionen** im Backend (aus `documents.ts`, `pinned.ts`; `assignments.ts` und `meTrashArchive.ts` ändern keine Dokumentzustände, `contexts.ts` löscht Kontexte, nicht einzelne Dokumente):

| #   | Event              | Endpoint / Aktion                                       | Datei               |
| --- | ------------------ | ------------------------------------------------------- | ------------------- |
| 1   | Create document    | POST /documents                                         | documents.ts        |
| 2   | Edit draft         | PATCH /documents/:id (content/title/…) oder PUT …/draft | documents.ts        |
| 3   | Merge draft (PR)   | PATCH /draft-requests/:id (action: merge)               | documents.ts        |
| 4   | Publish document   | POST /documents/:id/publish                             | documents.ts        |
| 5   | Update document    | PATCH /documents/:id (inkl. tagIds, description)        | documents.ts        |
| 6   | Assign document    | PATCH /documents/:id (contextId)                        | documents.ts        |
| 7   | Pin document       | POST /pinned                                            | pinned.ts           |
| 8   | Unpin document     | DELETE /pinned/:id                                      | pinned.ts           |
| 9   | Archive document   | PATCH /documents/:id (archivedAt: Date)                 | documents.ts        |
| 10  | Unarchive document | PATCH /documents/:id (archivedAt: null)                 | documents.ts        |
| 11  | Move to trash      | DELETE /documents/:id                                   | documents.ts        |
| 12  | Restore document   | POST /documents/:id/restore                             | documents.ts        |
| —   | (Permanent delete) | —                                                       | nicht implementiert |

---

### B. Lifecycle-Vollständigkeitsmatrix

Für jedes Event: **Permission** (passende Prüfung?), **State Change** (Dokumentzustand korrekt?), **Version/Merge** (falls relevant), **Side Effects** (Pins, Assignments, Recent, Context-Display, Storage), **Response** (konsistent, enthält aktualisierten Zustand/Version?).

| Event                  | Permission                                                 | State Change                                               | Version/Merge                                                  | Side Effects                                   | Response                                                                 |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| **Create document**    | ✅ canWriteContext (mit Kontext); ⚠️ ohne Kontext nur Auth | ✅ Document erstellt (publishedAt null oder Body)          | —                                                              | ✅ DocumentTag bei tagIds                      | ✅ 201 + Document (ohne writers befüllt)                                 |
| **Edit draft**         | ✅ requireDocumentAccess('write')                          | ✅ content/title/updatedAt                                 | ❌ keine Version (korrekt für Draft)                           | —                                              | ✅ 200 + Document                                                        |
| **Merge draft**        | ✅ canMergeDraftRequest                                    | ✅ content, currentPublishedVersionId; DraftRequest merged | ✅ DocumentVersion erstellt                                    | ⚠️ DocumentDraft nicht bereinigt               | ✅ 200 + DraftRequest (nicht Document)                                   |
| **Publish document**   | ✅ canPublishDocument                                      | ✅ publishedAt, currentPublishedVersionId                  | ✅ DocumentVersion (v1)                                        | —                                              | ⚠️ nur id, publishedAt, currentPublishedVersionId (kein volles Document) |
| **Update document**    | ✅ requireDocumentAccess('write')                          | ✅ je nach Body (title, content, archivedAt, …)            | ❌ bei publishedAt per PATCH: **keine Version** (Inkonsistenz) | ✅ tagIds: DocumentTag replace                 | ✅ 200 + Document                                                        |
| **Assign document**    | ✅ canWrite + canWriteContext(Ziel)                        | ✅ contextId                                               | —                                                              | — (contextOwnerDisplay nur bei Kontext-Create) | ✅ 200 + Document                                                        |
| **Pin document**       | ✅ canPinForScope + canRead(Doc)                           | — (Document unverändert)                                   | —                                                              | ✅ DocumentPinnedInScope erstellt              | ✅ 201 + Pin                                                             |
| **Unpin document**     | ✅ canPinForScope                                          | —                                                          | —                                                              | ✅ DocumentPinnedInScope gelöscht              | ✅ 204                                                                   |
| **Archive document**   | ✅ requireDocumentAccess('write')                          | ✅ archivedAt gesetzt                                      | —                                                              | — (Pins bleiben, GET /pinned filtert)          | ✅ 200 + Document                                                        |
| **Unarchive document** | ✅ requireDocumentAccess('write')                          | ✅ archivedAt = null                                       | —                                                              | —                                              | ✅ 200 + Document                                                        |
| **Move to trash**      | ✅ canDeleteDocument                                       | ✅ deletedAt gesetzt                                       | —                                                              | ✅ Pins gelöscht                               | ✅ 204                                                                   |
| **Restore document**   | ✅ canDeleteDocument oder canSeeDocumentInTrash            | ✅ deletedAt null; ggf. contextId null                     | —                                                              | ❌ Pins nicht wiederhergestellt                | ✅ 204                                                                   |

**Legende:** ✅ vollständig / konsistent; ⚠️ Lücke oder Inkonsistenz; ❌ fehlt oder falsch.

---

### C. Inkonsistenzen im Lifecycle

1. **PATCH publishedAt ohne canPublishDocument und ohne Version**  
   Wer mit canWrite (z. B. Writer-Grant) PATCH mit `publishedAt: <date>` sendet, kann „publizieren“, ohne dass eine DocumentVersion angelegt wird. POST …/publish prüft canPublishDocument und legt Version 1 an. **Zwei Codepfade für „published“.**

2. **Merge-Response liefert nur DraftRequest, nicht aktualisiertes Document**  
   Frontend muss GET document erneut aufrufen, um aktuellen content/currentPublishedVersionId zu sehen. Akzeptabel, aber Response könnte optional Document-Snippet mitliefern.

3. **Publish-Response liefert nur Teilfelder**  
   Response: `id`, `publishedAt`, `currentPublishedVersionId`. Kein `content`, keine Grants, kein `archivedAt`. Frontend kann mit GET document nachladen; konsistenter wäre gleiches Response-Schema wie PATCH (volles Document).

4. **Archive/Unarchive nur über PATCH**  
   Kein dedizierter Endpoint; Semantik „nur canWrite“ ist korrekt, aber publishedAt könnte fälschlich ebenfalls per PATCH gesetzt werden (siehe 1).

5. **Restore stellt Pins nicht wieder her**  
   Delete entfernt Pins; Restore setzt nur deletedAt (und ggf. contextId) zurück. Pins bleiben gelöscht.

6. **Merge: DocumentDraft des Submitters wird nicht angepasst**  
   Nach Merge bleibt DocumentDraft mit alter basedOnVersionId; „Update to latest“ zeigt dann ggf. veraltete Basis.

7. **Catalog filtert nicht nach Kontext deletedAt**  
   Dokumente in einem soft-gelöschten Process/Project können im Catalog erscheinen (nur Document.deletedAt/archivedAt gefiltert).

8. **Kein permanentes Löschen**  
   Nur Soft-Delete; Attachments/Versionen bleiben erhalten.

---

### D. Frontend-Domänenlogik (falls vorhanden)

- **Dokument-Level (DocumentPage, Document-API):**  
  Das Frontend **leitet canWrite, canDelete, canPublish nicht selbst ab**. Es nutzt die Felder aus der **GET /api/v1/documents/:id** Response (`canWrite`, `canDelete`, `canPublish`), die das Backend in dieser Route aus `canWrite`, `canDeleteDocument`, `canPublishDocument` befüllt. Buttons (Edit, Publish, Archive, Delete, Assign) werden ausschließlich anhand dieser API-Felder ein-/ausgeblendet. **Keine doppelte Permission-Logik auf Dokumentebene.**

- **Scope-Level (Drafts/Trash/Archive-Tabs):**  
  Die Sichtbarkeit der Tabs „Drafts“, „Trash“, „Archive“ wird im Frontend über **canShowWriteTabs(me, canManage)** gesteuert (`lib/canShowWriteTabs.ts`). `canManage` wird pro Seite aus **GET /me** (identity: teamLeads, departmentLeads, companyLeads) und `isAdmin` abgeleitet. Das Backend liefert diese Identity; es gibt zusätzlich **GET /me/can-write-in-scope** für einen konkreten Scope. Die Regel „Admin oder Scope-Lead sehen Write-Tabs“ ist damit **im Frontend aus Identity abgeleitet**, nicht aus einem einzelnen Backend-Call pro Tab. Das ist akzeptabel (Identity ist autoritativ), aber die fachliche Regel „wer darf Drafts/Trash/Archive sehen“ liegt de facto in Frontend + Backend (Identity-Struktur); eine einzige Backend-API „canWriteInScope“ pro Scope wird teils genutzt, teils durch Identity-Ableitung ersetzt.

- **Fazit:**  
  Keine kritische Replikation von **Dokument-**Permissions im Frontend. Leichte Duplikation der **Scope-**Regel („Tabs anzeigen“) über Identity vs. can-write-in-scope; keine Änderung zwingend nötig.

---

### E. Empfohlene Minimalverbesserungen

1. **PATCH publishedAt absichern**  
   Im PATCH-Handler: Wenn `body.publishedAt !== undefined` und aktuell `publishedAt == null`, **canPublishDocument** prüfen und bei Setzen von publishedAt dieselbe Transaktion wie bei POST …/publish ausführen (DocumentVersion anlegen, dann publishedAt + currentPublishedVersionId setzen). Alternativ: **publishedAt** aus `updateDocumentBodySchema` entfernen und Publish ausschließlich über POST …/publish erlauben.

2. **PATCH archivedAt**  
   Unverändert über PATCH mit canWrite lassen; optional später dedizierte Endpoints (POST …/archive, DELETE …/archive) für klare Semantik. Kein Muss.

3. **Nach Merge: DocumentDraft optional zurücksetzen**  
   Beim Merge (PATCH draft-request, action: merge) den DocumentDraft des Submitters (falls vorhanden) löschen oder `basedOnVersionId` auf die neue Version setzen, damit „Update to latest“ konsistent ist.

4. **Response Publish**  
   Optional: POST …/publish gibt dasselbe Document-Schema wie GET/PATCH zurück (oder mindestens content, archivedAt), damit das Frontend nicht zwingend nachladen muss. Kein Muss.

5. **Restore: Pins**  
   Pins nach Restore bewusst nicht wiederherstellen (aktuell so); in Doku festhalten. Kein Code-Fix.

6. **Lifecycle-Übersicht in Doku**  
   Kurzer Abschnitt „Dokument-Lifecycle“ in `docs/platform/` oder `docs/plan/` mit Zustandsübergängen und zuständigen Endpoints; Verweis auf dieses Dokument. Verhindert Doppel- oder Schattenlogik bei neuen Features.

7. **Keine zentrale Service-Schicht vorschlagen**  
   Lifecycle-Logik bleibt in den Routen; nur punktuelle Fixes (Permission + Version bei PATCH publishedAt, optional Merge-Nachbereitung und Response Publish). Keine neue Architektur.

---

**Stand:** Analyse basiert auf Code-Stand `apps/backend/src/routes/documents.ts`, `pinned.ts`, `me.ts`, `meTrashArchive.ts`, `permissions/`, `mergeThreeWay.ts`, `contextOwnerDisplay.ts` und Frontend `DocumentPage.tsx`, `TrashTabContent.tsx`, `DraftsTabContent.tsx`, `useMeDrafts.ts`, `canShowWriteTabs.ts`. Bei Änderungen an Endpoints oder Rechten sollte diese Analyse aktualisiert werden.
