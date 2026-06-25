# DocsOps

Interne Dokumentationsplattform .

## Dokumentation

- **Konzept:** [docs/platform/](docs/platform/)
- **Umsetzungsplan:** [docs/plan/](docs/plan/)

## Voraussetzungen

- Docker (mit `docker compose`) oder Podman mit podman-compose
- Für Entwicklung: Node.js (`.nvmrc`), pnpm

## Installation

### Production (Intranet-Server)

DocsOps Production ist **für das Intranet** ausgelegt: ein Linux-Server im Firmennetz, erreichbar per **HTTP** auf Port **80** (z. B. `http://docsops.intranet` oder die Server-IP). Hostname optional per internem DNS oder `/etc/hosts`. **TLS/HTTPS** ist nicht Teil der Standard-Installation (später optional: Caddy + `SESSION_COOKIE_SECURE=1` in `/etc/docsops/docsops.env`).

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/install.sh | sudo bash
```

Das Skript des **neuesten GitHub-Releases** enthält die passende Version (Bundle + Images). **Pinning:** `…/releases/download/v0.1.0/install.sh` oder `DOCSOPS_VERSION=v0.1.0` vor `bash`.

**Root erforderlich:** Die Pipeline mit `sudo` ausführen. Das Skript lädt das Release-Bundle nach `/opt/docsops`, legt Secrets in **`/etc/docsops/docsops.env`** an und startet den Prod-Stack auf **Port 80** (Container-Images von **GHCR**, kein lokaler Build). **Keine Seed-Daten, kein Debug-Menü** – nur Admin-Zugang aus dem Install.

Updates: `sudo /opt/docsops/scripts/update.sh` (neuestes Release) oder `… update.sh vX.Y.Z` zum Pinnen (siehe [docs/install.md](docs/install.md)).

**Demo-Instanz** (öffentliche Live-Demo): zusätzlich `docker-compose.demo.yml` und `DEMO_MODE=true` – siehe [docs/install.md](docs/install.md).

Vollständige Anleitung: **[docs/install.md](docs/install.md)**.

### Entwicklung / prod-nah lokal

```bash
make up
# oder: docker compose up -d
```

App nach kurzer Startzeit unter **http://localhost:5000** (Health: http://localhost:5000/health). Konfiguration: `.env` im Repo-Root (siehe `.env.example`).

Siehe [docs/Development-Anleitung.md](docs/Development-Anleitung.md).

## Operational backup

Before configuring backup destinations in **Admin → Backup**, set `BACKUP_ENCRYPTION_KEY` (encrypts stored destination credentials at rest).

| Umgebung        | Wo setzen                                                                     |
| --------------- | ----------------------------------------------------------------------------- |
| **Development** | `.env` im Repo-Root                                                           |
| **Production**  | `/etc/docsops/docsops.env` (vom Install-Skript; Key einmal an Admin ausgeben) |

Generate a 32-byte key (base64):

```bash
openssl rand -base64 32
# or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Development: add to `.env` (use quotes if the value contains `+` or `/`):

```bash
BACKUP_ENCRYPTION_KEY="<generated-value>"
```

Restart **docsops-app** and **docsops-job-worker** after changing env (`docker compose up` or restart dev processes). With Docker Compose, variables are passed from the env file into the containers.

**Troubleshooting (Dev):** If Admin → Backup shows _Encryption not configured_ although the key is set, check quoting, file at **repo root**, and container restart. For local `make dev`, the backend loads the repo-root `.env` automatically.

**Production:** Store `BACKUP_ENCRYPTION_KEY` in a password manager in addition to `/etc/docsops/docsops.env`. See [docs/install.md](docs/install.md).

If you lose this key, existing destinations cannot be decrypted. The key is **not** included in backup archives. See [Runbook-Backup-Restore](docs/plan/Runbook-Backup-Restore.md).

## Entwicklung

Siehe [docs/Development-Anleitung.md](docs/Development-Anleitung.md).
