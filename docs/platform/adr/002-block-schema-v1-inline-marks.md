# ADR 002: Block schema v1 – Inline-Marks (Edit-System)

## Status

**Akzeptiert** (Release v0.2.0).

## Kontext

- ADR 001 definiert Block-Dokument **v0** mit Plaintext in `meta.text` pro Text-Knoten.
- Tiptap im Lead-Editor unterstützt Bold, Italic und Inline-Code; v0 konnte diese Formatierung nicht persistieren (Marks deaktiviert).
- PDF-Export nutzt Typst direkt auf Markdown; Inline-Markup (`**bold**`, `*italic*`, `` `code` ``) wird nativ gerendert.

## Entscheidung

1. **`schemaVersion: 1`** für Block-Dokumente mit Inline-Formatierung.
2. Text-Knoten tragen optional **`meta.marks: ('bold' | 'italic' | 'code')[]`** neben `meta.text`.
3. **Migration on read/write:** Beim Speichern (PATCH Lead-Draft, Accept Suggestion, Publish) setzt `normalizeBlockDocumentSchemaVersion()` v1, sobald mindestens ein Text-Knoten Marks hat; sonst bleibt v0.
4. **Abwärtskompatibilität:** Parser akzeptiert v0 und v1 (`safeParseBlockDocument`); v0-Dokumente ohne Marks bleiben unverändert.
5. **Export:** `blocksToMarkdown` schreibt Marks als CommonMark-Syntax; Plaintext/Suche ignorieren Marks (nur `meta.text`).

## Konsequenzen

| Bereich  | Konsequenz                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Backend  | `blockDocumentSchema` = Union v0 \| v1; Publish speichert `blocksSchemaVersion` aus normalisiertem Dokument |
| Frontend | Tiptap Bold/Italic/Code aktiv; Roundtrip über `blockDocumentTiptap.ts`                                      |
| PDF      | Keine Template-Änderung nötig (Markdown → Typst)                                                            |

## Changelog

| Datum      | Änderung                         |
| ---------- | -------------------------------- |
| 2026-06-16 | Erstfassung (M3, Release v0.2.0) |
