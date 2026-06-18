# Scripts

## Production install

| Script                                           | Role                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [`install.sh`](../install.sh)                    | Bootstrap (`sudo`): security notice, clone to `/opt/docsops`, exec `install-prod.sh` |
| [`install-prod.sh`](install-prod.sh)             | Deps, `/etc/docsops/docsops.env`, prod compose, health wait                          |
| [`install/lib/common.sh`](install/lib/common.sh) | Shared helpers                                                                       |

See [docs/install.md](../docs/install.md).

**Environment:** `DOCSOPS_NON_INTERACTIVE`, `DOCSOPS_ASSUME_YES`, `DOCSOPS_INSTALL_DIR`, `DOCSOPS_VERSION`, `DOCSOPS_EXTRA_COMPOSE_FILES` (CI: `docker-compose.ci.yml`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DOCSOPS_HOSTNAME`.

**Flags:** `--reconfigure`, `--install-systemd`, `--help`.

## Update (planned)

- `scripts/update.sh` – see Umsetzungs-Todo §26.

## Development

- `make up`, `make infra`, backend helpers under `apps/backend/scripts/`.
