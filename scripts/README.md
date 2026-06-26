# Scripts

| Script                                                   | Purpose                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`install.sh`](../install.sh)                            | Bootstrap (`sudo`): download release bundle to `/opt/docsops`, exec `install-prod.sh` |
| [`install-prod.sh`](install-prod.sh)                     | Deps, `/etc/docsops/docsops.env`, `docker compose pull`, prod compose, health wait    |
| [`uninstall-prod.sh`](uninstall-prod.sh)                 | Stop stack, optional data/config cleanup, systemd removal                             |
| [`update.sh`](update.sh)                                 | Update via `docsops-agent` on the host (bundle, env, compose pull/up)                 |
| [`local-prod-update-test.sh`](local-prod-update-test.sh) | Local install + update test without GitHub release upload                             |
| [`release/build-bundle.sh`](release/build-bundle.sh)     | Build `docsops-vX.Y.Z.tar.gz` (CI / release)                                          |
| [`docker-image-sizes.sh`](docker-image-sizes.sh)         | Build all prod images locally and print sizes (before/after comparisons)              |
| [`check-permission-drift.sh`](check-permission-drift.sh) | CI: backend permission exports vs frontend usage                                      |

**Environment:** `DOCSOPS_VERSION` (optional for update; required for pinned install from repo checkout), `DOCSOPS_IMAGE_PREFIX` (default `ghcr.io/bjkawecki`), `DOCSOPS_BUNDLE_PATH` (local bundle tar.gz for update), `DOCSOPS_SKIP_IMAGE_PULL=1` (skip registry pull), `DOCSOPS_NON_INTERACTIVE`, `DOCSOPS_ASSUME_YES`, `DOCSOPS_INSTALL_DIR`, `DOCSOPS_EXTRA_COMPOSE_FILES` (CI: `docker-compose.ci.yml`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DOCSOPS_HOSTNAME`.

**Production install:**

```bash
curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/install.sh | sudo bash
```

Pin a release: `…/releases/download/vX.Y.Z/install.sh` or `DOCSOPS_VERSION=vX.Y.Z`.

**Update:** `sudo /opt/docsops/scripts/update.sh` (latest) or `… update.sh v0.2.0` (pinned)

**Local update test (no GitHub release):**

```bash
ADMIN_EMAIL=admin@test ADMIN_PASSWORD='your-password-12' \
  sudo -E ./scripts/local-prod-update-test.sh
```

Manual update with local bundle: `DOCSOPS_BUNDLE_PATH=/path/docsops-v0.1.1.tar.gz DOCSOPS_SKIP_IMAGE_PULL=1 sudo -E ./scripts/update.sh v0.1.1`

**Uninstall (remove stack and data):**

```bash
sudo /opt/docsops/scripts/uninstall-prod.sh
# or: curl -fsSL https://github.com/bjkawecki/docs-ops/releases/latest/download/uninstall.sh | sudo bash
```

Keep DB/MinIO volumes: `--keep-data`. Keep secrets file: `--keep-config`.
