# Versionierung als Snapshots

**Geplant (Phase 2).** Siehe [Umsetzungs-Todo §12](../../plan/Umsetzungs-Todo.md#12-versionierung--pr-workflow).

---

## 1. Kernidee: Versionierung als Snapshots + Deltas

- Dokument = logische Einheit, z. B. Markdown-Datei.
- Version = Snapshot des Dokuments zum Zeitpunkt der Änderung.
- Um Speicher zu sparen: nicht jede Version als vollständige Kopie speichern, sondern nur Deltas (Differenzen zur vorherigen Version).
- Referenzierung über Hash: Jede gespeicherte Version bekommt eine eindeutige ID (wie Git-SHA).
- Branches / Drafts sind nur Pointer auf eine Version oder eine Sequenz von Versionen.

## 2. Pull-Request / Draft Workflow

Unter „Drafts“ werden zwei Dinge verstanden: (1) **Dokument-Status „draft“** – noch nicht veröffentlichte Dokumente (nur für Autor/Schreiber sichtbar bis zur Veröffentlichung); (2) **PR-/Versions-Draft** – eine eingereichte Änderung an einem (ggf. bereits veröffentlichten) Dokument, die auf Merge wartet.

- Leser und Writer können Drafts/PRs **einreichen** (neue Versionen / temporäre Snapshots vorschlagen).
- **Mergen** (PR genehmigen und in die Hauptversion übernehmen) darf **nur Scope-Lead** (Team/Department/Company Lead der Owner-Unit, Owner bei persönlichen Kontexten, Admin). Ein **Writer-Grant** berechtigt zum Einreichen von PRs, **nicht** zum Mergen.
- Scope-Lead prüfen Drafts, kommentieren, genehmigen oder lehnen ab. Genehmigte PRs werden in den Hauptbranch / Hauptkontext gemergt.
- Abgelehnte PRs bleiben als historische Drafts erhalten oder werden gelöscht (Garbage Collection).

**Konkrete Tabellen (Schema-Entwurf):** Die Entitäten **DocumentVersion** (Snapshot pro Änderung) und **DraftRequest** (offener PR mit Quell-/Ziel-Version, Status, eingereicht von) sind im [Prisma-Schema-Entwurf §8 (Versionierung & PR)](../../plan/Prisma-Schema-Entwurf.md#8-versionierung--pr-geplant) beschrieben. Document-Status (draft/published) siehe dort §3.

## 3. Speicheroptimierung

- Delta-Speicherung
- Nur Unterschiede zwischen Versionen speichern → spart Speicher bei kleinen Änderungen.
- Content-Referenzierung / Deduplication
- Identische Inhalte oder unveränderte Blöcke werden nur einmal gespeichert.
- Ähnlich wie Git-Blobs → mehrere Versionen können denselben Content referenzieren.
- Snapshots für Branches
- Branch = sequenzielle Referenz auf eine bestimmte Versionen-Kette.
- Merge = Branch-Pointer wird auf die genehmigte Version aktualisiert, keine Duplikation nötig.
- Archivierung / Garbage Collection
- Alte PRs oder abgelehnte Drafts können nach einer Frist gelöscht oder ausgelagert werden.
- Historische Versionen bleiben, solange sie relevant sind (z. B. Policy-Dokumente).

## 4. Rechte & Ownership

- Ownership: Abteilung, Team oder Nutzer → Verantwortlichkeit, nicht automatisch Zugriff.
- **PR einreichen:** Leser und Writer dürfen Drafts/PRs erstellen. **Merge:** ausschließlich **Scope-Lead** (Team/Department/Company Lead der Owner-Unit, Owner bei persönlichen Kontexten, Admin). Writer-Grant berechtigt nicht zum Mergen (vgl. [Rechtesystem 6b](../datenmodell/Rechtesystem.md)).
- Drafts sind nur für Nutzer sichtbar, die Zugriff auf das Dokument haben.
- Änderungen werden erst nach Merge öffentlich. Dokumente können zudem einen Status **draft** vs. **published** haben (Draft = bis zur Veröffentlichung nur für Autor/Schreiber sichtbar).

## 5. Vorteile gegenüber echtem Git für interne Plattformen

- Abstraktion für Nutzer: Kein Git-Wissen nötig, alles läuft über Web-UI.
- Bessere Rechtekontrolle: Drafts, PRs und Merge explizit durch Superuser gesteuert.
- Leichtere Skalierung: Versionen können in DB / Object Store gespeichert werden, Delta + Dedup spart Speicher.
- Kontextintegration: Dokumente bleiben klar an Prozess, Projekt oder Unterkontext gebunden.

## Kurz gesagt:

Pseudo-Git = Git-artige Versionierung + PRs + Rechtekontrolle, optimiert für Web-UI und interne Plattformen.
Speicher wird durch Deltas, Deduplication und Snapshots effizient gehalten, und die komplexe Git-Merge-Logik kann stark vereinfacht werden.
