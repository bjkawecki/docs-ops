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

## Zuordnungen (TeamMember, TeamLeader, Supervisor)

Zuordnungen zwischen Nutzern und Teams bzw. Abteilungen werden über eigene Endpunkte verwaltet. Alle Routen erfordern Auth (`requireAuth`); Schreibzugriffe prüfen rollenbasierte Berechtigungen.

**Routen:**

- **Team-Mitglieder:**  
  `GET /api/v1/teams/:teamId/members` – Liste (id, name), paginiert (limit/offset, Default limit=100).  
  `POST /api/v1/teams/:teamId/members` – Body `{ userId }` – User als Mitglied hinzufügen.  
  `DELETE /api/v1/teams/:teamId/members/:userId` – Mitgliedschaft entfernen.

- **Team-Leader:**  
  `GET /api/v1/teams/:teamId/leaders` – Liste (id, name), paginiert.  
  `POST /api/v1/teams/:teamId/leaders` – Body `{ userId }` – User als Leader hinzufügen.  
  `DELETE /api/v1/teams/:teamId/leaders/:userId` – Leader-Zuordnung entfernen.

- **Supervisor (Abteilung):**  
  `GET /api/v1/departments/:departmentId/supervisors` – Liste (id, name), paginiert.  
  `POST /api/v1/departments/:departmentId/supervisors` – Body `{ userId }` – User als Supervisor hinzufügen.  
  `DELETE /api/v1/departments/:departmentId/supervisors/:userId` – Supervisor-Zuordnung entfernen.

**Berechtigungsmatrix:**

- **Admin:** Darf alle Zuordnungen (TeamMember, TeamLeader, Supervisor) anlegen und entfernen.
- **Supervisor:** Darf für Teams **seiner Abteilung** TeamMember und TeamLeader anlegen/entfernen (nicht Supervisor-Zuordnungen).
- **TeamLeader:** Darf für **sein Team** nur TeamMember anlegen/entfernen.
- **Supervisor-Zuordnung** (Department ↔ User) darf nur von **Admin** verwaltet werden.

GET-Listen setzen voraus, dass das Team bzw. die Abteilung für den Nutzer sichtbar ist (Mitglied oder Leader des Teams, Supervisor der Abteilung oder Admin); sonst 403. Bei Duplikat (gleicher teamId/userId bzw. departmentId/userId) liefert POST 409 Conflict.

**Löschungen und Abhängigkeiten:** Welche Ressourcen durch Löschen von Company, Department, Team, User oder Context betroffen sind (Restrict-Regeln und Cascades) und wann die API mit 409 antwortet, ist in [Prisma-Schema-Entwurf §6](Prisma-Schema-Entwurf.md#6-löschverhalten-cascades-und-restrict) beschrieben.
