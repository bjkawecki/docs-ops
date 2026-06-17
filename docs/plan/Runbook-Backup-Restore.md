# Runbook: Operational Backup & Restore

Manual restore procedure for DocsOps operational backups (§25). Automated restore UI is planned for Phase 2.

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
# Stop app/docsops-job-worker containers first
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

Configure automatic backups only in **Admin → Scheduler** (job: **Operational backup**). Set **default destination** in **Admin → Backup**.
