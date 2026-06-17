# Runbook: Operational Backup & Restore

Manual restore procedure for DocsOps **operational** backups (§25). Automated restore UI is planned for Phase 2 (Admin → Backup).

**Not for platform migration:** Import of a **platform export** (`docsops-platform-export-*.tar.zst`, logical domain format) is a separate feature — see [Plan-Betrieb §4](Plan-Betrieb-Releases-Backup-Update.md) and Umsetzungs-Todo §27. Do not use `pg_restore` on a platform export archive.

## Prerequisites

- Backup archive (`docsops-backup-*.tar.zst`) from Admin → Backup or external destination
- `.env` / secrets **not** in the backup – restore session secret and credentials separately
- `postgresql-client` (`pg_restore`, `pg_dump`) and `zstd`, `tar` on the host
- Stack stopped or in maintenance (no writes during restore)

## Verify archive

```bash
mkdir -p /tmp/docsops-restore && cd /tmp/docsops-restore
zstd -d -c /path/to/docsops-backup-XXXX.tar.zst | tar -xf -
cat manifest.json
```

Check `backupFormatVersion`, `postgres.sha256`, and `minio` section.

## Restore PostgreSQL

```bash
# Stop DocsOps app and job worker first (container names default to docsops-app, docsops-job-worker)
docker compose stop app docsops-job-worker

zstd -d -c /path/to/archive.tar.zst | tar -xf - postgres/dump.custom
pg_restore --clean --if-exists --dbname="$DATABASE_URL" postgres/dump.custom
```

Use a maintenance window; `--clean` drops existing objects before restore.

## Restore MinIO objects

Extract `minio/objects/` from the archive and upload keys back into the configured bucket (same key paths as in the DB). With `mc`:

```bash
mc alias set local http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc cp --recursive minio/objects/ local/documents/
```

## After restore

1. Restore `.env` (especially `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY`, DB URL)
2. `docker compose up -d`
3. Verify `/ready`, login, sample documents and attachments
4. Optional: trigger `search.reindex.full` from Admin → Scheduler

## Testing restore

On a **non-production** stack, run through this runbook once after the first successful backup to validate the archive format.

## Scheduled backups

1. **Admin → Backup:** Default external destination setzen; optional **Enable automatic backups** (legt Scheduler-Eintrag an).
2. **Admin → Scheduler:** Job **Disaster recovery backup** (`maintenance.backup`) – Cron und Zeitzone feinjustieren.

Die Historie im Backup-Tab aktualisiert sich automatisch (Polling), solange der Tab offen ist.
