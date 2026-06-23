#!/usr/bin/env bash
set -euo pipefail

DOCSOPS_INSTALL_DIR="${DOCSOPS_INSTALL_DIR:-/opt/docsops}"
DOCSOPS_GITHUB_REPO="${DOCSOPS_GITHUB_REPO:-bjkawecki/docs-ops}"
# Set at release bundle build time (build-bundle.sh); empty in repo checkout.
DOCSOPS_DEFAULT_RELEASE_VERSION=""

log() {
  echo "==> $*"
}

die() {
  echo "Fehler: $*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Bitte mit sudo ausführen: curl …/install.sh | sudo bash"
  fi
}

resolve_docsops_version() {
  if [[ -z "${DOCSOPS_VERSION:-}" && -n "${DOCSOPS_DEFAULT_RELEASE_VERSION}" ]]; then
    DOCSOPS_VERSION="${DOCSOPS_DEFAULT_RELEASE_VERSION}"
    export DOCSOPS_VERSION
  fi
}

assert_release_version() {
  local version="$1"
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "DOCSOPS_VERSION muss ein Release-Tag sein (z. B. v0.1.0), nicht „${version}“. Siehe https://github.com/${DOCSOPS_GITHUB_REPO}/releases"
  fi
}

parse_args() {
  INSTALL_PROD_ARGS=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --reconfigure | --install-systemd | -h | --help)
        INSTALL_PROD_ARGS+=("$1")
        shift
        ;;
      -*)
        die "Unbekanntes Argument: $1"
        ;;
      *)
        DOCSOPS_INSTALL_DIR="$1"
        export DOCSOPS_INSTALL_DIR
        shift
        ;;
    esac
  done
}

script_dir_from_source() {
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    local script_path
    script_path="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
    dirname "$script_path"
  fi
}

run_install_prod_from_dir() {
  local root="$1"
  shift
  [[ -f "${root}/scripts/install-prod.sh" ]] \
    || die "scripts/install-prod.sh nicht gefunden unter ${root}"
  export DOCSOPS_INSTALL_DIR="$root"
  if [[ -z "${DOCSOPS_VERSION:-}" && -f "${root}/VERSION" ]]; then
    DOCSOPS_VERSION="$(tr -d '[:space:]' <"${root}/VERSION")"
    export DOCSOPS_VERSION
  fi
  export DOCSOPS_INSTALL_CONFIRMED=1
  exec "${root}/scripts/install-prod.sh" "$@"
}

download_release_bundle() {
  local version="$1" dest_dir="$2"
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
  install -d "$(dirname "$dest_dir")"
  if [[ -d "$dest_dir" ]]; then
    rm -rf "${dest_dir:?}"/*
  else
    install -d "$dest_dir"
  fi
  cp -a "${extracted_root}/." "$dest_dir/"
  log "Deploy-Dateien nach ${dest_dir} entpackt"
}

main() {
  require_root
  parse_args "$@"
  resolve_docsops_version

  local bundle_root
  bundle_root="$(script_dir_from_source)"
  if [[ -n "$bundle_root" && -f "${bundle_root}/scripts/install-prod.sh" && -f "${bundle_root}/docker-compose.prod.yml" ]]; then
    run_install_prod_from_dir "$bundle_root" "${INSTALL_PROD_ARGS[@]}"
  fi

  [[ -n "${DOCSOPS_VERSION:-}" ]] \
    || die "DOCSOPS_VERSION fehlt. Release-Install: curl -fsSL https://github.com/${DOCSOPS_GITHUB_REPO}/releases/download/vX.Y.Z/install.sh | sudo bash (Version steckt im Skript). Dev/Repo: DOCSOPS_VERSION=vX.Y.Z setzen."

  download_release_bundle "$DOCSOPS_VERSION" "$DOCSOPS_INSTALL_DIR"
  run_install_prod_from_dir "$DOCSOPS_INSTALL_DIR" "${INSTALL_PROD_ARGS[@]}"
}

main "$@"
