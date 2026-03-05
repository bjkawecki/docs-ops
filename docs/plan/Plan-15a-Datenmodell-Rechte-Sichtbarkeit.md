# Plan 15a: Datenmodell, Rechte, Sichtbarkeit (Draft/Published)

**Ziel:** Draft-Dokumente sind nur für Schreiber/Scope-Lead sichtbar; Leser sehen nur veröffentlichte. Basis für Publish (15b) und PR-Workflow (15c). Keine neuen Document-APIs außer Sichtbarkeitsanpassung und `canPublish` in GET document.

Referenz: [Umsetzungs-Todo §15a](Umsetzungs-Todo.md#15a-datenmodell-rechte-sichtbarkeit-draftpublished), [Prisma-Schema-Entwurf §3, §8](Prisma-Schema-Entwurf.md).

---

## 1. Prisma-Schema & Migration

**Datei:** [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma)

- **Document:** Feld `currentPublishedVersionId String?` (optional, FK auf DocumentVersion); Relation `currentPublishedVersion DocumentVersion?`. (publishedAt und createdById existieren bereits.)
- **DocumentVersion:** Neu. Felder: id, documentId (FK Document, Cascade), content (Text), versionNumber Int, createdAt, createdById (FK User, SetNull), optional parentVersionId (FK DocumentVersion). Index documentId, createdAt.
- **DraftRequest:** Neu. id, documentId (FK Document, Cascade), draftContent (Text), targetVersionId (FK DocumentVersion?, optional), status (Enum: open, merged, rejected), submittedById (FK User), submittedAt, mergedAt?, mergedById?, comment?. Indizes documentId, status.
- **DocumentDraft:** Neu. id, documentId (FK Document, Cascade), userId (FK User, Cascade), content (Text), basedOnVersionId (FK DocumentVersion?, optional), updatedAt. Unique (documentId, userId).

**Migration:** `pnpm exec prisma migrate dev --name add_versioning_and_draft_requests` im Backend-Verzeichnis.

---

## 2. Rechte (Backend)

**Neue Dateien** in [apps/backend/src/permissions](apps/backend/src/permissions):

- **canPublishDocument.ts:** Document inkl. contextId laden → `canWriteContext(prisma, userId, contextId)`. Veröffentlichen darf nur Scope-Lead (bzw. Owner bei Personal).
- **canMergeDraftRequest.ts:** DraftRequest laden → documentId → Document → contextId → `canWriteContext(prisma, userId, contextId)`.

**Hinweis:** Vorher prüfen, ob [canWriteContext](apps/backend/src/permissions/contextPermissions.ts) Company Lead für company-owned Kontexte abdeckt (aktuell nur Department/Team Lead, ownerUserId, isAdmin). Falls nicht: Company-Lead-Check ergänzen (analog canCreateProcessOrProjectForOwner).

Export in [index.ts](apps/backend/src/permissions/index.ts). Tests in [permissions.test.ts](apps/backend/src/permissions/permissions.test.ts) ergänzen.

---

## 3. Sichtbarkeit Draft

**Regel:** Dokument mit `publishedAt == null` (Draft) nur sichtbar für Nutzer mit `canWrite(prisma, userId, documentId)` oder isAdmin. Leser sehen nur Dokumente mit `publishedAt != null`.

### 3.1 getWritableCatalogScope

**Neue Funktion** (z. B. in [catalogPermissions.ts](apps/backend/src/permissions/catalogPermissions.ts) oder neue Datei): `getWritableCatalogScope(prisma, userId)` → `{ contextIds: string[], documentIdsFromGrants: string[] }`.

- contextIds: Kontexte, in denen der Nutzer Scope-Lead ist (canWriteContext für jeden Kontext der lesbaren Scopes, oder aus Owner-Struktur: Company/Department/Team Lead → zugehörige Process/Project/Subcontext contextIds).
- documentIdsFromGrants: Dokument-IDs, bei denen der Nutzer explizit Write-Grant hat (DocumentGrantUser/Team/Department mit role Write und Nutzer im Team/Department bzw. User-Grant).

So kann der Catalog mit einer einzigen Where-Klausel filtern: `(publishedAt != null) OR (contextId in writableContextIds) OR (id in writableDocumentIds)`, in Kombination mit der bestehenden lesbaren Scope-Logik (getReadableCatalogScope). Keine N×canWrite-Aufrufe.

### 3.2 Catalog anpassen

**GET `/api/v1/documents`** (Catalog) in [apps/backend/src/routes/documents.ts](apps/backend/src/routes/documents.ts): Nach dem bestehenden Filter (lesbare Kontexte + Grant-Dokumente) zusätzlich filtern: Nur Einträge, bei denen `publishedAt != null` ODER Dokument in writableScope (getWritableCatalogScope). D. h. Basis-Where um AND erweitern: `(deletedAt null) AND ( (publishedAt != null) OR (contextId in writableContextIds) OR (id in writableDocumentIds) )`, wobei die OR-Liste aus getReadableCatalogScope weiterhin gilt und mit der neuen Sichtbarkeit kombiniert wird (lesbar UND (published ODER writable)).

### 3.3 GET document anpassen

**GET `/api/v1/documents/:id`:** Wenn Dokument Draft ist (`publishedAt == null`), nur liefern wenn `canWrite(prisma, userId, documentId)` (oder isAdmin). Sonst **403 Forbidden** (nicht 404, um Enumerierung zu vermeiden). Response um `canPublish: boolean` ergänzen (true wenn canPublishDocument).

### 3.4 Listen in Kontexten

**Listen**, die Dokumente eines Kontexts liefern (z. B. GET processes/:id mit documents oder GET documents?contextId=…): Gleiche Sichtbarkeitslogik – nur Dokumente anzeigen, die published sind ODER für die der Nutzer canWrite hat. Dazu pro Kontext: wenn Nutzer canWriteContext hat, alle Dokumente des Kontexts (auch Drafts) anzeigen; wenn nur canReadContext, nur Dokumente mit publishedAt != null.

---

## 4. Reihenfolge

1. Prisma-Schema anpassen + Migration ausführen.
2. canPublishDocument und canMergeDraftRequest implementieren + Tests; canWriteContext auf Company Lead prüfen/ergänzen.
3. getWritableCatalogScope implementieren.
4. Catalog-Route (GET /documents) um Draft-Sichtbarkeit erweitern.
5. GET /documents/:id um Draft-Check (403 bei keinem Zugriff) und canPublish erweitern.
6. Kontext-Dokument-Listen um Sichtbarkeit anpassen (falls zentral an einer Stelle).

---

## 5. Abnahme 15a

- Dokument mit publishedAt == null erscheint im Catalog nur für Nutzer mit canWrite; Leser sehen es nicht.
- GET /documents/:id für ein Draft-Dokument als Leser → 403.
- GET /documents/:id liefert canPublish (true/false).
- Keine neuen Endpoints für Publish oder Versionen (kommen in 15b).
