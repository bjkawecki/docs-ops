# Prisma-Schema-Entwurf

Tabellen und Spalten für `prisma/schema.prisma`, abgeleitet aus [Pseudocode Datenmodell](../platform/datenmodell/Pseudocode%20Datenmodell.md) und [Rechteableitung](../platform/datenmodell/Rechteableitung.md). Namenskonvention: Englisch; Implementierung nutzt `canRead`/`canWrite` (vgl. [projekt-kontext.mdc](../../.cursor/rules/projekt-kontext.mdc)).

**Umsetzungsstand (aktuell in `apps/backend/prisma/schema.prisma`):** Getrennte Kontext-Tabellen (Process, Project, Subcontext, UserSpace) mit **Context**-Abstraktion für Document; **Owner**-Abstraktion für Process/Project (genau einer: Department oder Team); Zugriffsrechte in drei Tabellen (DocumentGrantUser, DocumentGrantTeam, DocumentGrantDepartment) mit genau einem Grantee pro Zeile; Tags normalisiert (Tag + DocumentTag n:m); User mit email, externalId, isAdmin, deletedAt; Supervisor, TeamLeader (statt Superuser); Soft Delete (Document, Process, Project, User); Document mit optionalem pdfUrl.

---

## 1. Organisation

| Modell         | Spalten (Kern)                                     | Relationen                                                                                  |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Company**    | id, name                                           | → departments (1:n)                                                                         |
| **Department** | id, name, companyId                                | → company, teams (1:n), owners (Owner), supervisors, documentGrantDept                      |
| **Team**       | id, name, departmentId                             | → department, members (TeamMember), leaders (TeamLeader), owners (Owner), documentGrantTeam |
| **User**       | id, name, email?, externalId?, isAdmin, deletedAt? | teamMemberships, leaderOfTeams, supervisorOfDepartments, userSpaces, documentGrantUser      |

- **TeamMember:** Junction Team ↔ User (Mitgliedschaft). @@id([teamId, userId]).
- **TeamLeader:** Junction Team ↔ User (Schreibrechte als Teamleader). @@id([teamId, userId]).
- **Supervisor:** Junction Department ↔ User. Nutzer mit Leserechten auf alle Dokumente der Abteilung und ihrer Teams (Prozesse, Projekte, Unterkontexte), nicht auf Nutzerspaces. Ableitung in der App.
- **Owner:** Abstraktion für Prozess/Projekt. id, departmentId?, teamId? (in der App genau einer gesetzt). Process und Project haben ownerId → Owner.

---

## 2. Kontexte

- **Context:** Abstraktion „ein Kontext“. id; optional 1:1 zu Process, Project, Subcontext, UserSpace. Document hat contextId (Pflicht-FK) → genau ein Kontext im Schema. Löschen der Context-Zeile löscht Kontexttyp und alle Documents (Cascade).
- **Process:** id, name, contextId (unique → Context), ownerId (→ Owner), deletedAt?, createdAt, updatedAt. Immer langlebig (Konzept).
- **Project:** id, name, contextId (unique), ownerId, subcontexts (1:n), deletedAt?, createdAt, updatedAt. Immer zeitlich begrenzt (Konzept).
- **Subcontext:** id, name, contextId (unique), projectId (→ Project). Optionale Gliederung unter einem Projekt (z. B. Protokolle, Meilensteine).
- **UserSpace:** id, name, contextId (unique), ownerUserId (→ User). Persönlicher Kontext.

Owner von Process/Project ist über **Owner** (departmentId oder teamId) abgebildet; genau einer in der App validieren.

---

## 3. Dokumente

| Modell       | Spalten (Kern)                                                                  | Relationen                                                           |
| ------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Document** | id, title, content (Text), pdfUrl?, contextId, deletedAt?, createdAt, updatedAt | → context (n:1), documentTags, grantUser, grantTeam, grantDepartment |

- **pdfUrl:** Optional; URL zur PDF-Version (z. B. nach Export in MinIO/S3).
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

Implementierung der Prüflogik: `canRead(userId, documentId)` / `canWrite(userId, documentId)` wie in der [Rechteableitung](../platform/datenmodell/Rechteableitung.md); zusätzlich isAdmin (sieht alles) und Supervisor (Leserecht auf Abteilungs-Kontexte).

---

## 5. Übersicht (aktueller Stand)

- **Company** → **Department** → **Team**; **User** ↔ Team (TeamMember, TeamLeader); **Supervisor** (Department ↔ User); **Owner** (Department | Team) für Process/Project.
- **Context** (Abstraktion) mit 1:1 zu Process | Project | Subcontext | UserSpace. **Document** hat contextId (Pflicht).
- **Document:** title, content, pdfUrl?, contextId, deletedAt?; Tags über **Tag** + **DocumentTag** (n:m).
- **DocumentGrantUser**, **DocumentGrantTeam**, **DocumentGrantDepartment** für explizite Rechte (genau ein Grantee pro Zeile).

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
- **Department löschen** (wenn keine Teams/Owner mehr) → Supervisor-Zuordnungen dieser Abteilung, DocumentGrantDepartment usw. (Cascade).
- **Team löschen** (wenn kein Owner mehr) → TeamMember, TeamLeader, DocumentGrantTeam (Cascade).
- **Owner** → Process/Project (Cascade); Process/Project → Context → Documents (Cascade).
- **User löschen** (physisch) → Sessions, TeamMember, TeamLeader, Supervisor, UserSpaces, DocumentGrants (Cascade). Soft-Delete (`deletedAt`) entzieht Zugriff in der App, ohne Datensätze zu entfernen.
- **Context löschen** → Process/Project/Subcontext/UserSpace (je nach Kontexttyp) und alle Documents dieses Kontexts (Cascade).
