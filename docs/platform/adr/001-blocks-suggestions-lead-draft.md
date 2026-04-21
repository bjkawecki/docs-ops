# ADR 001: Suggestions-Basis, Stale-Regeln, Lead-Draft-Speicher (Edit-System, Epic 0)

## Status

**Akzeptiert** (Umsetzungsbasis für Repo; bei Bedarf später durch neues ADR ersetzen).

## Kontext

- Produktplan: [Edit-System: Blocks, Suggestions, Lead-Draft](../../plan/Edit-System-Blocks-Suggestions-Lead-Draft.md) (Variante A).
- PR-/Epic-Reihenfolge: [Edit-System-Blocks-PR-Epics.md](../../plan/Edit-System-Blocks-PR-Epics.md).

Ziel dieses ADR: Entscheidungen aus **Epic 0** so festhalten, dass EPIC-1 (Prisma) und EPIC-4/5 (API) ohne erneute Diskussion starten können.

---

## 1. Suggestion-Basis (Bezug für `baseDraftRevision`)

**Entscheidung:** Primärbezug ist der **gemeinsame Lead-Draft** – technisch der aktuelle **`draftRevision`**-Stand des Dokuments (vgl. Plan „Option 2“).

**Begründung:** Autoren und Lead arbeiten am selben sichtbaren Arbeitsstand; Vorschläge bleiben fachlich nachvollziehbar und lassen sich mit einem Integer-Revision-Check absichern.

**Audit / Nachvollziehbarkeit (optional im Datenmodell):** Zusätzlich darf eine Suggestion einen **Snapshot der Published-Version** beim Absenden speichern (z. B. `publishedVersionId` oder `publishedVersionNumber` zum Zeitpunkt der Erstellung), **ohne** den Primärbezug für Konfliktlogik zu ersetzen.

---

## 2. Stale-Regeln (nach Publish oder Draft-Änderung)

### 2.1 Nach **Publish** (Draft → neue Published-Version)

**Entscheidung:** Alle noch **`pending`** Suggestions werden auf **`superseded`** gesetzt (serverseitig in derselben Transaktion wie der Publish, soweit technisch möglich).

**Begründung:** Published-Stand hat sich grundlegend geändert; alte Ops gegenüber dem vorherigen Draft sind nicht mehr gültig. Autoren legen bei Bedarf neue Vorschläge an.

### 2.2 Nach **Lead-Draft-Änderung** (PATCH Draft, `draftRevision` erhöht sich)

**Entscheidung:**

- **`POST …/suggestions`:** Body enthält `baseDraftRevision`. Stimmt dieser Wert **nicht** mit dem aktuellen `draftRevision` des Dokuments überein → **409 Conflict** (Client lädt Draft + Liste neu).
- **`POST …/suggestions/:id/accept` (Lead):** Vor Anwenden der Ops wird `baseDraftRevision` der Suggestion mit dem **aktuellen** `draftRevision` verglichen. Bei Mismatch → **409 Conflict** (Fehlercode z. B. `stale_suggestion` im API-Fehlerobjekt, sobald das Fehlerformat das hergibt).
- **Offene `pending` Suggestions** mit veralteter `baseDraftRevision` bleiben in der DB **pending**, bis Lead sie **ablehnt**, der Autor sie **zurückzieht**, oder ein Publish sie **superseded** setzt (Abschnitt 2.1). Optional kann später ein Batch-Job „stale markieren“ ergänzt werden; für v0 reicht die 409-Logik bei schreibenden Aktionen.

**Nicht-Ziel:** Automatisches Zusammenführen überlappender Suggestions (bleibt explizite Lead-Entscheidung laut Produktplan).

---

## 3. Lead-Draft-Speicher (Variante A vs. B)

**Entscheidung:** **Variante A** – Lead-Draft als **Felder am `Document`** (konzeptionell z. B. `draftBlocks` JSON, `draftRevision` Integer). Keine separate 1:1-Tabelle in v0.

**Begründung:** Weniger Joins, einfache Transaktionen zusammen mit Titel/Kontext; ausreichend, solange keine eigene **Draft-Historie** pro Revision produktrelevant ist.

**Variante B** (eigene Tabelle, z. B. `DocumentLeadDraft`): bewusst **nicht** für die erste Umsetzung gewählt; wiederaufnehmen, falls Revision-Historie oder sehr große Draft-Payloads getrennt versioniert werden müssen.

---

## 4. Block-Dokument Schema-Version (Bezug PR-0c)

**Entscheidung:** Serverseitiges **Zod-Schema v0** mit `schemaVersion: 0` und rekursivem `blocks[]`-Baum; Details und Beispiel-JSON im Code: `apps/backend/src/services/documents/blockSchema.ts` (Re-Export `blockDocumentSchema.ts`). **Markdown-Import/Export (EPIC-2):** `markdownToBlocks.ts`, `blocksToMarkdown.ts`, Plaintext für Suche: `blocksPlaintext.ts`.

---

## 5. Konsequenzen

| Bereich         | Konsequenz                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prisma (EPIC-1) | `Document`: `draftBlocks`, `draftRevision`; `DocumentVersion`: `blocks`, `blocksSchemaVersion`; `DocumentSuggestion` mit `baseDraftRevision`, Status inkl. `superseded`, optional `publishedVersionId` |
| API (EPIC-4/5)  | Revision-Checks wie oben; Publish-Handler setzt `pending` → `superseded`                                                                                                                               |
| Permissions     | Getrennte Checks: Autor darf Suggestions, nicht Draft patchen; Lead darf Draft patchen und Suggestions accept/reject                                                                                   |

---

## 6. Changelog

| Datum      | Änderung                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| 2026-04-21 | Erstfassung (Epic 0 umgesetzt)                                                       |
| 2026-04-21 | EPIC-1: konkrete Prisma-Felder/Modelle in Tabelle „Konsequenzen“ ergänzt             |
| 2026-04-21 | EPIC-2: Markdown↔Blocks + Plaintext in ADR §4 erwähnt                                |
| 2026-04-21 | EPIC-3: Backfill-Job/Script + GET-Block-Felder (kein Entfall von Markdown-`content`) |
