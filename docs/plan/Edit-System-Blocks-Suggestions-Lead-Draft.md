# Plan: Edit-System mit Blocks (JSON), Suggestions und Lead-Draft (Variante A)

## 1. Zielbild

Umstellung des Dokumenten-Editierens von **„Markdown-String + persönlicher Draft / Draft Requests (PR)“** auf ein **strukturiertes Block-Modell (JSON)** mit klar getrennten Schichten:
| Schicht | Zweck | Sichtbarkeit |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Published** | Offizielle, lesbare Version | Leser + alle mit Leserecht; Autoren sehen sie als Referenz |
| **Lead-Draft** | Arbeitsstand zur Vorbereitung der nächsten Published-Version | Bearbeitbar **nur** durch Scope Lead (bzw. explizit gleichgestellte Merge-Rolle); Autoren **lesen** den aktuellen Draft-Stand (optional) zur Orientierung |
| **Suggestions** | Änderungsvorschläge von Autoren gegen den **aktuellen Draft** (und/oder mit Bezug auf **Published-Version** als Basis – siehe Abschnitt 4) | Für **alle Autoren** (Schreibrecht) sichtbar; Near-Realtime-Updates wünschenswert |
**Variante A (verbindlich für diesen Plan):**

- **Autoren** erzeugen **ausschließlich Suggestions** (kein direktes Editieren des Lead-Drafts).
- **Lead** wendet Suggestions an (oder lehnt ab / kommentiert) und **editiert den Draft direkt**.
- **Publish:** Lead setzt Draft als neue **Published**-Version (expliziter Schritt), inkl. definierter Nachbearbeitung offener Suggestions.
  Damit entfällt die Notwendigkeit klassischer **Text-Merge-Konflikte** für Autoren; verbleibende Konflikte sind **fachliche Überlappungen** (zwei Vorschläge betreffen dieselbe Stelle) und werden **sichtbar** entschieden – nicht durch automatischen Merge von Freitext.

---

## 2. Motivation (Warum der Umbau)

1. **Stabile Adressierung:** Vorschläge sollen an **Block-IDs** hängen, nicht an fragile Zeichen-Offsets im Gesamtdokument.
2. **Kleine und große Änderungen:** Operationen auf Blöcken **plus** „Makro“-Vorschläge (z. B. Ersetzen einer Section / mehrerer Blöcke) ohne PR-Paradigma pro Nutzer.
3. **Kollaboration ohne Google-Docs-Realtime:** Autoren sehen fremde Suggestions; Lead kuratiert zentral.
4. **Eine UI-Spalte:** WYSIWYG auf Block-Basis statt getrennt „Markdown-Editor + Vorschau“ (Frontend-Vereinfachung).

---

## 2. Motivation (Warum der Umbau)

1. **Stabile Adressierung:** Vorschläge sollen an **Block-IDs** hängen, nicht an fragile Zeichen-Offsets im Gesamtdokument.
2. **Kleine und große Änderungen:** Operationen auf Blöcken **plus** „Makro“-Vorschläge (z. B. Ersetzen einer Section / mehrerer Blöcke) ohne PR-Paradigma pro Nutzer.
3. **Kollaboration ohne Google-Docs-Realtime:** Autoren sehen fremde Suggestions; Lead kuratiert zentral.
4. **Eine UI-Spalte:** WYSIWYG auf Block-Basis statt getrennt „Markdown-Editor + Vorschau“ (Frontend-Vereinfachung).

---

## 3. Nicht-Ziele (Scope-Grenzen)

- Kein vollständiges **OT/CRDT-Echtzeit-Coediting** im Lead-Draft (nur ein Lead-Editor; optional Lock/Revision für Lead).
- Kein Ersatz für **Kommentar-Threads** durch Suggestions (Kommentare können parallel existieren; Schnittstellen klären).
- Keine finale Festlegung eines konkreten Editor-Frameworks in diesem Dokument (Auswahl in Umsetzungsphase: z. B. Tiptap/ProseMirror-basiert).

---

## 4. Fachliche Anforderungen

### 4.1 Rollen & Rechte

- **Leser (`Read`):** nur Published; keine Suggestions erstellen.
- **Autoren (`Write`):** Suggestions erstellen, zurückziehen (solange pending), andere Suggestions **lesen**; **kein** `PUT` auf Lead-Draft-Inhalt.
- **Lead (Merge/Publish-Recht pro Scope):** Draft lesen/schreiben, Suggestions anwenden/ablehnen/kommentieren, Publish auslösen.
- **Admin:** wie heute übergreifend; optional Delegation (später).
  **Prüfung:** Alle neuen Endpoints müssen über bestehende oder erweiterte Permission-Funktionen laufen (kein „nur Cookie = Zugriff“).

### 4.2 Suggestion-Lebenszyklus

Mindest-Status (erweiterbar):

- `pending` – offen
- `accepted` – in eine Published-Version übernommen (oder in Draft integriert, je nach Modellierung)
- `rejected` – abgelehnt
- `withdrawn` – vom Autor zurückgezogen
- optional: `superseded` – durch neueren Vorschlag oder Publish ersetzt
  **Überlappung:** Wenn zwei `pending`-Suggestions dieselbe Block-Region betreffen, zeigt die UI beide; Lead wählt explizit (kein Auto-Merge).

### 4.3 Basis-Version pro Suggestion

Festzulegen (Entscheidung vor Implementierung):

- **Option 1:** Suggestion bezieht sich immer auf **`publishedVersionId` / `publishedVersionNumber`** (Autoren arbeiten „gegen Release“).
- **Option 2:** Suggestion bezieht sich auf **`draftRevision`** (Autoren arbeiten gegen den gemeinsamen Draft-Stand).
  Empfehlung für Variante A mit sichtbarem Draft: **Option 2 als Primärbezug**, optional zusätzlich gespeicherter **`publishedVersionAtSubmit`** zur Audit-Linie.
  Bei Publish: alle noch `pending` und gegen veraltete Basis → Regel **„stale / needs refresh“** oder **automatisch `superseded`** (Produktentscheidung, siehe 6.3).

### 4.4 Near-Realtime

- Nach Erstellung/Änderung einer Suggestion sollen andere Autoren (und Lead) **zeitnah** aktualisiert werden (SSE/WebSocket oder Polling + ETag).
- Lead-Draft-Änderungen sollten für Autoren-Leseansicht ebenfalls **zeitnah** sichtbar sein.

### 4.5 Publish

- Expliziter Schritt **„Publish Draft → neue Published Version“**.
- Atomar: neue `DocumentVersion` (oder äquivalent), `currentPublishedVersionId` setzen, Published-Content aus Draft übernehmen.
- **Konsequenzen für Suggestions:** siehe 6.3.

### 4.6 Import / Export

- **Export nach Markdown** (und ggf. PDF-Pipeline) bleibt Anforderung; Quelle ist dann **Serialisierung aus Blocks**, nicht menscheneditierter Roh-Markdown-String als DB-Wahrheit.
- **Import:** Markdown/Datei-Upload → Block-Normalisierung (Parser); Fehlerfälle definieren.

---

## 5. Technische Anforderungen (Datenmodell)

### 5.1 Block-Dokument

Speicherung als **versionierter JSON-Dokumentenbaum** (Top-Level: Metadaten + `blocks[]` oder ähnliches). Jeder Block hat:

- `id` (stabil, UUID/CUID)
- `type` (z. B. `paragraph`, `heading`, `list`, `code`, …)
- `attrs` / `content` je nach Schema
- optional: `meta` (z. B. für interne Marker)
  **Validierung:** Zod-Schemas serverseitig; Schema-Version `schemaVersion` im JSON für Migrationen.

### 5.2 Lead-Draft

Varianten (eine wählen):

- **A)** Draft als eigene Spalte/JSON auf `Document` (`draftBlocks`) + `draftRevision` (Integer).
- **B)** Draft als eigene Tabelle `DocumentDraftWorkspace` (1:1 zu Document) mit Revision.
  Kriterien: Historisierung des Drafts (optional), Größe, Transaktionen.

### 5.3 Suggestions-Tabelle

Neu (konzeptionell), u. a. Felder:

- `id`, `documentId`, `authorId`
- `status`
- `baseDraftRevision` (oder `basePublishedVersionId`)
- `ops` (JSON): Liste von Operationen (`replaceBlock`, `insertAfter`, `deleteBlock`, `replaceRange` **nur** wenn innere Mini-Range innerhalb eines Blocks erlaubt ist)
- optional: `macroPayload` für große Section-Replace
- `createdAt`, `updatedAt`, `resolvedAt`, `resolvedById`, `comment` (Lead)
  Indizes: `(documentId, status)`, `(documentId, authorId)`.

---

## 6. API-Änderungen (Überblick)

Neu oder zu ersetzen (konkrete Pfade in der Implementierung festlegen):

- `GET /documents/:id` – liefert Published + Metadaten; optional eingebetteter Draft-Leseview für berechtigte Autoren/Lead.
- `GET /documents/:id/draft` – Lead: voll; Autor: read-only Snapshot + `draftRevision`.
- `PATCH /documents/:id/draft` – **nur Lead** (Blocks patchen / komplett ersetzen mit Revision-Check).
- `GET /documents/:id/suggestions` – Liste filterbar nach Status.
- `POST /documents/:id/suggestions` – Autor legt an (mit `baseDraftRevision` → 409 bei veralteter Basis).
- `POST /documents/:id/suggestions/:sid/withdraw` – Autor.
- `POST /documents/:id/suggestions/:sid/accept` – Lead (wendet Ops auf Draft an, optional atomar mit Revision bump).
- `POST /documents/:id/suggestions/:sid/reject` – Lead.
- `POST /documents/:id/publish` – Lead (Draft → Published + neue Version).
  **Entfall / Deprecation:** bestehende Endpoints für persönlichen `DocumentDraft` pro Nutzer, `draft-requests` (PR), direktes `content`-Markdown-`PATCH` für Autoren – müssen strategisch abgelöst oder übergangsweise parallel betrieben werden (siehe 8).

---

## 7. Frontend-Änderungen (Überblick)

- **DocumentPage:** Modus „Read published“ vs. „Review draft & suggestions“ (Rechte abhängig).
- **Editor:** ein WYSIWYG-Block-Editor für Lead; Autoren-UI: Suggestion-Modus (Inline „Suggest change“) ohne Draft-Schreibzugriff.
- **Suggestions-Panel:** Liste, Filter, Diff pro Suggestion, Überlappungs-Hinweise.
- **Echtzeit:** Subscription/Polling für Suggestions + Draft-Revision.
- **Entfernen / Ersetzen:** split Markdown Editor + Preview, sofern durch Block-Editor ersetzt.

---

## 8. Migration & Kompatibilität

1. **Datenmigration:** bestehende `Document.content` (Markdown) → Block-JSON (einmaliger Import-Job + Fallback-Reader).
2. **API-Übergang:** Feature-Flag oder API-Version `v2` für Dokument-Shape (Published als Blocks + Markdown-Export-Feld optional während Übergang).
3. **Suchindex / FTS:** Indexierung aus **Plaintext/serialisiertem Markdown** aus Blocks (Hintergrund-Job), nicht aus Roh-Markdown-Spalte.
4. **PDF-Export:** Pandoc weiter nutzbar über **Markdown-Serialisierung** aus Blocks.
5. **Versionierung:** bestehendes `DocumentVersion`-Konzept behalten; Inhalt der Version ist dann serialisiert (JSON oder exportierter Snapshot).

---

## 9. Betroffene Codebereiche (Repo-orientiert)

Ohne Vollständigkeit, als Checkliste:

- **Prisma:** `Document` (`content` → `publishedBlocks` JSON o. ä.), Draft-Speicher, neue `Suggestion`-Modelle; Migrationen.
- **Backend:** `routes/documents.ts` und zugehörige Services; Entfernen/Verschieben von Draft-Request-Merge-Logik persönlicher Drafts, sofern obsolet.
- **Permissions:** `canWrite` vs. neue Aktionen `canSuggest`, `canEditLeadDraft`, `canPublish` (feingranular oder aus Lead-Rechten abgeleitet).
- **Frontend:** `DocumentPage.tsx`, ggf. neue Komponenten unter `components/documents/`; Entfernen Dual-Column Markdown UI.
- **Tests:** Vitest für neue Regeln (Autor darf keinen Draft patchen; Lead schon; stale suggestion 409).
- **Doku:** `docs/platform/` Lifecycle/Versionierung anpassen; dieses Plan-Dokument mit Umsetzungs-Todo verknüpfen.

---

## 10. Risiken & offene Entscheidungen

| Thema                          | Risiko / Frage                 | Entscheidungshilfe                                               |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| Block-Schema-Evolution         | Breaking Changes               | `schemaVersion` + Migrations-Skripte                             |
| Große Umbauten                 | Viele kleine Ops vs. ein Macro | Makro-Op `replaceBlocksByRange` definieren                       |
| Lead-Auslastung                | Viele Suggestions              | Limits, „Paket“-Gruppierung, Autoren-Selbsthilfe (withdraw)      |
| Stale Suggestions nach Publish | UX                             | Klar kommunizieren + Status `superseded`                         |
| Kommentare vs. Suggestions     | Doppelte UX                    | Kommentare nur diskutieren, Suggestions nur inhaltliche Änderung |

---

## 11. Abgleich mit `new-edit-system.md`

Das vorhandene Konzeptpapier `new-edit-system.md` bleibt als **Ideengrundlage** bestehen. Dieses Dokument präzisiert:

- **Speicherung** als Blocks/JSON statt Markdown als Source of Truth.
- **Sichtbarkeit:** Draft-Leseansicht für Autoren + sichtbare Suggestions (Near-Realtime).
- **Variante A** als verbindliche Rollentrennung.

---

## 12. Nächste Schritte (Umsetzung)

1. **Entscheidung** zu Suggestion-Basis (`draftRevision` vs. `publishedVersion`) und Stale-Regel nach Publish.
2. **Block-Schema v0** definieren (Zod + Beispiel-JSON).
3. **API-Skizze** (OpenAPI-artig oder direkt Zod-Routen-Schemas) und Permission-Matrix.
4. **Migrationsstrategie** für bestehende Dokumente (Pilot-Dokumente, Rollback-Plan).
5. Eintrag in `docs/plan/Umsetzungs-Todo.md` mit Meilensteinen.
