#!/usr/bin/env bash
set -euo pipefail

DOCSOPS_INSTALL_DIR="${DOCSOPS_INSTALL_DIR:-/opt/docsops}"
DOCSOPS_REPO="${DOCSOPS_REPO:-https://github.com/bjkawecki/docs-ops.git}"
DOCSOPS_VERSION="${DOCSOPS_VERSION:-main}"

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Fehler: Bitte mit sudo ausführen: sudo $0" >&2
    exit 1
  fi
}

run_from_repo() {
  if [[ -f "${SCRIPT_DIR}/docker-compose.prod.yml" && -f "${SCRIPT_DIR}/scripts/install-prod.sh" ]]; then
    export DOCSOPS_INSTALL_DIR="$SCRIPT_DIR"
    exec "${SCRIPT_DIR}/scripts/install-prod.sh" "$@"
  fi
}

clone_or_update() {
  if [[ -d "${DOCSOPS_INSTALL_DIR}/.git" ]]; then
    echo "==> Bestehendes Repository unter ${DOCSOPS_INSTALL_DIR} – git fetch"
    git -C "$DOCSOPS_INSTALL_DIR" fetch --depth 1 origin "$DOCSOPS_VERSION" 2>/dev/null \
      || git -C "$DOCSOPS_INSTALL_DIR" fetch origin
    git -C "$DOCSOPS_INSTALL_DIR" checkout "$DOCSOPS_VERSION"
    git -C "$DOCSOPS_INSTALL_DIR" pull --ff-only 2>/dev/null || true
  else
    echo "==> Klone ${DOCSOPS_REPO} (${DOCSOPS_VERSION}) nach ${DOCSOPS_INSTALL_DIR}"
    install -d "$(dirname "$DOCSOPS_INSTALL_DIR")"
    git clone --depth 1 --branch "$DOCSOPS_VERSION" "$DOCSOPS_REPO" "$DOCSOPS_INSTALL_DIR"
  fi
}

main() {
  require_root
  run_from_repo "$@"
  clone_or_update
  export DOCSOPS_INSTALL_DIR
  exec "${DOCSOPS_INSTALL_DIR}/scripts/install-prod.sh" "$@"
}

main "$@"
