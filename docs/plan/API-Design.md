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
- Bei Validierungsfehlern (Zod): `400` mit Details zu ungültigen Feldern (z. B. `errors: [{ path, message }]`).
- Die Umsetzung erfolgt im Backend durch einen zentralen Error-Handler (Zod, Prisma, HTTP-Status).

---

## Auth

- **Auth:** Cookie-basierte Session (Session-ID im httpOnly-Cookie; Session-Daten in Postgres). Geschützte Routen: Backend prüft Session und leitet bei fehlender oder ungültiger Auth mit `401` ab.
- Bei fehlender Berechtigung für eine Ressource: `403 Forbidden`.

---

## Pagination

- Bei Listen-Endpoints (Dokumente, Kontexte, Teams, …): Paginierung verwenden.
- **Parameter:** z. B. `limit` (Max. Anzahl pro Seite, Default z. B. 20), `cursor` (für Cursor-basiert) oder `offset` (für Offset-basiert).
- **Antwort:** Liste der Einträge plus Metadaten, z. B. `nextCursor` / `hasMore` oder `total` (optional).
- Konkrete Parameternamen und Defaults bei Implementierung festlegen (z. B. `limit=20`, `cursor` für nächste Seite).
