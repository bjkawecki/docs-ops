# Prisma-Schema-Entwurf

Tabellen und Spalten für `prisma/schema.prisma`, abgeleitet aus [Pseudocode Datenmodell](../platform/datenmodell/Pseudocode%20Datenmodell.md) und [Rechtesystem](../platform/datenmodell/Rechtesystem.md). Namenskonvention: Englisch; Implementierung nutzt `canRead`/`canWrite` (vgl. [projekt-kontext.mdc](../../.cursor/rules/projekt-kontext.mdc)).

**Umsetzungsstand (aktuell in `apps/backend/prisma/schema.prisma`):** Getrennte Kontext-Tabellen (Process, Project, Subcontext) mit **Context**-Abstraktion für Document; **Owner**-Abstraktion für Process/Project (genau einer: Company, Department, Team oder User via ownerUserId); Zugriffsrechte in drei Tabellen (DocumentGrantUser, DocumentGrantTeam, DocumentGrantDepartment) mit genau einem Grantee pro Zeile; Tags normalisiert (Tag + DocumentTag n:m); User mit email, externalId, isAdmin, deletedAt; Rollenbezeichnungen: **Company Lead**, **Department Lead**, **Team Lead**; Soft Delete (Document, Process, Project, User); Document mit optionalem pdfUrl. **Pinned:** DocumentPinnedInScope (nur Dokumente, pro Scope ein Pin pro Dokument; siehe §7).

---

## 1. Organisation

| Modell         | Spalten (Kern)                                     | Relationen                                                                                  |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Company**    | id, name                                           | → departments (1:n)                                                                         |
| **Department** | id, name, companyId                                | → company, teams (1:n), owners (Owner), supervisors, documentGrantDept                      |
| **Team**       | id, name, departmentId                             | → department, members (TeamMember), leaders (TeamLeader), owners (Owner), documentGrantTeam |
| **User**       | id, name, email?, externalId?, isAdmin, deletedAt? | teamMemberships, leaderOfTeams, supervisorOfDepartments, userSpaces, documentGrantUser      |

- **TeamMember:** Junction Team ↔ User (Mitgliedschaft). @@id([teamId, userId]).
- **TeamLeader** (Rolle: Team Lead): Junction Team ↔ User. Schreibrechte für Team-Kontexte. @@id([teamId, userId]).
- **Supervisor** (Rolle: Department Lead): Junction Department ↔ User. Nutzer mit Leserechten auf alle Dokumente der Abteilung und ihrer Teams (Prozesse, Projekte, Unterkontexte), nicht auf persönliche Kontexte (ownerUserId). Ableitung in der App.
- **Owner:** Abstraktion für Prozess/Projekt. id, companyId?, departmentId?, teamId?, ownerUserId? (in der App genau einer gesetzt). Process und Project haben ownerId → Owner.

---

## 2. Kontexte

- **Context:** Abstraktion „ein Kontext“. id; optional 1:1 zu Process, Project, Subcontext. Document hat contextId (optional, siehe §3). Löschen der Context-Zeile löscht Kontexttyp und alle Documents mit diesem contextId (Cascade). **Document kann optional ohne Kontext existieren** (contextId null); nur als Draft (publishedAt null), Rechte über createdById und Grants (vgl. §3).
- **Process:** id, name, contextId (unique → Context), ownerId (→ Owner), deletedAt?, createdAt, updatedAt. Immer langlebig (Konzept).
- **Project:** id, name, contextId (unique), ownerId, subcontexts (1:n), deletedAt?, createdAt, updatedAt. Immer zeitlich begrenzt (Konzept).
- **Subcontext:** id, name, contextId (unique), projectId (→ Project). Optionale Gliederung unter einem Projekt (z. B. Protokolle, Meilensteine).

Owner von Process/Project ist über **Owner** (companyId, departmentId, teamId oder ownerUserId) abgebildet; genau einer in der App validieren. Persönliche Kontexte: Owner mit ownerUserId (→ User).

---

## 3. Dokumente

| Modell       | Spalten (Kern)                                                                                | Relationen                                                                     |
| ------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Document** | id, title, content (Text), pdfUrl?, contextId?, deletedAt?, archivedAt?, createdAt, updatedAt | → context (n:1, optional), documentTags, grantUser, grantTeam, grantDepartment |

- **contextId:** Optional (String?). Bei null: kontextfreier Draft; nur Ersteller (createdById) und explizite Grants haben Zugriff; Veröffentlichung erst nach Zuweisung eines Kontexts (PATCH contextId).
- **archivedAt:** Optional (DateTime?). Archivierte Dokumente erscheinen nicht in Catalog und normalen Listen; nur in der Archive-Ansicht (Tab auf Personal/Company). Lesbar und per PATCH entarchivierbar (archivedAt = null). Rechte: Archivieren/Entarchivieren wie Bearbeitung (canWrite).
- **pdfUrl:** Optional; URL zur PDF-Version (z. B. nach Export in MinIO/S3).
- **Geplante Erweiterung (noch nicht in `schema.prisma`):** Dokument-Status **draft** vs. **published**. **Festgelegt:** Feld **publishedAt** (DateTime?, null = Draft). **Sichtbarkeit:** Draft nur für Nutzer mit Schreibrecht auf das Dokument sowie Scope-Lead des Kontexts; Published für alle mit Leserecht. **Veröffentlichen:** Nur Scope-Lead (Team/Department/Company Lead der Owner-Unit, Owner bei persönlichen Kontexten, Admin) darf publishedAt setzen. Umsetzung in einer späteren Migration (vgl. Umsetzungs-Todo §15, [Versionierung](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md)).
- **Tag:** id, name (unique). Global, n:m zu Document über **DocumentTag** (documentId, tagId), @@id([documentId, tagId]).

---

## 4. Zugriffsrechte (Leser/Schreiber)

Pro Zeile genau ein Grantee (Schema), keine polymorphe granteeType/granteeId:

| Modell                      | Spalten                        | Bedeutung                |
| --------------------------- | ------------------------------ | ------------------------ |
| **DocumentGrantUser**       | documentId, userId, role       | Recht für einen User     |
| **DocumentGrantTeam**       | documentId, teamId, role       | Recht für ein Team       |
| **DocumentGrantDepartment** | documentId, departmentId, role | Recht für eine Abteilung |

- **GrantRole:** Enum Read | Write.
- Composite-PK jeweils (documentId, granteeId, role); Indizes auf documentId und Grantee-Id für Abfragen.

Implementierung der Prüflogik: `canRead(userId, documentId)` / `canWrite(userId, documentId)` wie im [Rechtesystem](../platform/datenmodell/Rechtesystem.md); zusätzlich isAdmin (sieht alles) und Department Lead / Company Lead (Leserecht auf Abteilungs- bzw. Company-Kontexte).

---

## 5. Übersicht (aktueller Stand)

- **Company** → **Department** → **Team**; **User** ↔ Team (TeamMember, Team Lead/TeamLeader); **Department Lead** (Supervisor, Department ↔ User); **Owner** (Department | Team) für Process/Project.
- **Context** (Abstraktion) mit 1:1 zu Process | Project | Subcontext. **Document** hat contextId optional (null = kontextfreier Draft).
- **Document:** title, content, pdfUrl?, contextId?, deletedAt?, archivedAt?; Tags über **Tag** + **DocumentTag** (n:m).
- **DocumentGrantUser**, **DocumentGrantTeam**, **DocumentGrantDepartment** für explizite Rechte (genau ein Grantee pro Zeile).
- **Umgesetzt:** Pinned (§7) – DocumentPinnedInScope, nur Dokumente.
- **Geplant (noch nicht umgesetzt):** Document-Status draft/published (§3), Versionierung & PR (§8).

Schema liegt in `apps/backend/prisma/schema.prisma`; Migrationen unter `apps/backend/prisma/migrations/`.

---

## 6. Löschverhalten (Cascades und Restrict)

Das Schema nutzt **Restrict** für die Organisations- und Owner-Hierarchie, damit Parent-Ressourcen nur gelöscht werden können, wenn keine abhängigen Kinder mehr existieren. Alle übrigen Abhängigkeiten verwenden **Cascade**.

**Restrict-Regeln (Löschen blockiert, solange Kinder existieren):**

- **Company:** Löschen nur möglich, wenn **keine** Departments existieren (FK Department → Company: `onDelete: Restrict`).
- **Department:** Löschen nur möglich, wenn **keine** Teams und **keine** Owner mit dieser departmentId existieren (Team → Department und Owner → Department: `onDelete: Restrict`).
- **Team:** Löschen nur möglich, wenn **kein** Owner mit diesem teamId existiert (Owner → Team: `onDelete: Restrict`).

**API-Verhalten:** DELETE Company/Department/Team antwortet mit **409 Conflict**, wenn die DB das Löschen wegen Restrict verweigert (Fehlerformat: `{ "error": "<Meldung>", "code": "P2003" }` optional). Die Routen liefern spezifische Meldungen (z. B. „Firma kann nicht gelöscht werden, solange Abteilungen existieren.“).

**Cascade (bei tatsächlicher Löschung):**

- **Company löschen** (nach vorherigem Löschen aller Departments) → siehe Department/Team.
- **Department löschen** (wenn keine Teams/Owner mehr) → Department-Lead-Zuordnungen (Supervisor) dieser Abteilung, DocumentGrantDepartment usw. (Cascade).
- **Team löschen** (wenn kein Owner mehr) → TeamMember, TeamLeader (Team Lead), DocumentGrantTeam (Cascade).
- **Owner** → Process/Project (Cascade); Process/Project → Context → Documents (Cascade).
- **User löschen** (physisch) → Sessions, TeamMember, TeamLeader, Supervisor (Department Lead), Owner mit ownerUserId (ownedContexts), DocumentGrants (Cascade). Soft-Delete (`deletedAt`) entzieht Zugriff in der App, ohne Datensätze zu entfernen.
- **Context löschen** → Process/Project/Subcontext (je nach Kontexttyp) und alle Documents dieses Kontexts (Cascade).

---

## 7. Pinned (umgesetzt)

Angepinnte **Dokumente** pro Scope (Team, Department, Company) für Dashboard und Scope-Seiten. Modell: „Document ist in Liste von Scopes gepinnt“ (Relation am Document). **Nur Dokumente** – keine Prozesse oder Projekte. Implementierung in `schema.prisma`: **DocumentPinnedInScope**, Enum **PinnedScopeType**.

**Modell DocumentPinnedInScope:**

| Spalte     | Typ      | Bedeutung                                                                |
| ---------- | -------- | ------------------------------------------------------------------------ |
| id         | String   | PK (cuid)                                                                |
| documentId | String   | FK → Document, onDelete: Cascade                                         |
| scopeType  | Enum     | PinnedScopeType: team \| department \| company                           |
| scopeId    | String   | teamId, departmentId oder companyId (keine FK; eine Company im System)   |
| order      | Int      | Sortierung (default 0)                                                   |
| pinnedById | String?  | userId (optional; Berechtigung hängt an Rolle Scope-Lead, nicht am User) |
| createdAt  | DateTime | Zeitpunkt des Anpinnens                                                  |

- **Eindeutigkeit:** `@@unique([scopeType, scopeId, documentId])` – pro Scope und Dokument höchstens ein Pin.
- **Relationen:** document → Document; pinnedBy → User? (optional). Document hat `pinnedInScopes DocumentPinnedInScope[]`, User hat `pinnedDocumentScopes DocumentPinnedInScope[]`.
- **Rechte:** An- und Abpinnen nur **Scope-Lead** (und Admin); Lesen: alle, die den Scope sehen. Details siehe [Rechtesystem – Pinned](../platform/datenmodell/Rechtesystem.md#pinned).

**Cascade und API-Verhalten:**

- **User löschen** → `pinnedById` auf **SetNull** (Pins bleiben; Zuordnung zum Scope, nicht zum User).
- **Document löschen** (physisch oder Soft-Delete) → DocumentPinnedInScope-Einträge für dieses Dokument in der API vorher per `deleteMany` entfernen (bei Soft-Delete: vor dem Setzen von `deletedAt`). Keine Pins auf soft-deleted Docs.
- **Scope-Unit löschen** (Team/Department/Company): In den DELETE-Handlern `DocumentPinnedInScope.deleteMany({ where: { scopeType, scopeId } })` ausführen – Pins für diesen Scope entfallen.

---

## 8. Versionierung & PR (geplant)

Snapshots nur bei Veröffentlichung und bei Merge; Pull-Request-Workflow für Dokumente. Noch nicht in `schema.prisma` umgesetzt. Konzept siehe [Versionierung als Snapshots + Deltas](../platform/versionierung/Versionierung%20als%20Snapshots%20+%20Deltas.md) und [Rechtesystem 6b](../platform/datenmodell/Rechtesystem.md#6b-merge-pr-genehmigen).

**Vorschlag Tabellen (konzeptionell):**

- **Document:** Zusätzlich **publishedAt** (DateTime?, null = Draft) und **currentPublishedVersionId** (→ DocumentVersion?, optional), Verweis auf die aktuell veröffentlichte Version.
- **DocumentVersion (Snapshot, Full-Version):** id, documentId (→ Document), **content** (Text, vollständiger Inhalt dieser Version), versionNumber (oder aus Reihenfolge ableitbar), createdAt, createdBy (userId), optional parentVersionId (→ DocumentVersion) für Versionenkette. Ein Snapshot wird **nur** bei Veröffentlichung (erste Version) und bei Merge eines PRs erzeugt – nicht beim Speichern eines Drafts. **Full-Version:** Jede Version speichert den vollständigen Inhalt; optional Policy „nur letzte N Versionen behalten“.
- **DraftRequest (Pull Request):** id, documentId, **draftContent** (Text, eingereichter Inhalt), targetVersionId (→ DocumentVersion, Version gegen die der PR geht), status (open merged rejected), submittedById (userId), submittedAt, mergedAt?, mergedById?, optional comment. Merge nur durch Scope-Lead (canMergeDraftRequest analog zu Rechtesystem 6b). Beim Merge: neue DocumentVersion aus draftContent, Document.currentPublishedVersionId und Document.content aktualisieren.
- **DocumentDraft (pro User):** Pro Nutzer eine Arbeitskopie pro Dokument (für Bearbeitung an veröffentlichten Dokumenten vor dem PR). id, documentId (→ Document), userId (→ User), **content** (Text), **basedOnVersionId** (→ DocumentVersion?, optional – die Version, auf der dieser Draft basiert), updatedAt. Unique (documentId, userId). Beim Anlegen/Öffnen: basedOnVersionId = currentPublishedVersionId. **„Auf neueste Version updaten“:** Basis = Inhalt von basedOnVersionId, Theirs = aktueller veröffentlichter Inhalt, Ours = draft.content → 3-Wege-Merge; Konflikte anzeigen und lösen; danach DocumentDraft.content = Merged-Ergebnis, basedOnVersionId = currentPublishedVersionId. Beim Einreichen eines PR: DraftRequest aus DocumentDraft.content anlegen.

**Cascade:** Document löschen → DocumentVersion, DraftRequest und DocumentDraft (Cascade). User löschen → createdBy/submittedById auf null setzen oder Cascade je nach Anforderung; DocumentDraft (Cascade).
