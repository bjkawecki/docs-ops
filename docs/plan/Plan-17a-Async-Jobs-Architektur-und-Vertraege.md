# Plan 17a: Async Jobs - Architektur und Vertraege

**Ziel:** Phase 0 fuer §17 abschliessen: ein verbindliches Zielbild fuer Queue/Worker, API-Vertraege, Datenmodell fuer Job-Metadaten und Scheduler sowie Betriebsregeln (Health, Alerting, Graceful Degradation).

Referenz: [Umsetzungs-Todo §17](Umsetzungs-Todo.md#17-async-jobs), [Prisma-Schema-Entwurf](Prisma-Schema-Entwurf.md), [Infrastruktur und Deployment](Infrastruktur-und-Deployment.md).

---

## 1. Architekturzielbild

- **Queue-Technologie:** `pg-boss` auf bestehender PostgreSQL-Instanz.
- **Rollen-Trennung:**
  - API-Prozess beantwortet HTTP und enqueued Jobs.
  - Worker-Prozess verarbeitet Jobs asynchron (kein HTTP-Listener).
- **Skalierung:** API und Worker separat horizontal skalierbar.
- **Kein harter Start-Blocker:** API muss nicht auf Worker-Health warten; bei Queue/Worker-Problemen greifen definierte Fallbacks (siehe Abschnitt 6).

### 1.1 Vorlaeufige Jobnamen

- `documents.export.pdf`
- `search.reindex.incremental`
- `search.reindex.full`
- `notifications.send`
- `maintenance.cleanup` (Tasks u. a. `user-notifications-retention` für In-App-`user_notification`-Retention; andere Tasks können noch Stub sein)

Die Nutzersuche (Dashboard-Quick-Suche, Katalog mit Relevanzsortierung) liest den FTS-Index; `search.reindex.*`-Jobs halten ihn mit den Dokumentinhalten abgleichbar (kurze Verzögerung bis zur Verarbeitung ist aus API-Sicht akzeptabel, vgl. §18).

---

## 2. Job-Lebenszyklus und Statusmodell

**Technischer Laufzeitstatus** (UI/API):

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

**Pflicht-Metadaten pro Lauf:**

- `id`, `jobType`
- `requestedByUserId` (optional bei Systemjobs)
- `scopeRef` (z. B. company/department/team/personal, optional)
- `payload` (JSON)
- `progress` (0-100, optional)
- `attempts`, `maxAttempts`
- `errorCode`, `errorMessage` (bei failed)
- `resultRef` (z. B. MinIO-Key/Download-URL bei Export)
- `createdAt`, `startedAt`, `finishedAt`

---

## 3. API-Vertraege (Admin + Runtime)

Geplante Endpunkte unter Admin-Schutz in [apps/backend/src/routes/admin.ts](apps/backend/src/routes/admin.ts) mit Schemas in [apps/backend/src/routes/schemas/admin.ts](apps/backend/src/routes/schemas/admin.ts).

### 3.1 Job-Monitoring

- `GET /api/v1/admin/jobs`
  - Filter: `status`, `jobType`, `requestedBy`, `from`, `to`, `limit`, `offset`
- `GET /api/v1/admin/jobs/:jobId`
  - Detail inkl. attempts, Fehler, Ergebnis-Referenz
- `POST /api/v1/admin/jobs/:jobId/retry`
- `POST /api/v1/admin/jobs/:jobId/cancel`

### 3.2 Scheduler (regelmaessige Jobs per Admin)

- `GET /api/v1/admin/jobs/schedules`
- `PATCH /api/v1/admin/jobs/schedules/:scheduleId`
  - Felder: `enabled`, `cron` oder `intervalSeconds`
  - optionale Runtime-Grenzen: `maxRetries`, `concurrency`, `timeoutSeconds`
- `POST /api/v1/admin/jobs/schedules/:scheduleId/run-now`

### 3.3 Health

- `GET /api/v1/admin/jobs/health`
  - `workerConnected: boolean`
  - `lastHeartbeatAt`
  - `queueLagSeconds` (grobe Kenngroesse)
  - `failedJobsLastHour`

---

## 4. Datenmodell (Plan fuer spaetere Migration)

Zusatz zu `pg-boss`-internen Tabellen: fachliche Lesesicht fuer Admin/UI.

### 4.1 `JobRun` (eigene Tabelle)

- Zweck: stabile UI- und Audit-Sicht unabhaengig von internen Queue-Tabellen.
- Felder: Metadaten aus Abschnitt 2.
- Indizes:
  - `(jobType, createdAt)`
  - `(status, createdAt)`
  - `(requestedByUserId, createdAt)`

### 4.2 `JobSchedule` (eigene Tabelle)

- `id`, `jobType`, `enabled`
- `cron` oder `intervalSeconds`
- `payloadTemplate` (JSON, optional)
- `maxRetries`, `concurrency`, `timeoutSeconds` (optional)
- `lastRunAt`, `nextRunAt`, `lastError`
- `updatedByUserId`, `updatedAt`

### 4.3 `WorkerHeartbeat` (optional, empfohlen)

- `workerId`, `lastSeenAt`, `version`, `hostname`
- Basis fuer Statuskarte **Worker connected**.

---

## 5. UI-Vertraege

### 5.1 Admin-Ansicht `/admin/jobs`

- Bereich A: Job-Liste (Filter, Detail, Retry/Cancel)
- Bereich B: Schedules (enabled, Cron/Intervall, run-now)
- Bereich C: Health-Karte
  - Anzeige **Worker connected**
  - Queue-Lag
  - Failed Jobs (letzte Stunde)

### 5.2 Polling-Konfiguration

- Nutzerpraeferenz (pro User):
  - `pollingEnabled: boolean`
  - `pollingIntervalSeconds: 2|5|10|30`
- Leitplanken:
  - Min/Max serverseitig validieren
  - Hintergrund-Tab drosseln oder pausieren

---

## 6. Betriebsregeln und Graceful Degradation

### 6.1 Alerting

- Warnung bei `queueLagSeconds` ueber Schwellwert
- Warnung bei `failed`-Quote ueber Schwellwert
- Eskalation bei dauerhaftem Fehlerzustand (mehrere Intervalle)

### 6.2 Graceful Degradation API

- Wenn Queue temporär nicht nutzbar:
  - je Endpoint entweder `503` mit `Retry-After`
  - oder `202/200` mit Warnhinweis (`queuedWithWarning=false`/`degraded=true`)
- Keine unkontrollierten 500er fuer erwartbare Queue-Ausfaelle.

### 6.3 Graceful Degradation UI

- klare Hinweise statt harter Fehler (z. B. „Export aktuell verzoegert“)
- Aktionen ggf. deaktivieren, aber Seite benutzbar halten
- Health-Status im Admin sichtbar

---

## 7. Betroffene Stellen (Implementierung ab Phase 1)

- Backend Bootstrap: [apps/backend/src/app.ts](apps/backend/src/app.ts)
- Admin-Routen: [apps/backend/src/routes/admin.ts](apps/backend/src/routes/admin.ts)
- Admin-Schemas: [apps/backend/src/routes/schemas/admin.ts](apps/backend/src/routes/schemas/admin.ts)
- Frontend Admin-Seiten:
  - [apps/frontend/src/pages/admin/AdminPage.tsx](apps/frontend/src/pages/admin/AdminPage.tsx)
  - [apps/frontend/src/pages/admin/AdminUsersTab.tsx](apps/frontend/src/pages/admin/AdminUsersTab.tsx)
  - neue Job-Seite unter `pages/admin` (ab Phase 3)

---

## 8. Abnahme Phase 0

- Architekturzielbild beschlossen (Queue + separater Worker + no hard startup dependency).
- API-Vertraege fuer Monitoring, Scheduler und Health sind festgelegt.
- Datenmodell fuer `JobRun`/`JobSchedule`/optional `WorkerHeartbeat` spezifiziert.
- Regeln fuer Alerting und Graceful Degradation in UI/API sind dokumentiert.
