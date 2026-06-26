#!/usr/bin/env bash
# Start a one-off update container (outside the compose stack) via the host Docker socket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=install/lib/common.sh
source "${SCRIPT_DIR}/install/lib/common.sh"

usage() {
  cat <<EOF
Usage: updater-exec-update.sh VERSION

Starts a detached Docker container that runs scripts/update.sh for VERSION.
Intended to be called from docsops-updater; the one-off survives compose up
because it is not the long-running docsops-updater service container.
EOF
}

main() {
  local version="${1:-}"
  if [[ "$version" == "-h" || "$version" == "--help" ]]; then
    usage
    exit 0
  fi

  assert_release_version "$version"
  resolve_install_dir || die "Keine Installation unter ${DOCSOPS_INSTALL_DIR} gefunden."
  [[ -f "$DOCSOPS_ENV_FILE" ]] || die "${DOCSOPS_ENV_FILE} fehlt."
  load_existing_env_optional

  local project update_run_container image health_url log_file
  project="${COMPOSE_PROJECT_NAME:-docsops}"
  update_run_container="${project}-update-run"
  image="${DOCSOPS_IMAGE_PREFIX}/docsops-updater:${DOCSOPS_VERSION}"
  log_file="${DOCSOPS_INSTALL_DIR}/.update-run.log"

  health_url="${DOCSOPS_HEALTH_URL:-http://host.docker.internal/health}"
  health_url="${health_url//127.0.0.1/host.docker.internal}"
  health_url="${health_url//localhost/host.docker.internal}"

  if docker inspect "$update_run_container" >/dev/null 2>&1; then
    local state
    state="$(docker inspect -f '{{.State.Status}}' "$update_run_container" 2>/dev/null || true)"
    if [[ "$state" == "running" ]]; then
      die "Update container ${update_run_container} is already running."
    fi
    log "Entferne beendeten Update-Container ${update_run_container} …"
    docker rm -f "$update_run_container" >/dev/null 2>&1 || true
  fi

  log "Starte Update-Container ${update_run_container} für ${version} …"
  : >"$log_file"
  docker run -d --name "$update_run_container" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${DOCSOPS_INSTALL_DIR}:/opt/docsops" \
    -v "${DOCSOPS_ENV_FILE}:${DOCSOPS_ENV_FILE}" \
    --add-host host.docker.internal:host-gateway \
    -e "DOCSOPS_INSTALL_DIR=${DOCSOPS_INSTALL_DIR}" \
    -e "DOCSOPS_ENV_FILE=${DOCSOPS_ENV_FILE}" \
    -e "DOCSOPS_HEALTH_URL=${health_url}" \
    "$image" \
    bash -c 'set -o pipefail; /opt/docsops/scripts/update.sh "$1" 2>&1 | tee -a /opt/docsops/.update-run.log; exit "${PIPESTATUS[0]}"' \
    _ "$version"

  echo "$update_run_container"
}

main "$@"
