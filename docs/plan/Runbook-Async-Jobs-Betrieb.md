# Runbook: Async Jobs Betrieb

Dieses Runbook beschreibt das operative Vorgehen bei Problemen mit Queue/Worker in DocsOps.

## 1. Schnelldiagnose

1. Health pruefen:
   - `GET /api/v1/admin/jobs/health`
2. Alert-Metriken pruefen:
   - `GET /api/v1/admin/jobs/alerts`
3. Jobliste nach `failed` filtern:
   - `GET /api/v1/admin/jobs?state=failed&limit=50&offset=0`
4. Audit-Log zu Admin-Aktionen:
   - `GET /api/v1/admin/jobs/audit?limit=50&offset=0`

## 2. Typische Signale

- **Queue-Lag**: `oldestQueuedLagSeconds` ueber Schwellwert.
- **Failed-Job-Spike**: `failedRecentCount` ueber Schwellwert.
- **Worker disconnected**: `workerConnected=false` in Health.

## 3. Sofortmassnahmen

1. Betroffene Jobtypen identifizieren (`jobName`, `payload`, `output`).
2. Offensichtliche Ursachen beheben (z. B. Storage/DB/Env).
3. Einzelne Jobs neu anstossen:
   - `POST /api/v1/admin/jobs/:jobId/retry`
4. Fehlgeleitete Jobs stoppen:
   - `POST /api/v1/admin/jobs/:jobId/cancel`
5. Failed-Batch retry (kontrolliert):
   - `POST /api/v1/admin/jobs/retry-failed` (optional mit `jobName`, `limit`)

## 4. Eskalation

- Bei **kritischem Queue-Lag** oder anhaltenden `failed`-Spitzen:
  - Incident eroefnen
  - verantwortliches Team alarmieren
  - weitere Retries nur kontrolliert ausfuehren
- Bei Queue-Ausfall liefern betroffene Endpunkte kontrolliert `503` + `Retry-After`.

## 5. Nachbereitung

- Fehlerursache dokumentieren (Root Cause).
- Schwellwerte bei Bedarf anpassen:
  - `JOBS_ALERT_QUEUED_LAG_SECONDS`
  - `JOBS_ALERT_FAILED_RECENT_COUNT`
  - `JOBS_ALERT_FAILED_RECENT_WINDOW_MINUTES`
- Falls noetig dauerhafte Fixes in Handlern/Infra einplanen.

## 6. Lasttest (Worker/Queue-Lag)

- Backend-Skript:
  - `pnpm --filter backend run loadtest:jobs`
- Konfigurierbare Umgebungsvariablen:
  - `JOB_LOADTEST_COUNT`
  - `JOB_LOADTEST_CONCURRENCY`
  - `JOB_LOADTEST_TIMEOUT_MS`
  - `JOB_LOADTEST_TASK`
