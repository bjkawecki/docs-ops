#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=install/lib/common.sh
source "${SCRIPT_DIR}/install/lib/common.sh"

usage() {
  cat <<EOF
Usage: update.sh [VERSION]

Update an existing DocsOps production install to a new release.

Examples:
  sudo ./scripts/update.sh
  sudo ./scripts/update.sh v0.2.0

Delegates to docsops-agent on the host (systemd). For manual recovery, ensure
docsops-agent is running and DOCSOPS_AGENT_TOKEN is set in ${DOCSOPS_ENV_FILE}.

Environment (local testing):
  DOCSOPS_BUNDLE_PATH       Path to docsops-vX.Y.Z.tar.gz (skip GitHub download)
  DOCSOPS_SKIP_IMAGE_PULL=1 Skip docker compose pull (use local images)
EOF
}

main() {
  local version="${1:-}"
  if [[ "$version" == "-h" || "$version" == "--help" ]]; then
    usage
    exit 0
  fi

  require_root
  resolve_install_dir || die "Keine Installation unter ${DOCSOPS_INSTALL_DIR} gefunden."
  [[ -f "$DOCSOPS_ENV_FILE" ]] || die "${DOCSOPS_ENV_FILE} fehlt – zuerst installieren."

  # shellcheck disable=SC1090
  set -a
  source "$DOCSOPS_ENV_FILE"
  set +a

  version="$(resolve_release_version "$version")"
  log "Ziel-Release: ${version}"

  if ! command -v docsops-agent >/dev/null 2>&1; then
    die "docsops-agent nicht gefunden. Bitte Production-Install mit Host-Agent ausführen."
  fi

  export DOCSOPS_AGENT_TOKEN="${DOCSOPS_AGENT_TOKEN:-}"
  [[ -n "$DOCSOPS_AGENT_TOKEN" ]] || die "DOCSOPS_AGENT_TOKEN fehlt in ${DOCSOPS_ENV_FILE}"

  if ! docsops-agent preflight "$version"; then
    die "Preflight für ${version} fehlgeschlagen."
  fi

  if ! docsops-agent apply "$version"; then
    die "Update auf ${version} fehlgeschlagen."
  fi

  log "Update auf ${version} abgeschlossen."
}

main "$@"
