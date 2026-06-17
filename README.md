# DocsOps

Interne Dokumentationsplattform .

## Dokumentation

- **Konzept:** [docs/platform/](docs/platform/)
- **Umsetzungsplan:** [docs/plan/](docs/plan/)

## Voraussetzungen

- Docker (mit `docker compose`) oder Podman mit podman-compose
- Für Entwicklung: Node.js (`.nvmrc`), pnpm

## Installation

```bash
./install.sh
```

Startet den Stack. App nach kurzer Startzeit unter **http://localhost:5000** (Health: http://localhost:5000/health). Optional: Vite direkt unter **http://localhost:5173** (gleiches Repo; API per Proxy zum Backend).

Manuell: `make up` oder `docker compose up -d`.

## Operational backup

Before configuring backup destinations in **Admin → Backup**, set `BACKUP_ENCRYPTION_KEY` in `.env` (encrypts stored destination credentials at rest).

Generate a 32-byte key (base64):

```bash
openssl rand -base64 32
# or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add to `.env` (use quotes if the value contains `+` or `/`):

```bash
BACKUP_ENCRYPTION_KEY="<generated-value>"
```

Restart **docsops-app** and **docsops-job-worker** after changing `.env` (`docker compose up` or restart the dev processes). With Docker Compose, the key is passed from the repo-root `.env` into the containers.

**Troubleshooting:** If Admin → Backup shows _Encryption not configured_ although the key is in `.env`, check that the value is quoted, the file is at the **repo root**, and `docsops-app` / `docsops-job-worker` were restarted. For local `make dev`, the backend loads the repo-root `.env` automatically.

If you lose this key, existing destinations cannot be decrypted. The key is **not** included in backup archives – store it separately (e.g. password manager). See [Runbook-Backup-Restore](docs/plan/Runbook-Backup-Restore.md).

## Entwicklung

Siehe [docs/Development-Anleitung.md](docs/Development-Anleitung.md).
