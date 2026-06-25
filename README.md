# DocsOps

Internal documentation platform.

## Documentation

- **Concept:** [docs/platform/](docs/platform/)
- **Implementation plan:** [docs/plan/](docs/plan/)

## Prerequisites

- Docker (with `docker compose`) or Podman with podman-compose
- For development: Node.js (`.nvmrc`), pnpm

## Installation

### Production (intranet server)

DocsOps production is designed for the **intranet**: a Linux server on the corporate network, reachable via **HTTP** on port **80** (e.g. `http://docsops.intranet` or the server IP). Hostname is optional via internal DNS or `/etc/hosts`. **TLS/HTTPS** is not part of the default install (optional later: Caddy + `SESSION_COOKIE_SECURE=1` in `/etc/docsops/docsops.env`).

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/install.sh | sudo bash
```

The script from the **latest GitHub release** embeds the matching version (bundle + images). **Pinning:** `…/releases/download/v0.1.0/install.sh` or `DOCSOPS_VERSION=v0.1.0` before `bash`.

**Root required:** Run the pipeline with `sudo`. The script downloads the release bundle to `/opt/docsops`, creates secrets in **`/etc/docsops/docsops.env`**, and starts the production stack on **port 80** (container images from **GHCR**, no local build). **No seed data, no debug menu** — admin access is created during install only.

Updates: `sudo /opt/docsops/scripts/update.sh` (latest release) or `… update.sh vX.Y.Z` to pin a version (see [docs/install.md](docs/install.md)).

**Demo instance** (public live demo): additionally `docker-compose.demo.yml` and `DEMO_MODE=true` — see [docs/install.md](docs/install.md).

Full guide: **[docs/install.md](docs/install.md)**.

### Development / local prod-like

```bash
make up
# or: docker compose up -d
```

After a short startup, the app is at **http://localhost:5000** (health: http://localhost:5000/health). Configuration: `.env` in the repo root (see `.env.example`).

See [docs/Development-Anleitung.md](docs/Development-Anleitung.md).

## Operational backup

Before configuring backup destinations in **Admin → Backup**, set `BACKUP_ENCRYPTION_KEY` (encrypts stored destination credentials at rest).

| Environment     | Where to set                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| **Development** | `.env` in the repo root                                                      |
| **Production**  | `/etc/docsops/docsops.env` (created by install; key shown once to the admin) |

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

**Troubleshooting (dev):** If Admin → Backup shows _Encryption not configured_ although the key is set, check quoting, file at **repo root**, and container restart. For local `make dev`, the backend loads the repo-root `.env` automatically.

**Production:** Store `BACKUP_ENCRYPTION_KEY` in a password manager in addition to `/etc/docsops/docsops.env`. See [docs/install.md](docs/install.md).

If you lose this key, existing destinations cannot be decrypted. The key is **not** included in backup archives. See [Runbook-Backup-Restore](docs/plan/Runbook-Backup-Restore.md).

## Development

See [docs/Development-Anleitung.md](docs/Development-Anleitung.md).
