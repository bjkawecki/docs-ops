# Versionierung als Snapshots

**Verbindlicher Ausblick:** Inhaltliche Änderungen an **veröffentlichten** Dokumenten werden über **Suggestions (Autoren)** und **Lead-Draft + Publish** abgebildet; siehe [Edit-System: Blocks, Suggestions, Lead-Draft (Variante A)](../../plan/Edit-System-Blocks-Suggestions-Lead-Draft.md).  
Kurzreferenz zur Umsetzungsplanung: [Umsetzungs-Todo §15](../../plan/Umsetzungs-Todo.md#15-versionierung--ausblick).

---

## 1. Kernidee: Versionierung als Snapshots (Full-Version)

- Dokument = logische Einheit; kanonischer Inhalt künftig als **Block-JSON** (nicht mehr ausschließlich ein Markdown-String).
- **Versionierung für veröffentlichte Dokumente:** Jede **Published**-Ausbaustufe entspricht einem **Snapshot** (vollständiger Inhalt dieser Version). Speichern im Lead-Draft oder Annehmen von Suggestions erzeugt **keine** neue öffentliche Version, bis der Lead **veröffentlicht** (expliziter Schritt).
- **Full-Version:** Jede gespeicherte Version enthält den **vollständigen** Dokumentinhalt (keine Delta-Speicherung als Pflicht). Optional: Policy „nur letzte N Versionen“.
- **Versionsvergleich:** Zwei Versionen in der UI vergleichen (z. B. rot/grün), indem die beiden Snapshots verglichen werden (z. B. diff-match-patch auf serialisiertem Text/Markdown).

---

## 2. Freigabe und sichtbare Inhalte

- **Unveröffentlichtes Dokument** (`publishedAt == null`): nur für Nutzer mit Schreibrecht (bzw. Lead) sichtbar, bis zur Veröffentlichung.
- **Veröffentlicht:** Leser sehen den **Snapshot** der aktuellen Version.
- **Autoren** reichen **Suggestions** ein; **Lead** integriert im **Lead-Draft** und löst **Publish** aus → neuer Snapshot, neue Versionsnummer.

Details zu Rollen, Datenfeldern und API-Oberfläche: [Edit-System-Plan](../../plan/Edit-System-Blocks-Suggestions-Lead-Draft.md).

---

## 3. Speicher und Archivierung

- **Full-Version pro Snapshot:** jede Zeile in `DocumentVersion` (o. ä.) enthält den vollständigen Inhalt der Version.
- **Optional:** Begrenzung auf die letzten N Versionen; Aufräumen abgelehnter oder veralteter Vorschlags-Artefakte nach Produktregel.

---

## 4. Rechte & Ownership

- **Kontextfreie unveröffentlichte Dokumente:** Veröffentlichung setzt einen **zugewiesenen Kontext** voraus; zuerst per `PATCH` `contextId` setzen, dann Publish (siehe Plattform-Regeln).
- **Ownership:** Abteilung, Team oder Nutzer → Verantwortlichkeit; Zugriff über Grants und Lead-Regeln, nicht automatisch vererbt.
- **Freigabe neuer Version:** nur **Scope-Lead** (bzw. Admin / Owner persönlicher Kontexte) im Sinne des Rechtesystems; Schreiber liefern Inhalte über Suggestions, nicht durch direktes Überschreiben der Published-Version.

---

## 5. Vorteile gegenüber echtem Git für interne Plattformen

- Kein Git-Wissen nötig; Ablauf über Web-UI.
- Explizite Rechte an Dokumenten und Freigabe.
- Versionen in der Datenbank; nachvollziehbare Snapshots.
- Klare Einbettung in Prozess/Projekt/Unterkontext.

---

## Kurz gesagt

**Snapshots + Lead-gesteuerter Publish** ersetzen parallele Volltext-Entwürfe mit manuellem Zusammenführen als Produktkonzept. Technische Umsetzung und Editorwahl (Tiptap/ProseMirror) stehen im [Edit-System-Plan](../../plan/Edit-System-Blocks-Suggestions-Lead-Draft.md).
