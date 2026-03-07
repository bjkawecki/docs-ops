# DocsOps – Rechtesystem

Einheitliche Beschreibung des Rechtesystems: Konzeption (Grundprinzipien, Units, Rollen) und Rechteableitung (Implementierung canRead/canWrite).

---

## Teil I – Konzeption

### 1. Grundprinzip

Das Rechtesystem basiert auf einer hierarchischen Organisationsstruktur.

- Dokumente gehören in der Regel genau einem Kontext (Projekt, Prozess oder Unterkontext); Ausnahme: **kontextfreie Drafts** (contextId null), siehe Abschnitt 3.
- Kontexte gehören genau einer organisatorischen Einheit (Unit).

**Prinzipien:**

- **Leserechte werden nach oben vererbt.** (Member der Owner-Unit oder Lead einer übergeordneten Unit.)
- **Schreibrechte sind lokal.** (Nur Lead der Owner-Unit oder expliziter Grant.)
- **Keine Quer-Vererbung** zwischen parallelen Units.

---

### 2. Organisationsstruktur (Units)

Die Plattform kennt folgende hierarchische Units:

```
Company
└── Department
    └── Team
        └── User (persönlicher Scope)
```

**Unit:** Organisatorische Ebene mit klarer Zugehörigkeit (Parent-Unit), eigener Ownership, eigenen Lead-Rollen und eigenem Scope. Units bilden eine gerichtete Hierarchie (Baum).

---

### 3. Scope und Ownership

**Scope** beschreibt den Sicht- und Verwaltungsbereich einer Unit (Team-Scope, Department-Scope, Company-Scope, User-Scope). Kontexte (Projekte, Prozesse) existieren innerhalb eines Scopes; ein Kontext gehört genau einer Unit.

**Ownership** bedeutet organisatorische Verantwortung:

- Jeder Kontext hat genau eine Owner-Unit.
- Owner-Unit definiert Schreibrechte (Lead dieser Unit darf schreiben).
- Ownership ist eindeutig (keine Mehrfach-Owner).
- Ownership bestimmt nicht automatisch Leserechte quer.

**Persönliche Kontexte** (User-Scope): Prozesse und Projekte mit Owner = Nutzer (Owner.ownerUserId). Sie sind **standardmäßig privat**; Zugriff nur für den Besitzer oder über explizite Lese-/Schreib-Grants.

**Dokumente ohne Kontext (kontextfreie Drafts):** Ein Document kann mit `contextId = null` existieren (nur als Draft, `publishedAt = null`). Lesen und Schreiben haben ausschließlich der **Ersteller** (createdById) und Nutzer mit **explizitem Grant** auf dieses Dokument. Es gibt keinen Scope-Lead; **Veröffentlichung** ist erst nach Zuweisung eines Kontexts (PATCH contextId) möglich.

**Trash (Papierkorb):** Soft-gelöschte Dokumente (`deletedAt` gesetzt) sind nur für Nutzer sichtbar, die das Dokument löschen dürfen (canDeleteDocument). Wiederherstellen (Restore) darf derselbe Nutzerkreis. **Kontexte (Variante B):** Beim Soft-Delete eines Kontexts (Process/Project) werden alle zugehörigen Dokumente mitgelöscht (Kaskade). Restore eines Dokuments aus einem trashed Kontext = Abkoppeln (contextId = null) als kontextfreier Draft.

**Archive:** Archivierte Dokumente (`archivedAt` gesetzt) werden aus normalen Listen ausgeblendet. Archivieren/Entarchivieren (PATCH archivedAt) darf, wer Schreibrecht hat (canWrite). Kontexte (Process/Project) haben ebenfalls `archivedAt`; beim Archivieren kaskadiert der Status auf alle Dokumente des Kontexts.

**Sichtbarkeit Drafts / Trash / Archive (§4b):** Die Tabs Drafts, Trash und Archive werden angezeigt, wenn der Nutzer **Admin** oder **Scope-Lead** ist (Company Lead, Department Lead, Team Lead; Rechte gelten nach unten: Company Lead sieht die Tabs auch in Departments/Teams seiner Firma). Leser ohne Lead-Rolle sehen diese Tabs nicht. Offene Draft Requests (PRs) nur für Schreiber. GET /me/trash und GET /me/archive unterstützen die Scopes **personal**, **company**, **department** und **team**; bei fehlendem Zugriff liefern sie eine **leere Liste** (kein 403).

---

### 4. Rollen

Pro Unit (Team, Department, Company) existieren Rollen:

- **Member:** Kann innerhalb der eigenen Unit lesen; kann keine Kontexte erstellen oder verwalten.
- **Lead:** Kann Kontexte innerhalb der eigenen Unit erstellen und Dokumente im eigenen Scope bearbeiten; Schreibrechte nur im eigenen Scope.

**Company-Lead** ist eine Governance-Rolle: Leserecht auf alle Organisations-Kontexte (siehe unten), kein automatisches globales Schreibrecht.

---

### 5. Leserechte (Prinzip)

Leserechte werden nach oben vererbt.

**Regel:** Ein Nutzer darf ein Dokument lesen, wenn er Mitglied der Owner-Unit ist **oder** Lead einer übergeordneten Unit ist.

**Beispiele:**

- **Team-Dokument:** Team-Mitglieder lesen; Department-Lead liest; Company-Lead liest. Anderes Department: kein Zugriff.
- **Department-Dokument:** Department-Mitglieder lesen; Company-Lead liest.
- **Company-Dokument:** Alle Units darunter können lesen (sofern konzeptionell zugeordnet).

**Keine Quer-Vererbung:** Team A kann Team B nicht lesen.

**Persönliche Kontexte (ownerUserId):** Immer privat, sofern kein expliziter Lese-Grant. Weder Company Lead noch Department Lead erhalten automatisch Leserecht auf persönliche Prozesse/Projekte.

---

### 6. Schreibrechte (Prinzip)

Schreibrechte sind nicht vererbbar.

**Regel:** Ein Nutzer darf ein Dokument **bearbeiten** (Inhalt ändern, bei PR-Workflow auch PRs einreichen), wenn er Lead der Owner-Unit ist **oder** explizit Schreibrechte (Writer-Grant) auf diesem Dokument erhalten hat. Keine automatische Schreibvererbung nach oben oder unten. Die **direkte Übernahme in die Hauptversion (Merge)** bleibt Scope-Lead vorbehalten (siehe 6b).

**Erstellen und Löschen** (Dokumente anlegen oder löschen, Kontexte anlegen oder löschen) sind **nur** dem **Scope-Lead** (und Admin, Owner von persönlichem Prozess/Projekt via ownerUserId) vorbehalten. Ein expliziter Writer-Grant berechtigt **nicht** zum Erstellen oder Löschen.

**Beispiel:** Department-Lead kann Team-Dokument lesen, aber nicht bearbeiten (außer über expliziten Grant). Ein Nutzer mit nur Writer-Grant darf das Dokument bearbeiten, aber nicht löschen.

---

### 6a. Reader / Writer / Create-Delete

- **Reader:** Expliziter Lese-Grant (GrantRole Read). Berechtigt zum Lesen des Dokuments.
- **Writer:** Expliziter Schreib-Grant (GrantRole Write). Berechtigt zur **Bearbeitung** des Dokumentinhalts (bei PR-Workflow: PRs einreichen); **nicht** zum Anlegen, Löschen oder **Mergen** von Dokumenten/Kontexten.
- **Create/Delete:** Dokumente und Kontexte anlegen oder löschen dürfen nur **Scope-Lead** (Team Lead, Department Lead, Company Lead je nach Owner-Unit), Admin und Owner von persönlichem Prozess/Projekt (ownerUserId).

---

### 6b. Merge (PR genehmigen)

**Merge** (eine eingereichte Änderung / PR in die Hauptversion übernehmen) darf **nur Scope-Lead** (Team Lead, Department Lead, Company Lead der Owner-Unit), Admin und Owner von persönlichem Prozess/Projekt (ownerUserId). Ein **Writer-Grant** berechtigt zur **Bearbeitung** des Dokuments und zum **Einreichen von PRs**, **nicht** zum Mergen. Details zum PR-Workflow siehe [Versionierung als Snapshots + Deltas](../versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md).

---

### 7. Company-Level (Governance)

Company-Lead besitzt **Leserecht auf alle Kontexte** – mit Ausnahme von persönlichen Kontexten (Prozesse/Projekte mit ownerUserId), die standardmäßig privat sind.

- Leserecht auf alle Prozesse, Projekte und Unterkontexte (unabhängig von Owner-Unit).
- Kein automatisches globales Schreibrecht; Schreiben nur bei Company-Owner-Kontexten oder explizitem Grant.
- Governance-Rolle (Transparenz ermöglichen, Autonomie erhalten).

---

### 8. Designprinzipien und mentales Modell

1. Eindeutige Ownership
2. Leserechte nach oben
3. Keine Quer-Transparenz
4. Schreibrechte lokal
5. Company als Governance-Layer
6. Persönliche Kontexte (ownerUserId) standardmäßig privat

**Mentales Modell:** Team = operative Einheit, Department = koordinierende Einheit, Company = Governance-Ebene. Transparenz nach oben, Autonomie nach unten, keine seitlichen Leaks.

**Optional (Ausblick):** Sensible Kontexte können als „restricted“ markiert werden; dann keine automatische Lesevererbung, Zugriff nur über explizite Freigabe.

---

## Teil II – Rechteableitung (Implementierung)

Der Zugriff wird über **explizite Zuweisung** (Grants) und **abgeleitete Rollen** (isAdmin, Company Lead, Department Lead, Team Lead, Owner von persönlichem Prozess/Projekt via ownerUserId) bestimmt. Im Schema: DocumentGrantUser, DocumentGrantTeam, DocumentGrantDepartment mit `GrantRole` (Read oder Write). Technisch: Department Lead = DepartmentLead, Team Lead = TeamLead, Company Lead = CompanyLead.

### Voraussetzungen

- Nutzer mit gesetztem `deletedAt` (Soft Delete) haben keinen Zugriff.
- Die Implementierung nutzt `canRead(userId, documentId)` bzw. `canWrite(userId, documentId)` (Englisch im Code).

---

### Leserecht (canRead)

Ein Nutzer hat Leserecht auf ein Dokument, wenn eine der folgenden Bedingungen zutrifft (in dieser Reihenfolge geprüft):

1. **isAdmin:** Leserecht auf alle Dokumente (und typischerweise Schreibrecht).

2. **Company Lead:** Der Nutzer ist Company Lead einer Firma. **Zielmodell:** Leserecht auf alle Dokumente in Organisations-Kontexten (Prozesse, Projekte, Unterkontexte) – unabhängig davon, ob Owner Company, Department oder Team ist. **Kein** Leserecht auf persönliche Kontexte (Prozesse/Projekte mit ownerUserId; immer privat, sofern kein expliziter Grant).  
   _Hinweis: Aktuell prüft die Implementierung für Company Lead nur Kontexte mit Company-Owner; die Erweiterung auf alle Organisations-Kontexte ist vorgesehen._

3. **Department Lead:** Leserecht auf alle Dokumente in Kontexten, die seiner Abteilung oder einem ihrer Teams als Owner gehören (Prozesse, Projekte, Unterkontexte). Kein Leserecht auf persönliche Kontexte (ownerUserId).

4. **Owner von persönlichem Prozess/Projekt (ownerUserId):** Das Dokument gehört zu einem Prozess oder Projekt, dessen Owner der Nutzer ist (Owner.ownerUserId); dann Leserecht (und Schreibrecht).

5. **Explizite Grants:** Dokument dem Nutzer (DocumentGrantUser Read), einem seiner Teams als Mitglied (DocumentGrantTeam Read) oder seiner Abteilung (DocumentGrantDepartment Read) zugestanden.

Prüfreihenfolge: isAdmin und deletedAt → Company Lead → Department Lead → Owner persönlicher Kontext (ownerUserId) → explizite Grants.

---

### Schreibrecht (canWrite)

**canWrite** berechtigt zur **Bearbeitung** des Dokuments (z. B. PATCH). **Nicht** zum Löschen des Dokuments – dazu siehe Löschen (Dokument).

Ein Nutzer hat Schreibrecht auf ein Dokument, wenn:

1. **isAdmin:** Schreibrecht auf alle Dokumente.

2. **Owner von persönlichem Prozess/Projekt (ownerUserId):** Besitzer des Kontexts; Schreibrecht auf alle Dokumente in diesem Prozess/Projekt.

3. **Explizite Grants:** DocumentGrantUser mit Write; DocumentGrantTeam mit Write nur, wenn Nutzer **Team Lead** dieses Teams ist; DocumentGrantDepartment mit Write für Nutzer dieser Abteilung.

---

### Löschen (Dokument)

Ein Nutzer darf ein Dokument (Soft-Delete) nur löschen, wenn er **Scope-Lead** des zugehörigen Kontexts ist (bzw. isAdmin oder Owner von persönlichem Prozess/Projekt via ownerUserId). Ein **expliziter Writer-Grant** berechtigt **nicht** zum Löschen. Implementierung: `canDeleteDocument(prisma, userId, documentId)` – entspricht der Prüfung, ob der Nutzer den Kontext schreiben darf (`canWriteContext` auf den Kontext des Dokuments).

---

### Beispiel

Dokument D1 liegt im Projekt P1; Owner von P1 ist Team T1. Zugriffsrechte am Dokument: Leser T1, Schreiber T1 (nur Team Lead von T1 darf schreiben). Nutzer Z ist nur Mitglied von T1 – darf D1 lesen, nicht schreiben. Nutzer M ist Mitglied und Team Lead von T1 – darf D1 lesen und schreiben.

---

### Kontext- und Organisations-Rechte

Zusätzlich zu canRead/canWrite gelten **hierarchische Rechte** für Kontexte und die Organisationsstruktur („Lesen/schreiben“ inkl. Anlegen der Ressource):

- **Admin (isAdmin):** Darf alles. Company, Department und Team können nur von Admins angelegt und gelöscht werden.

- **Company Lead:** Darf für seine Company Prozesse und Projekte mit Company-Owner lesen, schreiben und anlegen. (Governance: Zielmodell siehe Teil I – Leserecht auf alle Organisations-Kontexte.)

- **Department Lead:** Darf für sein Department Prozesse und Projekte lesen, schreiben und anlegen. Keine Erstellung/Löschung von Companies, Departments oder Teams.

- **Team Lead:** Darf für sein Team Prozesse und Projekte lesen, schreiben und anlegen.

- **Unterkontexte:** Wer ein Projekt lesen/schreiben darf (Company Lead, Department Lead oder Team Lead je nach Owner), darf dessen Unterkontexte anlegen, bearbeiten und löschen.

### Pinned

An- und Abpinnen von Einträgen (Dokumente, Prozesse, Projekte) pro Scope (Team, Department, Company) dürfen nur **Scope-Lead** (Team Lead für Team-Scope, Department Lead für Department-Scope, Company Lead für Company-Scope) und Admin. Pins lesen (z. B. im Dashboard anzeigen) dürfen alle, die den jeweiligen Scope sehen (Team-Mitglieder sehen Team-Pins, Department-Mitglieder Department-Pins, usw.). Schema siehe [Prisma-Schema-Entwurf §7 (Pinned)](../../plan/Prisma-Schema-Entwurf.md#7-pinned-geplant).

Dokument-Erstellung (POST) prüft `canWriteContext` (nur Scope-Lead). Dokument-Löschen (DELETE) prüft `canDeleteDocument` (ebenfalls nur Scope-Lead, nicht Writer-Grant).

Die Implementierung liegt unter `apps/backend/src/permissions/` (canRead, canWrite, canDeleteDocument, canReadContext, canWriteContext, requireDocumentAccess). Dokument-Routen nutzen die Middleware `requireDocumentAccess('read'|'write')` bzw. für DELETE die Prüfung `canDeleteDocument`; Kontext-Routen prüfen canReadContext/canWriteContext (Kern-API Abschnitt 5).
