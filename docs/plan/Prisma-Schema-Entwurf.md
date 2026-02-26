# Prisma-Schema-Entwurf

Tabellen und Spalten für die spätere `prisma/schema.prisma`, abgeleitet aus [Pseudocode Datenmodell](../platform/datenmodell/Pseudocode%20Datenmodell.md) und [Rechteableitung](../platform/datenmodell/Rechteableitung%20Pseudocode.md). Namenskonvention: Englisch; Implementierung nutzt `canRead`/`canWrite` (vgl. [projekt-kontext.mdc](../../.cursor/rules/projekt-kontext.mdc)).

---

## 1. Organisation

| Tabelle        | Spalten (Kern)         | Relationen                                                                         |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| **Company**    | id, name               | → departments (1:n)                                                                |
| **Department** | id, name, companyId    | → teams (1:n), → processes (1:n)                                                   |
| **Team**       | id, name, departmentId | → members (n:m User), → superusers (n:m User), → projects (1:n), → processes (1:n) |
| **User**       | id, name, …            | → teams (n:m), → superuserOfTeams (n:m)                                            |

- **TeamMember:** Junction Team ↔ User (Mitgliedschaft).
- **TeamSuperuser:** Junction Team ↔ User (Schreibrechte als Superuser/Manager).
- User ↔ Department: über Team-Zugehörigkeit ableitbar; optional eigene Tabelle oder View, falls Abteilungszugriff explizit abgefragt wird.

---

## 2. Kontexte

Owner ist entweder Department, Team oder User (genau einer). Option: polymorphe Tabelle **Context** mit `type` (enum: Process, Project, Subcontext, Nutzerspace) und optionalen FKs `ownerDepartmentId`, `ownerTeamId`, `ownerUserId` (exakt einer gesetzt). Oder getrennte Tabellen pro Typ.

| Logisches Modell | Tabellen-Variante A (polymorph)                                              | Variante B (getrennt)                                        |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Kontext (Basis)  | **Context** (id, name, type, ownerDepartmentId?, ownerTeamId?, ownerUserId?) | —                                                            |
| Prozess          | type = Process, ggf. `isLongLived: bool`                                     | **Process** (id, name, owner…, isLongLived)                  |
| Projekt          | type = Project, ggf. `isTimeLimited: bool`                                   | **Project** (id, name, owner…, isTimeLimited), → subcontexts |
| Unterkontext     | type = Subcontext, parentContextId                                           | **Subcontext** (id, name, projectId)                         |
| Nutzerspace      | type = Nutzerspace, ownerUserId                                              | **UserSpace** (id, name, ownerUserId)                        |

- **Subcontext** gehört zu einem **Project** (parentProjectId).
- Dokumente hängen an einem Kontext: **Document.contextId** (FK auf Context bzw. auf die gewählte Kontext-Tabelle).

---

## 3. Dokumente

| Tabelle      | Spalten (Kern)                                                      | Relationen                              |
| ------------ | ------------------------------------------------------------------- | --------------------------------------- |
| **Document** | id, title, contextId, content (Text/Markdown), createdAt, updatedAt | → context (n:1), → tags (n:m oder JSON) |

- **Tags:** Entweder JSON-Spalte `tags: String[]` (Prisma Json) oder Tabelle **Tag** + **DocumentTag** (n:m).
- **content:** Markdown-Inhalt als Text in der DB (Suche, Transaktionen); große Binärdateien/Anhänge in MinIO, Referenz optional in Document oder eigene Tabelle.

---

## 4. Zugriffsrechte (Leser/Schreiber)

Rechte pro Dokument: n:m zwischen Document und User/Team/Department mit Rolle (read/write).

**Variante A – zwei Junction-Tabellen:**

- **DocumentReader:** (documentId, granteeType: enum User | Team | Department, granteeId) – Leserecht.
- **DocumentWriter:** (documentId, granteeType, granteeId) – Schreibrecht.

**Variante B – eine Tabelle mit Rolle:**

- **DocumentGrant:** (documentId, granteeType, granteeId, role: enum Read | Write).

Implementierung der Prüflogik: `canRead(userId, documentId)` / `canWrite(userId, documentId)` wie im [Rechteableitung-Pseudocode](../platform/datenmodell/Rechteableitung%20Pseudocode.md); Abfrage über User → Teams/Superuser-Teams, dann Prüfung gegen DocumentReader/DocumentWriter (bzw. DocumentGrant).

---

## 5. Übersicht (minimal)

- **Company** → **Department** → **Team**; **User** ↔ Team (Member, Superuser).
- **Context** (oder Process, Project, Subcontext, UserSpace) mit Owner (Department | Team | User); **Subcontext** nur bei Project.
- **Document** (title, content, contextId, tags).
- **DocumentReader** / **DocumentWriter** (oder **DocumentGrant**) für explizite Rechte.

Dieses Dokument dient als Vorlage für die spätere `prisma/schema.prisma` (Umsetzungs-Todo Abschnitt 2).
