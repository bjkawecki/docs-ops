# Versionierung als Snapshots

**Geplant (Phase 2).** Siehe [Umsetzungs-Todo §15](../../plan/Umsetzungs-Todo.md#15-versionierung--pr-workflow).

---

## 1. Kernidee: Versionierung als Snapshots (Full-Version)

- Dokument = logische Einheit, z. B. Markdown-Datei.
- **Versionierung nur für veröffentlichte Dokumente:** Version = Snapshot des Dokuments zum Zeitpunkt der **Veröffentlichung** bzw. des **Merge** eines PRs. Keine Versionen für reine Draft-Zustände; Speichern eines Drafts erzeugt keine neue Version.
- **Full-Version:** Jede Version speichert den **vollständigen** Dokumentinhalt (keine Delta-Speicherung). Einfacher, robuster; Speicherbedarf über optionales Limit „nur letzte N Versionen“ steuerbar.
- Die veröffentlichte Versionenkette („main“) ist die Sequenz der Snapshots; PR-Drafts verweisen auf einen vorgeschlagenen Stand und werden erst beim Merge zu einem Snapshot.
- **Versionsvergleich:** Zwei Versionen können in der UI verglichen werden (Diff-Anzeige, z. B. rot/grün), indem die beiden Volltexte verglichen werden (z. B. diff-match-patch).

## 2. Pull-Request / Draft Workflow

Unter „Drafts“ werden zwei Dinge verstanden: (1) **Dokument-Status „draft“** – noch nicht veröffentlichte Dokumente (nur für Autor/Schreiber sichtbar bis zur Veröffentlichung); (2) **PR-/Versions-Draft** – eine eingereichte Änderung an einem (ggf. bereits veröffentlichten) Dokument, die auf Merge wartet.

- **Nur Writer** (und Scope-Lead) können Drafts/PRs **einreichen** (Draft-Inhalt als Änderungsvorschlag; wird erst beim Merge zu einer neuen Version/Snapshot).
- **Mergen** (PR genehmigen und in die Hauptversion übernehmen) darf **nur Scope-Lead** (Team/Department/Company Lead der Owner-Unit, Owner bei persönlichen Kontexten, Admin). Ein **Writer-Grant** berechtigt zum Einreichen von PRs, **nicht** zum Mergen.
- Scope-Lead prüfen Drafts, kommentieren, genehmigen oder lehnen ab. Genehmigte PRs werden in den Hauptbranch / Hauptkontext gemergt.
- Abgelehnte PRs bleiben als historische Drafts erhalten oder werden gelöscht (Garbage Collection).

**Konkrete Tabellen (Schema-Entwurf):** Die Entitäten **DocumentVersion** (Snapshot nur bei Veröffentlichung und bei Merge), **DraftRequest** (offener PR) und **DocumentDraft** (pro User eine Arbeitskopie pro Dokument mit **basedOnVersionId**) sind im [Prisma-Schema-Entwurf §8 (Versionierung & PR)](../../plan/Prisma-Schema-Entwurf.md#8-versionierung--pr-geplant) beschrieben. Document-Status (draft/published) siehe dort §3.

**Pro-User-Draft und „Auf neueste Version updaten“:** Bei mehreren Bearbeitern hat jeder einen eigenen Draft (DocumentDraft) mit **basedOnVersionId** (die Version, auf der der Draft basiert). Wenn inzwischen eine neuere Version veröffentlicht wurde, kann der Nutzer „Auf neueste Version updaten“ wählen: Backend lädt Basis (Inhalt von basedOnVersionId), Theirs (aktueller veröffentlichter Inhalt), Ours (Draft-Inhalt), führt einen **3-Wege-Merge** aus und liefert das Ergebnis (ggf. mit Konflikt-Markern). Der Nutzer löst Konflikte in der UI auf; der bereinigte Merged-Text wird als neuer Draft gespeichert und basedOnVersionId auf die aktuelle Version gesetzt. So gehen Änderungen im Draft nicht verloren.

## 3. Speicher und Archivierung

- **Full-Version pro Snapshot:** Jede DocumentVersion enthält den vollständigen Inhalt; keine Delta- oder Blob-Deduplizierung. Einfache Implementierung, direkter Zugriff auf jede Version.
- **Optionale Begrenzung:** Policy „nur letzte N Versionen behalten“ (z. B. N=5 oder N=10) begrenzt Speicher und bleibt mit Full-Versionen gut handhabbar.
- **Archivierung / Garbage Collection:** Alte PRs oder abgelehnte Drafts können nach einer Frist gelöscht oder ausgelagert werden. Ältere Versionen außerhalb von „letzte N“ können entfernt werden.

## 4. Rechte & Ownership

- Ownership: Abteilung, Team oder Nutzer → Verantwortlichkeit, nicht automatisch Zugriff.
- **PR einreichen:** Nur **Writer** (und Scope-Lead) dürfen Drafts/PRs erstellen. **Merge:** ausschließlich **Scope-Lead** (Team/Department/Company Lead der Owner-Unit, Owner bei persönlichen Kontexten, Admin). Writer-Grant berechtigt nicht zum Mergen (vgl. [Rechtesystem 6b](../datenmodell/Rechtesystem.md)).
- Drafts sind nur für Nutzer sichtbar, die Zugriff auf das Dokument haben.
- Änderungen werden erst nach Merge öffentlich. Dokumente können zudem einen Status **draft** vs. **published** haben (Draft = bis zur Veröffentlichung nur für Autor/Schreiber sichtbar).

## 5. Vorteile gegenüber echtem Git für interne Plattformen

- Abstraktion für Nutzer: Kein Git-Wissen nötig, alles läuft über Web-UI.
- Bessere Rechtekontrolle: Drafts, PRs und Merge explizit durch Superuser gesteuert.
- Leichtere Skalierung: Versionen in DB; Full-Version pro Snapshot, optional „letzte N Versionen“.
- Kontextintegration: Dokumente bleiben klar an Prozess, Projekt oder Unterkontext gebunden.

## Kurz gesagt:

Pseudo-Git = Git-artige Versionierung + PRs + Rechtekontrolle, optimiert für Web-UI und interne Plattformen.
Jede Version = vollständiger Snapshot (Full-Version); optional Begrenzung auf letzte N Versionen. Versionsvergleich in der UI per Diff zweier Volltexte (z. B. rot/grün).
