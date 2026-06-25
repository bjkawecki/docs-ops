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

Without VERSION, uses the latest GitHub release. Pass a tag to pin a specific version.

Downloads the release bundle, replaces deploy files under ${DOCSOPS_INSTALL_DIR},
updates DOCSOPS_VERSION in ${DOCSOPS_ENV_FILE}, then runs docker compose pull && up -d.

Rollback: restore a backup of ${DOCSOPS_ENV_FILE} and the previous bundle tarball,
then re-run update.sh with the previous version tag.
EOF
}

download_release_bundle_to_install_dir() {
  local version="$1"
  local bundle_url tmpdir extracted_root item
  assert_release_version "$version"
  bundle_url="https://github.com/${DOCSOPS_GITHUB_REPO}/releases/download/${version}/docsops-${version}.tar.gz"
  log "Lade Release-Bundle ${version} …"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN
  curl -fsSL "$bundle_url" -o "${tmpdir}/bundle.tar.gz"
  tar -xzf "${tmpdir}/bundle.tar.gz" -C "$tmpdir"
  extracted_root=""
  for item in "$tmpdir"/*; do
    [[ -e "$item" ]] || continue
    [[ "$(basename "$item")" == "bundle.tar.gz" ]] && continue
    if [[ -f "${item}/scripts/install-prod.sh" ]]; then
      extracted_root="$item"
      break
    fi
  done
  [[ -n "$extracted_root" ]] || die "Ungültiges Release-Bundle (scripts/install-prod.sh fehlt)."
  rm -rf "${DOCSOPS_INSTALL_DIR:?}"/*
  cp -a "${extracted_root}/." "$DOCSOPS_INSTALL_DIR/"
  log "Deploy-Dateien unter ${DOCSOPS_INSTALL_DIR} aktualisiert"
}

main() {
  local version="${1:-}"
  if [[ "$version" == "-h" || "$version" == "--help" ]]; then
    usage
    exit 0
  fi

  require_root
  export DOCSOPS_INSTALL_STAGE_TOTAL=3
  INSTALL_STAGE_N=0
  resolve_install_dir || die "Keine Installation unter ${DOCSOPS_INSTALL_DIR} gefunden."
  [[ -f "$DOCSOPS_ENV_FILE" ]] || die "${DOCSOPS_ENV_FILE} fehlt – zuerst installieren."

  version="$(resolve_release_version "$version")"
  log "Ziel-Release: ${version}"

  download_release_bundle_to_install_dir "$version"
  patch_env_version "$version"
  load_existing_env_optional

  install_stage "Container-Images aktualisieren"
  compose_up_prod

  install_stage "Bereitschaft prüfen"
  wait_for_health

  install_stage "Abschluss"
  log "Update auf ${version} abgeschlossen."
}

main "$@"
