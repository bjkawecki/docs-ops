# Vergleich: DocsOps und Docmost

Dieses Dokument vergleicht die **interne Dokumentationsplattform DocsOps** (dieses Projekt) mit **Docmost**, einer quelloffenen, selbst gehosteten Wiki- und Dokumentationsplattform (Notion/Confluence-Alternative). Ziel ist eine sachliche Gegenüberstellung von Konzept, Stärken und Einsatzszenarien – und die Einordnung, wann der Ansatz von DocsOps seine Berechtigung hat.

**Stand:** Die Beschreibung von Docmost basiert auf öffentlicher Dokumentation und Produktbeschreibungen; Details können sich ändern. DocsOps wird aus der Projekt-Dokumentation in `docs/platform/` und `docs/plan/` abgeleitet.

---

## 1. Kurzüberblick

|                | Docmost                                                                       | DocsOps                                                                                            |
| -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Typ**        | Open-Source-Wiki / Knowledge-Base, selbst gehostet                            | Interne Dokumentationsplattform (eigenes Projekt)                                                  |
| **Vorbilder**  | Notion, Confluence                                                            | Eigenes Modell (Org-Hierarchie, dokumentweise Rechte, PR-Workflow)                                 |
| **Editor**     | Blockbasiert (TipTap), Echtzeit-Kollaboration                                 | Markdown, klassisches Bearbeiten, Draft/PR-Workflow                                                |
| **Struktur**   | Workspace → Spaces → Pages                                                    | Company → Department → Team; Kontexte (Process/Project/Subcontext) → Documents                     |
| **Rechte**     | Space-Level (Viewer / Can Edit / Full Access); Enterprise: Page-Level; Groups | Dokument-Level (Leser/Schreiber), Grants für User/Team/Department; Leads (Team/Department/Company) |
| **Publishing** | Seiten in Spaces, Version History                                             | Draft vs. Published, PR-Merge nur durch Scope-Lead                                                 |

Beide Systeme zielen auf **interne Dokumentation**, **Selbsthosting** und **kontrollierte Zugriffsmodelle**. Sie unterscheiden sich vor allem in der **Granularität der Rechte**, der **Rolle der Organisationshierarchie** und dem **Publikationsmodell** (sofortiges gemeinsames Bearbeiten vs. Freigabe-Workflow).

---

## 2. Was ist „blockbasiert“?

**Blockbasiert** bedeutet: Der Inhalt besteht aus **einzeln bearbeitbaren Blöcken**, nicht aus einem durchgehenden Text.

- Jede Zeile, jeder Absatz, jede Liste oder Tabelle ist ein **Block**. Man wählt einen Block aus und bearbeitet nur diesen (z. B. Überschrift, Absatz, Codeblock, Bild).
- Blöcke können **umgeordnet** werden (z. B. per Drag & Drop), ohne den gesamten Text neu zu tippen.
- Typische Block-Typen: Überschrift, Fließtext, Aufzählung, Checkliste, Code, Tabelle, Bild, Zitat, Trennlinie.
- Bekannte blockbasierte Editoren: Notion, Confluence (neuer Editor), Coda, Slite – bei Docmost der Editor auf Basis von **TipTap**.

**Im Gegensatz dazu:** Ein **nicht blockbasierter** Ansatz nutzt einen durchgehenden Text (oft Markdown), der von oben bis unten bearbeitet wird – z. B. in einem Code-Editor oder Textarea. So arbeitet DocsOps: ein Markdown-Dokument als Ganzes, ohne separate „Blöcke“ pro Absatz.

---

## 3. Docmost: Stärken und Modell

### 3.1 Architektur und Struktur

- **Workspace** = oberste Ebene (eine Instanz / eine Firma).
- **Spaces** = Bereiche für Teams, Projekte oder Abteilungen; jeder Space hat **eigene Berechtigungen**.
- **Pages** = einzelne Dokumente/Seiten innerhalb eines Space; können **verschachtelt** (nested sub-pages) sein.

Rollen auf Workspace-Ebene: **Owner**, **Admin**, **Member**. Auf Space-Ebene: **Viewer** (nur lesen), **Can Edit** (Seiten bearbeiten), **Full Access** (Space verwalten, Mitglieder, Berechtigungen). **Groups** erlauben gruppenweise Zuweisung von Rechten über mehrere Spaces.

### 3.2 Stärken

- **Echtzeit-Kollaboration:** Mehrere Nutzer bearbeiten dieselbe Seite gleichzeitig (wie bei Notion/Google Docs), ohne Konflikte durch paralleles Bearbeiten.
- **Blockbasierter Editor:** Übersichtliche Bearbeitung, Drag & Drop, eingebaute Blöcke (Tabellen, Code, Diagramme). Geringere Einstiegshürde für Nutzer, die mit Notion/Confluence vertraut sind.
- **Reichhaltige Inhalte:** Integration von Mermaid, Draw.io, Excalidraw; Import/Export (Markdown, HTML, ZIP; Enterprise: DOCX, Confluence).
- **Einfaches Rechte-Modell:** Space = logischer Bereich; Rechte pro Space (und optional pro Seite in der Enterprise Edition). Schnell konfigurierbar.
- **Produktreif:** Open Source (AGPL), Enterprise-Version mit SSO, LDAP, MFA, AI (Schreibunterstützung, semantische Suche), REST-API, Support. Sofort einsetzbar ohne eigene Entwicklung.

### 3.3 Ideale Einsatzszenarien

- Teams, die ein **gemeinsames Wiki** oder eine **Knowledge-Base** aufbauen wollen.
- Fokus auf **schnelle Erstellung** und **kollaboratives Arbeiten** ohne formale Freigabe-Prozesse.
- Organisationen, bei denen **Space-basierte Sichtbarkeit** ausreicht („alles in diesem Space sehen/bearbeiten“) und keine feine dokumentweise Steuerung („nur dieses eine Dokument für Abteilung X lesbar“) nötig ist.

---

## 4. DocsOps: Stärken und Modell

### 4.1 Architektur und Struktur

- **Organisationshierarchie:** Company → Department → Team; dazu **persönliche Kontexte** (Prozesse/Projekte mit Owner = User).
- **Kontexte:** Prozess, Projekt, Unterkontext (Subcontext). Jeder Kontext gehört genau einer **Owner-Unit** (Company, Department, Team oder User). Dokumente gehören **genau einem Kontext** (oder sind kontextfreie Drafts).
- **Dokumente:** Markdown-Inhalt, Tags, **explizite Zugriffsrechte** pro Dokument (Grants für User, Team, Department mit Rolle Read oder Write).
- **Rollen:** Team Lead, Department Lead, Company Lead („Scope-Lead“); **Leserechte werden nach oben vererbt**, **Schreibrechte sind lokal** (nur Lead der Owner-Unit oder expliziter Writer-Grant). Keine Quer-Vererbung zwischen parallelen Units.
- **Publishing:** Dokumente haben Status **Draft** oder **Published** (`publishedAt`). Nur **Scope-Lead** darf veröffentlichen; Änderungen an veröffentlichten Dokumenten laufen über **Pull-Request-Workflow** (DraftRequest), Merge nur durch Scope-Lead.
- **Weitere Konzepte:** Pinned pro Scope (Team/Department/Company), Trash, Archive; Catalog als übergreifende Dokumentenliste mit Filter/Suche; geplant: Kommentar-Sektion (Kommentar-Rechte = Leserechte).

Details: [Doc-Platform-Konzept](Doc-Platform-Konzept.md), [Rechtesystem](datenmodell/Rechtesystem.md), [Pseudocode Datenmodell](datenmodell/Pseudocode%20Datenmodell.md), [Versionierung](versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md).

### 4.2 Stärken

- **Organisation und Governance:** Feste Hierarchie mit klaren Lead-Rollen und Vererbungsregeln. Company Lead kann alles **lesen** (Governance), schreiben aber nur in eigenen/zugewiesenen Bereichen. Kein „ein Space = eine Rolle“, sondern abgeleitete Rechte aus Organisationsstruktur und expliziten Grants.
- **Dokument-Level-Rechte:** Pro Dokument können **Leser und Schreiber** explizit vergeben werden (User, Team, Department). Ermöglicht z. B. „nur Abteilung X darf dieses Dokument lesen“ oder „Team A und Team B haben Schreibrecht, alle anderen im Space nur Leserecht“ – ohne dafür viele Spaces oder Unter-Seiten anlegen zu müssen.
- **Kontrollierter Publikationsprozess:** Draft/Published und PR-Workflow sorgen dafür, dass Änderungen **erst nach Freigabe** (Merge durch Scope-Lead) sichtbar werden. Kein „jeder mit Edit-Recht schreibt sofort live“. Relevant für Prozessdokumentation, Richtlinien, Compliance.
- **Semantik der Kontexte:** Prozess vs. Projekt vs. Unterkontext ist in der Plattform modelliert (nicht nur „Space“). Pinned, Trash, Archive und Drafts sind **pro Scope** (Team, Department, Company, Personal) steuerbar; die Plattform „weiß“, wer Lead in welchem Scope ist.
- **Markdown als Kerndaten:** Einfacher zu migrieren, mit externen Tools (Pandoc, Git, CI) nutzbar; keine Bindung an einen speziellen Block-Editor. Versionierung als Snapshots (Full-Version bei Publish und bei Merge).

### 4.3 Ideale Einsatzszenarien

- Interne Dokumentation mit **klarer Organisationsstruktur** (Firma, Abteilung, Team) und Anforderung an **Governance** („Company Lead soll alles lesen können, aber nicht überall schreiben“).
- **Differenzierte Sichtbarkeit:** Verschiedene Leser/Schreiber pro Dokument im gleichen Kontext; Dokumente, die nur für bestimmte Teams oder Abteilungen sichtbar sein sollen.
- **Freigabe vor Veröffentlichung:** Änderungen sollen erst nach Review (PR/Merge) live gehen; Nachvollziehbarkeit, wer was wann freigegeben hat.
- **Prozess- und Projekt-Dokumentation** mit klarer Trennung (Process vs. Project) und Nutzung von Trash/Archive/Pinned pro Scope.

---

## 5. Gegenüberstellung nach Aspekten

### 5.1 Editor und Kollaboration

| Aspekt                    | Docmost                                             | DocsOps                                                       |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Editor                    | Blockbasiert (TipTap), Rich-Text-Blöcke             | Markdown, durchgehender Text (Textarea/Editor)                |
| Gleichzeitige Bearbeitung | Echtzeit-Kollaboration (mehrere Nutzer, eine Seite) | Klassisch: ein Nutzer bearbeitet; PR für veröffentlichte Docs |
| Konflikte                 | Durch Echtzeit-Sync minimiert                       | Durch Draft/PR und Merge durch eine Person gesteuert          |
| Ziel                      | Schnelles, gemeinsames Erstellen                    | Kontrollierte Freigabe und klare Verantwortung (Scope-Lead)   |

### 5.2 Rechte und Sichtbarkeit

| Aspekt               | Docmost                                                    | DocsOps                                                                                       |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Granularität         | Primär Space-Level; Enterprise: Page-Level                 | Pro **Dokument**: Leser/Schreiber (User, Team, Department)                                    |
| Organisationsrolle   | Workspace-Rollen (Owner, Admin, Member); Space-Permissions | **Hierarchie** Company/Department/Team mit **Leads**; Leserecht nach oben, Schreibrecht lokal |
| Abgeleitete Rechte   | Group-Zugehörigkeit, Space-Zugang                          | canRead/canWrite aus Owner-Unit, Lead-Rolle, Grants                                           |
| Persönliche Bereiche | Über Spaces abbildbar                                      | Explizit: Kontexte mit Owner = User (ownerUserId); standardmäßig privat                       |

### 5.3 Publishing und Versionierung

| Aspekt                                | Docmost                                                      | DocsOps                                                           |
| ------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Veröffentlichung                      | Seiten in Spaces sichtbar nach Space-Zugang; Version History | **Draft vs. Published**; nur Scope-Lead setzt publishedAt         |
| Änderungen an veröffentlichtem Inhalt | Direkt bearbeitbar (mit Edit-Recht) oder Version History     | **PR-Workflow**: Draft einreichen, **Merge nur durch Scope-Lead** |
| Versionen                             | Version History (typisch pro Seite)                          | Snapshots bei Publish und bei Merge; Full-Version pro Version     |

### 5.4 Struktur und Semantik

| Aspekt                   | Docmost                         | DocsOps                                                                                               |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Oberbegriffe             | Workspace, Space, Page (nested) | Company, Department, Team; Kontext (Process, Project, Subcontext); Document                           |
| Typisierung              | Space = beliebiger Container    | **Process** vs. **Project** vs. **Subcontext** explizit; unterschiedliche Lebenszyklen (z. B. Archiv) |
| Pinned / Trash / Archive | Je nach Implementierung         | **Pro Scope** (Team, Department, Company, Personal); Sichtbarkeit an Lead-Rolle geknüpft              |

---

## 6. Hat der DocsOps-Ansatz seine Berechtigung?

**Ja.** Die Berechtigung ergibt sich aus Anforderungen, die Docmost nur teilweise oder anders abdeckt.

### 6.1 Lesen nach oben, Schreiben nur lokal

- **Anforderung:** Ein Company Lead soll **alles lesen** können (Transparenz, Governance), aber **nicht überall schreiben** – Team-Dokumentation bleibt in der Verantwortung des Teams.
- **DocsOps:** Leserechte werden nach oben vererbt (Department Lead liest Team-Docs, Company Lead liest alles in der Org); Schreibrechte sind lokal (nur Lead der Owner-Unit oder expliziter Writer-Grant). Vgl. [Rechtesystem](datenmodell/Rechtesystem.md).
- **Docmost:** Space-basierte Rollen; „alles lesen, aber nicht überall schreiben“ würde bedeuten, dem Nutzer in vielen Spaces nur Viewer zu geben – möglich, aber kein natives Hierarchie-/Lead-Konzept.

### 6.2 Unterschiedliche Leser/Schreiber pro Dokument

- **Anforderung:** Im gleichen Kontext (z. B. ein Prozess) soll Dokument A von Abteilung X gelesen werden, Dokument B nur von Team Y; Schreibrecht für manche Dokumente bei Team A, für andere bei Team B.
- **DocsOps:** Dokument-Level-Grants (User, Team, Department) mit Read/Write. Pro Dokument fein steuerbar.
- **Docmost:** Rechte primär pro Space (oder pro Seite in Enterprise). Feine Steuerung „nur dieses Dokument für Abteilung X“ erfordert viele Spaces oder Page-Level-Permissions (Enterprise).

### 6.3 Änderungen erst nach Freigabe (PR/Merge)

- **Anforderung:** Änderungen an veröffentlichten Inhalten sollen **nicht sofort** live gehen, sondern **eingereicht** und von einer berechtigten Person **freigegeben** (Merge) werden.
- **DocsOps:** Draft-Request (PR) mit Merge nur durch Scope-Lead; veröffentlichte Version ändert sich erst nach Merge. Vgl. [Versionierung](versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md).
- **Docmost:** Fokus auf Echtzeit-Kollaboration; Version History für Nachvollziehbarkeit, aber kein eingebauter „Submit for approval / Merge“-Workflow.

### 6.4 Eine Quelle der Wahrheit für die Organisationsstruktur

- **Anforderung:** Die Plattform soll die **reale Organisationsstruktur** (Company, Department, Team) und **Lead-Rollen** abbilden; Sichtbarkeit von Drafts, Trash, Archive und Catalog soll daraus abgeleitet werden.
- **DocsOps:** Company/Department/Team und Leads sind Kern des Modells; Drafts/Trash/Archive/Catalog und Rechte (canRead, canWrite, canDeleteDocument, canMergeDraftRequest) leiten sich daraus ab.
- **Docmost:** Spaces und Groups bilden Bereiche und Gruppen ab; eine strikte „eine Firma, Abteilungen, Teams, Leads“-Logik mit Vererbung ist nicht das primäre Modell.

### 6.5 Fazit zur Berechtigung

- Wenn **Governance**, **dokumentweise Rechte**, **PR-Freigabe** und **klare Org-Hierarchie** zentrale Anforderungen sind, ist DocsOps **kein überflüssiges Rad**, sondern ein **bewusst anders gedrehtes Rad**: optimiert für kontrollierte, organisationsbewusste Doku mit klaren Freigabe- und Sichtbarkeitsregeln.
- Docmost ist optimiert für **einfache, kollaborative Wikis** mit schnellem Einstieg und Echtzeit-Bearbeitung. Beide Ansätze können in unterschiedlichen Kontexten die bessere Wahl sein.

---

## 7. Zusammenfassung

|                    | Docmost                                                                           | DocsOps                                                                               |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Stärke**         | Echtzeit-Kollaboration, blockbasierter Editor, einfache Space-Rechte, produktreif | Org-Hierarchie, dokumentweise Grants, Draft/PR-Workflow, Governance                   |
| **Rechte**         | Space (und ggf. Page); Groups                                                     | Dokument-Grants + Leads; Lesen nach oben, Schreiben lokal                             |
| **Publishing**     | Direkt sichtbar im Space; Version History                                         | Draft/Published; Merge durch Scope-Lead                                               |
| **Beste Wahl für** | Wikis, Knowledge-Bases, kollaboratives Schreiben ohne formale Freigabe            | Interne Doku mit Freigabe-Workflow, differenzierter Sichtbarkeit, klarer Org-Struktur |

Dieses Dokument kann bei Produktentscheidungen („Bauen wir weiter an DocsOps oder setzen wir Docmost ein?“) oder bei der Kommunikation nach außen („Warum eigenes System?“) als Referenz dienen. Bei Änderungen an Docmost oder am DocsOps-Konzept sollte der Vergleich ggf. aktualisiert werden.
