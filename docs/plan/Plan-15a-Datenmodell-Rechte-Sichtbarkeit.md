# Plan 15a: Datenmodell, Rechte, Sichtbarkeit (Draft/Published)

**Meilenstein (umgesetzt):** Unveröffentlichte Dokumente sind nur für Nutzer mit Schreibrecht (bzw. Scope-Lead) sichtbar; Leser sehen nur veröffentlichte Inhalte. Grundlage für **Publish** und Versions-Snapshots.

**Aktuelles Zielbild Bearbeitung:** [Edit-System: Blocks, Suggestions, Lead-Draft](Edit-System-Blocks-Suggestions-Lead-Draft.md) — dort sind Lead-Draft, Suggestions und Migration vom heutigen Schema beschrieben.

Referenz: [Umsetzungs-Todo §15a](Umsetzungs-Todo.md#15a-datenmodell-rechte-sichtbarkeit-draftpublished), [Prisma-Schema-Entwurf §3, §8](Prisma-Schema-Entwurf.md).

---

## 1. Prisma-Schema & Migration (Ist / Übergang)

**Datei:** [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma)

- **Document:** `currentPublishedVersionId` (optional, FK auf `DocumentVersion`), Relation `currentPublishedVersion`; `publishedAt`, `createdById` wie in §3 des Schema-Entwurfs.
- **DocumentVersion:** Snapshot der **veröffentlichten** Version (Full-Content, Versionsnummer, Zeitstempel, optional `parentVersionId`).

Bis zur vollständigen Edit-System-Umstellung können im Schema noch zusätzliche Hilfsmodelle existieren; das **Zielmodell** steht in [Prisma-Schema-Entwurf §8](Prisma-Schema-Entwurf.md#8-versionierung-bearbeitung).

---

## 2. Rechte (Backend)

- **`canPublishDocument`:** Document inkl. `contextId` laden → `canWriteContext` (Scope-Lead bzw. Owner bei Personal). Veröffentlichen nur mit gesetztem Kontext.
- **`canWriteContext` / Grants:** Schreiben und Sichtbarkeit unveröffentlichter Dokumente wie in [Rechtesystem](../platform/datenmodell/Rechtesystem.md).

Export und Tests unter [apps/backend/src/permissions](apps/backend/src/permissions).

---

## 3. Sichtbarkeit Draft

**Regel:** Dokument mit `publishedAt == null` nur sichtbar für Nutzer mit `canWrite` oder Admin. Leser sehen nur `publishedAt != null`.

### 3.1 getWritableCatalogScope

Funktion `getWritableCatalogScope` liefert Kontext-IDs und Dokument-IDs mit explizitem Schreibzugriff, damit der Catalog ohne N×Permission-Calls filtern kann (published **oder** im beschreibbaren Scope).

### 3.2 Catalog, GET document, Kontext-Listen

Filter „published ODER beschreibbar“; GET `/documents/:id` für Draft ohne Berechtigung → **403**; Response um `canPublish` ergänzen.

---

## 4. Abnahme 15a

- Unveröffentlichtes Dokument erscheint im Catalog nur für berechtigte Schreiber/Lead.
- GET document als Leser auf Draft → 403.
- GET document liefert `canPublish` korrekt.
