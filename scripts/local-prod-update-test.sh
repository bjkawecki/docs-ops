#!/usr/bin/env bash
# Local production install + update test without uploading a GitHub release.
# Builds bundles and images locally, installs to a temp dir, runs update.sh with
# DOCSOPS_BUNDLE_PATH and DOCSOPS_SKIP_IMAGE_PULL.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=install/lib/common.sh
source "${ROOT}/scripts/install/lib/common.sh"

FROM_VERSION="${DOCSOPS_FROM_VERSION:-v0.1.0}"
TO_VERSION="${DOCSOPS_TO_VERSION:-v0.1.1}"
INSTALL_DIR="${DOCSOPS_INSTALL_DIR:-/tmp/docsops-local}"
ENV_FILE="${DOCSOPS_ENV_FILE:-${INSTALL_DIR}/docsops.env}"
PROJECT="${COMPOSE_PROJECT_NAME:-docsops-local}"
IMAGE_PREFIX="${DOCSOPS_IMAGE_PREFIX:-ghcr.io/bjkawecki}"
BUNDLE_DIR="${DOCSOPS_BUNDLE_DIR:-/tmp/docsops-bundles}"
BUILD_TAG="${DOCSOPS_LOCAL_BUILD_TAG:-local-prod-test}"
SKIP_BUILD=0
INSTALL_ONLY=0
UPDATE_ONLY=0

usage() {
  cat <<EOF
Usage: local-prod-update-test.sh [OPTIONS]

Build local prod bundles + images, install ${FROM_VERSION}, update to ${TO_VERSION}
without GitHub/GHCR. Requires sudo for install/update steps.

Options:
  --from VERSION     Installed version (default: ${FROM_VERSION})
  --to VERSION       Target update version (default: ${TO_VERSION})
  --install-dir DIR  Deploy root (default: ${INSTALL_DIR})
  --env-file PATH    Env file (default: ${ENV_FILE})
  --bundle-dir DIR   Bundle output dir (default: ${BUNDLE_DIR})
  --skip-build       Reuse existing bundles/images in ${BUNDLE_DIR}
  --install-only     Install only, skip update step
  --update-only      Skip install/build; run update only (stack must exist)
  -h, --help         Show this help

Environment:
  DOCSOPS_IMAGE_PREFIX   Image namespace (default: ${IMAGE_PREFIX})
  DOCSOPS_LOCAL_BUILD_TAG  Docker build tag before retagging (default: ${BUILD_TAG})
  ADMIN_EMAIL / ADMIN_PASSWORD  Required for non-interactive install

Example:
  ADMIN_EMAIL=admin@test ADMIN_PASSWORD='secret-12chars' \\
    sudo -E ./scripts/local-prod-update-test.sh
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from)
        FROM_VERSION="$2"
        shift 2
        ;;
      --to)
        TO_VERSION="$2"
        shift 2
        ;;
      --install-dir)
        INSTALL_DIR="$2"
        ENV_FILE="${INSTALL_DIR}/docsops.env"
        shift 2
        ;;
      --env-file)
        ENV_FILE="$2"
        shift 2
        ;;
      --bundle-dir)
        BUNDLE_DIR="$2"
        shift 2
        ;;
      --skip-build)
        SKIP_BUILD=1
        shift
        ;;
      --install-only)
        INSTALL_ONLY=1
        shift
        ;;
      --update-only)
        UPDATE_ONLY=1
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "Unbekanntes Argument: $1"
        ;;
    esac
  done
}

build_agent_binary() {
  local out="${ROOT}/dist/docsops-agent"
  if [[ "$SKIP_BUILD" == "1" && -x "$out" ]]; then
    log "Agent-Binary vorhanden: ${out}"
    return 0
  fi
  if ! command -v go >/dev/null 2>&1; then
    die "go nicht gefunden – für local-prod-update-test installieren oder --skip-build mit vorhandenem dist/docsops-agent"
  fi
  log "Baue docsops-agent …"
  mkdir -p "${ROOT}/dist"
  (cd "${ROOT}/apps/agent" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "$out" ./cmd/docsops-agent)
}

build_bundles() {
  local version archive
  build_agent_binary
  export DOCSOPS_AGENT_BINARY="${ROOT}/dist/docsops-agent"
  mkdir -p "$BUNDLE_DIR"
  for version in "$FROM_VERSION" "$TO_VERSION"; do
    archive="${BUNDLE_DIR}/docsops-${version}.tar.gz"
    if [[ "$SKIP_BUILD" == "1" && -f "$archive" ]]; then
      log "Bundle vorhanden: ${archive}"
      continue
    fi
    log "Baue Bundle ${version} …"
    DOCSOPS_VERSION="$version" "${ROOT}/scripts/release/build-bundle.sh" "$BUNDLE_DIR"
  done
}

build_and_tag_images() {
  local version svc archive
  if [[ "$SKIP_BUILD" == "1" ]]; then
    log "Überspringe Image-Build (--skip-build)."
    return 0
  fi
  log "Baue Production-Images (Tag ${BUILD_TAG}) …"
  "${ROOT}/scripts/docker-image-sizes.sh" "$BUILD_TAG"
  for version in "$FROM_VERSION" "$TO_VERSION"; do
    for svc in app migrate worker frontend; do
      docker tag "docsops-${svc}:${BUILD_TAG}" "${IMAGE_PREFIX}/docsops-${svc}:${version}"
    done
  done
  log "Images getaggt als ${IMAGE_PREFIX}/docsops-*:{${FROM_VERSION},${TO_VERSION}}"
}

run_install() {
  local archive="${BUNDLE_DIR}/docsops-${FROM_VERSION}.tar.gz"
  [[ -f "$archive" ]] || die "Bundle fehlt: ${archive}"
  log "Installiere ${FROM_VERSION} nach ${INSTALL_DIR} …"
  export DOCSOPS_INSTALL_DIR="$INSTALL_DIR"
  export DOCSOPS_ENV_FILE="$ENV_FILE"
  mkdir -p "$INSTALL_DIR"
  extract_bundle_archive_to_install_dir "$archive"
  DOCSOPS_INSTALL_DIR="$INSTALL_DIR" \
    DOCSOPS_ENV_FILE="$ENV_FILE" \
    DOCSOPS_VERSION="$FROM_VERSION" \
    COMPOSE_PROJECT_NAME="$PROJECT" \
    DOCSOPS_SKIP_IMAGE_PULL=1 \
    DOCSOPS_NON_INTERACTIVE=1 \
    DOCSOPS_ASSUME_YES=1 \
    DOCSOPS_INSTALL_CONFIRMED=1 \
    DOCSOPS_USE_EXISTING_CONFIG=0 \
    DOCSOPS_EXTRA_COMPOSE_FILES=docker-compose.ci.yml \
    DOCSOPS_HEALTH_URL=http://127.0.0.1:8080/health \
    DOCSOPS_IMAGE_PREFIX="$IMAGE_PREFIX" \
    "${INSTALL_DIR}/scripts/install-prod.sh"
}

run_update() {
  local archive="${BUNDLE_DIR}/docsops-${TO_VERSION}.tar.gz"
  [[ -f "$archive" ]] || die "Bundle fehlt: ${archive}"
  log "Update ${FROM_VERSION} → ${TO_VERSION} …"
  DOCSOPS_INSTALL_DIR="$INSTALL_DIR" \
    DOCSOPS_ENV_FILE="$ENV_FILE" \
    COMPOSE_PROJECT_NAME="$PROJECT" \
    DOCSOPS_BUNDLE_PATH="$archive" \
    DOCSOPS_SKIP_IMAGE_PULL=1 \
    DOCSOPS_EXTRA_COMPOSE_FILES=docker-compose.ci.yml \
    DOCSOPS_HEALTH_URL=http://127.0.0.1:8080/health \
    DOCSOPS_IMAGE_PREFIX="$IMAGE_PREFIX" \
    "${INSTALL_DIR}/scripts/update.sh" "$TO_VERSION"
}

main() {
  parse_args "$@"

  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Bitte mit sudo ausführen: sudo -E $0 $*"
  fi

  assert_release_version "$FROM_VERSION"
  assert_release_version "$TO_VERSION"

  if [[ "$UPDATE_ONLY" == "1" ]]; then
    run_update
    log "Update-Test abgeschlossen. Health: ${DOCSOPS_HEALTH_URL:-http://127.0.0.1:8080/health}"
    exit 0
  fi

  build_bundles
  build_and_tag_images
  run_install

  if [[ "$INSTALL_ONLY" == "1" ]]; then
    log "Install abgeschlossen (ohne Update). Health: http://127.0.0.1:8080/health"
    exit 0
  fi

  run_update
  log "Local prod update test abgeschlossen."
  log "Install: ${INSTALL_DIR}  Env: ${ENV_FILE}  Project: ${PROJECT}"
  log "Health: http://127.0.0.1:8080/health"
}

main "$@"
