# API-Design

Festlegungen für die REST-API der internen Dokumentationsplattform. Siehe [Technologie-Stack](Technologie-Stack.md), [Umsetzungs-Todo](Umsetzungs-Todo.md).

---

## Basis-URL

- **Prefix:** `/api/v1` (Versionierung von Anfang an; spätere Versionen z. B. `/api/v2`).
- Alle API-Routen beginnen mit diesem Prefix (z. B. `GET /api/v1/documents`, `POST /api/v1/contexts`).

---

## Fehlerformat

- Einheitliches JSON-Format für Fehlerantworten, z. B.:
  - `{ "error": "<kurze menschenlesbare Meldung>", "code": "<optionaler Fehlercode>" }`
  - Oder RFC-7807-ähnlich (`type`, `title`, `status`, `detail`, `instance`).
- HTTP-Status-Codes nutzen: `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `409` Conflict, `500` Internal Server Error.
- **409 Conflict** wird u. a. verwendet, wenn eine Ressource nicht gelöscht werden kann, weil noch abhängige Ressourcen existieren (z. B. Firma mit Abteilungen, Abteilung mit Teams oder Prozessen/Projekten, Team mit Prozessen/Projekten). Details zum Löschverhalten siehe [Prisma-Schema-Entwurf §6](Prisma-Schema-Entwurf.md#6-löschverhalten-cascades-und-restrict).
- Bei Validierungsfehlern (Zod): `400` mit Details zu ungültigen Feldern (z. B. `errors: [{ path, message }]`).
- Die Umsetzung erfolgt im Backend durch einen zentralen Error-Handler (Zod, Prisma, HTTP-Status).

---

## Auth

- **Auth:** Cookie-basierte Session (Session-ID im httpOnly-Cookie; Session-Daten in Postgres). Geschützte Routen: Backend prüft Session und leitet bei fehlender oder ungültiger Auth mit `401` ab.
- Bei fehlender Berechtigung für eine Ressource: `403 Forbidden`.

---

## Pagination

- Bei Listen-Endpoints (Dokumente, Kontexte, Teams, …): Paginierung verwenden.
- **Parameter (einheitlich):** `limit` (Anzahl pro Seite, Default 20, Max. 100), `offset` (Startposition, Default 0). Beide als Query-Parameter (z. B. `?limit=10&offset=20`).
- **Antwort:** JSON-Objekt mit `items` (Array), `total` (Gesamtanzahl), `limit` und `offset` (übernommene Werte). Beispiel: `{ "items": [...], "total": 42, "limit": 20, "offset": 0 }`.
- Cursor-basierte Pagination kann später ergänzt werden; aktuell ist Offset-Pagination überall konsistent umgesetzt.

---

## Zuordnungen (TeamMember, Team Lead, Department Lead)

Zuordnungen zwischen Nutzern und Teams bzw. Abteilungen werden über eigene Endpunkte verwaltet. Alle Routen erfordern Auth (`requireAuth`); Schreibzugriffe prüfen rollenbasierte Berechtigungen. **Routen:**

- **Team-Mitglieder:**  
  `GET /api/v1/teams/:teamId/members` – Liste (id, name), paginiert (limit/offset, Default limit=100).  
  `POST /api/v1/teams/:teamId/members` – Body `{ userId }` – User als Mitglied hinzufügen.  
  `DELETE /api/v1/teams/:teamId/members/:userId` – Mitgliedschaft entfernen.

- **Team Lead:**
  `GET /api/v1/teams/:teamId/team-leads` – Liste (id, name), paginiert.
  `POST /api/v1/teams/:teamId/team-leads` – Body `{ userId }` – User als Team Lead hinzufügen.
  `DELETE /api/v1/teams/:teamId/team-leads/:userId` – Team-Lead-Zuordnung entfernen.

  **Invariante: Team Lead ⇒ Team-Mitglied.** Beim Setzen eines Team Leads ist zu prüfen, ob die Person bereits **TeamMember** in diesem Team ist; wenn nicht, entweder zuerst TeamMember anlegen oder die API mit **409** und Fehlermeldung „muss zuerst Mitglied sein“ (bzw. „User must be a team member before being assigned as team lead.“) ablehnen. Beim Entfernen aus dem Team: Wenn **TeamMember(teamId, userId)** gelöscht wird, muss auch **TeamLead(teamId, userId)** gelöscht werden (per Cascade im Schema oder im gleichen Handler/Transaktion).

- **Department Lead (Abteilung):**  
  `GET /api/v1/departments/:departmentId/department-leads` – Liste (id, name), paginiert.  
  `POST /api/v1/departments/:departmentId/department-leads` – Body `{ userId }` – User als Department Lead hinzufügen.  
  `DELETE /api/v1/departments/:departmentId/department-leads/:userId` – Department-Lead-Zuordnung entfernen.

**Berechtigungsmatrix:**

- **Admin:** Darf alle Zuordnungen (TeamMember, Team Lead, Department Lead) anlegen und entfernen.
- **Department Lead:** Darf für Teams **seiner Abteilung** TeamMember und Team Lead anlegen/entfernen (nicht Department-Lead-Zuordnungen).
- **Team Lead:** Darf für **sein Team** nur TeamMember anlegen/entfernen.
- **Department-Lead-Zuordnung** (Department ↔ User) darf nur von **Admin** verwaltet werden.

GET-Listen setzen voraus, dass das Team bzw. die Abteilung für den Nutzer sichtbar ist (Mitglied oder Team Lead des Teams, Department Lead der Abteilung oder Admin); sonst 403. Bei Duplikat (gleicher teamId/userId bzw. departmentId/userId) liefert POST 409 Conflict. **Company Lead** ist derzeit nicht implementiert (geplant für firmenweite Prozesse/Projekte).

**Löschungen und Abhängigkeiten:** Welche Ressourcen durch Löschen von Company, Department, Team, User oder Context betroffen sind (Restrict-Regeln und Cascades) und wann die API mit 409 antwortet, ist in [Prisma-Schema-Entwurf §6](Prisma-Schema-Entwurf.md#6-löschverhalten-cascades-und-restrict) beschrieben.

---

## Dokumente und Tags (§14)

- **Dokumente:** CRUD über `GET/POST/PATCH/DELETE /api/v1/documents` bzw. `GET /api/v1/contexts/:contextId/documents`; GET Document liefert Rechte-Flags `canWrite`, `canDelete`, `scope`. Prozess-/Projekt-GET liefert `canWriteContext`.
- **POST /documents:** Body kann **contextId** weglassen – dann wird ein **kontextfreier Draft** erstellt (nur Ersteller sichtbar); Veröffentlichung erst nach Zuweisung eines Kontexts (PATCH contextId). Mit contextId: wie bisher (canWriteContext, Tags optional).
- **PATCH /documents/:id:** **contextId** setzbar (null → Kontext, z. B. für Veröffentlichung). Veröffentlichen (Publish) nur erlaubt, wenn contextId gesetzt ist.
- **Tags:** `POST /api/v1/tags` (Body: name), `DELETE /api/v1/tags/:tagId`; 409 bei doppeltem Namen, 404 bei unbekanntem Tag. Dokumente erhalten Tag-Zuordnung über PATCH mit `tagIds` (nur bei Dokumenten mit Kontext, da Tags scope-gebunden sind).
- **New Document:** Modal nur Kontext (Process/Project) + Titel; nach POST kein Redirect – Nutzer bleibt auf der Seite, neueste Dokumente erscheinen in der Drafts-Card im Overview (vgl. Umsetzungs-Todo §14). Optional: „Draft ohne Kontext“ (nur Titel, kein Kontext).
- Umsetzungsstand: [Umsetzungs-Todo §14](Umsetzungs-Todo.md#14-dokumente-in-der-ui) (Tag-Verwaltung, Markdown-Editor, Rechte-Checks, CRUD in Kontexten umgesetzt; Drafts-Card im Overview, Drafts-Tab und DocsOps-Anleitung offen).
