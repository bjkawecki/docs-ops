# Versionierung als Snapshots

## 1. Kernidee: Versionierung als Snapshots + Deltas

- Dokument = logische Einheit, z. B. Markdown-Datei.
- Version = Snapshot des Dokuments zum Zeitpunkt der Änderung.
- Um Speicher zu sparen: nicht jede Version als vollständige Kopie speichern, sondern nur Deltas (Differenzen zur vorherigen Version).
- Referenzierung über Hash: Jede gespeicherte Version bekommt eine eindeutige ID (wie Git-SHA).
- Branches / Drafts sind nur Pointer auf eine Version oder eine Sequenz von Versionen.

## 2. Pull-Request / Draft Workflow

- Leserechte-Nutzer erstellen Drafts (PRs) → neue Versionen / temporäre Snapshots.
- Schreibrechte-Nutzer prüfen Drafts, kommentieren, genehmigen oder ablehnen.
- Genehmigte PRs werden in den Hauptbranch / Hauptkontext gemergt.
- Abgelehnte PRs bleiben als historische Drafts erhalten oder werden gelöscht (Garbage Collection).

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
- Zugriffsrechte: Leserechte → Drafts erstellen; Schreibrechte → Genehmigung / Merge.
- Drafts sind nur für Nutzer sichtbar, die Zugriff auf das Dokument haben.
- Änderungen werden erst nach Merge öffentlich.

## 5. Vorteile gegenüber echtem Git für interne Plattformen

- Abstraktion für Nutzer: Kein Git-Wissen nötig, alles läuft über Web-UI.
- Bessere Rechtekontrolle: Drafts, PRs und Merge explizit durch Superuser gesteuert.
- Leichtere Skalierung: Versionen können in DB / Object Store gespeichert werden, Delta + Dedup spart Speicher.
- Kontextintegration: Dokumente bleiben klar an Prozess, Projekt, Unterkontext oder Nutzerspace gebunden.

## Kurz gesagt:

Pseudo-Git = Git-artige Versionierung + PRs + Rechtekontrolle, optimiert für Web-UI und interne Plattformen.
Speicher wird durch Deltas, Deduplication und Snapshots effizient gehalten, und die komplexe Git-Merge-Logik kann stark vereinfacht werden.
