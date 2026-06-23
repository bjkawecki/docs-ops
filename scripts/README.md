# Scripts

| Script                                                   | Purpose                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`install.sh`](../install.sh)                            | Bootstrap (`sudo`): download release bundle to `/opt/docsops`, exec `install-prod.sh` |
| [`install-prod.sh`](install-prod.sh)                     | Deps, `/etc/docsops/docsops.env`, `docker compose pull`, prod compose, health wait    |
| [`uninstall-prod.sh`](uninstall-prod.sh)                 | Stop stack, optional data/config cleanup, systemd removal                             |
| [`update.sh`](update.sh)                                 | Replace deploy bundle + `pull` + `up -d` for a new `vX.Y.Z` release                   |
| [`release/build-bundle.sh`](release/build-bundle.sh)     | Build `docsops-vX.Y.Z.tar.gz` (CI / release)                                          |
| [`check-permission-drift.sh`](check-permission-drift.sh) | CI: backend permission exports vs frontend usage                                      |

**Environment:** `DOCSOPS_VERSION` (required, `vX.Y.Z`), `DOCSOPS_IMAGE_PREFIX` (default `ghcr.io/bjkawecki`), `DOCSOPS_NON_INTERACTIVE`, `DOCSOPS_ASSUME_YES`, `DOCSOPS_INSTALL_DIR`, `DOCSOPS_EXTRA_COMPOSE_FILES` (CI: `docker-compose.ci.yml`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DOCSOPS_HOSTNAME`.

**Production install:**

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/download/v0.1.0/install.sh | sudo bash
```

**Update:** `sudo /opt/docsops/scripts/update.sh v0.2.0`

**Uninstall (remove stack and data):**

```bash
sudo /opt/docsops/scripts/uninstall-prod.sh
# or: curl -fsSL https://github.com/bjkawecki/docs-ops/releases/download/v0.1.0/uninstall.sh | sudo bash
```

Keep DB/MinIO volumes: `--keep-data`. Keep secrets file: `--keep-config`.
