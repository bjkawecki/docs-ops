# Dokument-Lifecycle – Übersicht

Dieses Dokument beschreibt den **fachlichen** Dokument-Lebenszyklus (Zustände, nicht-Content-Operationen) und verweist für das **künftige Bearbeitungs- und Versionierungsmodell** auf den Plan [Edit-System: Blocks, Suggestions, Lead-Draft (Variante A)](Edit-System-Blocks-Suggestions-Lead-Draft.md).

**Referenzen:** [Prisma-Schema](../platform/datenmodell/Pseudocode%20Datenmodell.md), [Rechtesystem](../platform/datenmodell/Rechtesystem.md), [Versionierung als Snapshots](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md). Implementierung: `apps/backend/`, `apps/frontend/`.

---

## 1. Zustände und Felder

Relevante Felder am Dokument: `publishedAt`, `deletedAt`, `archivedAt`, `contextId`, `currentPublishedVersionId` (veröffentlichte Inhalte versioniert als Snapshots).

- **Unveröffentlichtes Dokument:** `publishedAt == null` (sog. Kontext-Draft: nur für Nutzer mit Schreibrecht bzw. Lead sichtbar, nicht für reine Leser).
- **Veröffentlicht:** `publishedAt` gesetzt, `currentPublishedVersionId` zeigt auf die aktuelle lesbare Version (Snapshot).
- **Archiviert:** `archivedAt` gesetzt.
- **Papierkorb:** `deletedAt` gesetzt (Soft-Delete).

---

## 2. Lifecycle-Events (über API / Produkt)

| Event                                      | Typische Route / Ort                 | Kurzbeschreibung                                                                |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| **Dokument anlegen**                       | `POST /api/v1/documents`             | Immer zunächst unveröffentlicht; optional mit oder ohne `contextId`             |
| **Unveröffentlichtes Dokument bearbeiten** | `PATCH /api/v1/documents/:id`        | Inhalt/Metadaten, solange nicht veröffentlicht                                  |
| **Veröffentlichen**                        | `POST /api/v1/documents/:id/publish` | Erste Published-Version (Snapshot), nur mit Berechtigung und sinnvollem Kontext |
| **Metadaten ändern**                       | `PATCH /api/v1/documents/:id`        | Titel, Beschreibung, Tags, Kontextzuweisung (je nach Schema/Rechten)            |
| **Kontext zuweisen**                       | `PATCH …` (`contextId`)              | Zuweisung zu Prozess/Projekt/Unterkontext                                       |
| **Pinnen / Entpinnen**                     | `POST/DELETE /api/v1/pinned`         | Betrifft nur `DocumentPinnedInScope`, nicht den inhaltlichen Lifecycle          |
| **Archivieren**                            | `POST /api/v1/documents/:id/archive` | `archivedAt` setzen                                                             |
| **In Papierkorb**                          | `DELETE /api/v1/documents/:id`       | Soft-Delete; Pins des Dokuments werden entfernt                                 |
| **Wiederherstellen**                       | `POST /api/v1/documents/:id/restore` | `deletedAt` zurücksetzen; Pins werden nicht automatisch wiederhergestellt       |

**Neue Version des _veröffentlichten_ Inhalts:** erfolgt im Zielbild über **Lead-Draft + Suggestions + expliziten Publish** (siehe Edit-System-Plan); technisch weiterhin als **neuer Snapshot** (`DocumentVersion`) abbildbar.

---

## 3. Zustandsdiagramm (vereinfacht)

```
Create (POST /documents)
        │
        ▼
  UNVERÖFFENTLICHT (publishedAt = null)
        │ Edit, Assign, Delete…
        │ Publish (POST …/publish, mit Recht + Kontext)
        ▼
  VERÖFFENTLICHT
        │ Inhaltsänderungen: künftig Suggestions + Lead-Draft + Publish (Plan)
        │ Archive / Delete …
        ▼
  ARCHIVIERT ──► TRASH (deletedAt) ──► Restore (optional)
```

---

## 4. Berechtigungen (Kurz)

- **Lesen:** `canRead` auf Dokument (inkl. Grants, Kontext, Lead-Regeln).
- **Schreiben / Vorschläge:** `canWrite` (Details und künftige Aufteilung „nur Suggest“ vs. „Lead-Draft“ siehe Edit-System-Plan und Rechtesystem).
- **Veröffentlichen / neue Version aus Lead-Draft:** nur Leads bzw. explizit Berechtigte (siehe Rechtesystem, Abschnitt Freigabe).

---

## 5. Bekannte Randfälle (fachlich)

1. **Papierkorb und Pins:** Beim Verschieben in den Papierkorb werden Pins gelöscht; nach **Restore** werden sie **nicht** automatisch wieder angelegt.
2. **Kontext gelöscht:** Abhängig vom Schema können Dokumente vom gelöschten Kontext **losgelöst** (z. B. `contextId = null`) werden, ohne dass sie im Papierkorb landen – das ist kein Trash-Ersatz.
3. **Dauerhaftes Löschen:** ggf. später eigener Endpoint/Prozess; bis dahin Soft-Delete und ggf. Aufbewahrung von Snapshots/Anhängen klären.

---

## 6. Pflegehinweis

Änderungen an Routen, Rechten oder am **Edit-/Versionsmodell** sollten **dieses Dokument** und den Plan [Edit-System-Blocks-Suggestions-Lead-Draft.md](Edit-System-Blocks-Suggestions-Lead-Draft.md) gemeinsam aktualisieren, damit Plattform-Doku und Umsetzung nicht auseinanderlaufen.
