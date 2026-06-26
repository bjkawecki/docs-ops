#!/usr/bin/env bash
# Build docsops-vX.Y.Z.tar.gz deploy bundle (no monorepo sources).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-${ROOT}/dist}"
VERSION="${DOCSOPS_VERSION:-}"
AGENT_BINARY="${DOCSOPS_AGENT_BINARY:-${ROOT}/dist/docsops-agent}"

if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('${ROOT}/package.json').version")"
  VERSION="v${VERSION}"
fi

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION must be a release tag (vX.Y.Z), got: ${VERSION}" >&2
  exit 1
fi

if [[ ! -f "$AGENT_BINARY" ]]; then
  echo "Agent binary missing: ${AGENT_BINARY} (set DOCSOPS_AGENT_BINARY or build with go build)" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

BUNDLE_ROOT="${STAGE}/docsops-${VERSION}"
install -d "$BUNDLE_ROOT/scripts/install/lib" "$BUNDLE_ROOT/bin" "$BUNDLE_ROOT/systemd" "$OUT_DIR"

copy_file() {
  local src="$1" dest="$2"
  [[ -f "$src" ]] || { echo "Missing: $src" >&2; exit 1; }
  install -D "$src" "$dest"
}

stamp_install_sh() {
  local src="$1" dest="$2" version="$3"
  copy_file "$src" "$dest"
  sed -i "s/^DOCSOPS_DEFAULT_RELEASE_VERSION=\"\"/DOCSOPS_DEFAULT_RELEASE_VERSION=\"${version}\"/" "$dest"
}

copy_file "${ROOT}/docker-compose.yml" "${BUNDLE_ROOT}/docker-compose.yml"
copy_file "${ROOT}/docker-compose.prod.yml" "${BUNDLE_ROOT}/docker-compose.prod.yml"
copy_file "${ROOT}/Caddyfile.prod" "${BUNDLE_ROOT}/Caddyfile.prod"
stamp_install_sh "${ROOT}/install.sh" "${BUNDLE_ROOT}/install.sh" "$VERSION"
copy_file "${ROOT}/uninstall.sh" "${BUNDLE_ROOT}/uninstall.sh"
copy_file "${ROOT}/scripts/install-prod.sh" "${BUNDLE_ROOT}/scripts/install-prod.sh"
copy_file "${ROOT}/scripts/uninstall-prod.sh" "${BUNDLE_ROOT}/scripts/uninstall-prod.sh"
copy_file "${ROOT}/scripts/install/lib/common.sh" "${BUNDLE_ROOT}/scripts/install/lib/common.sh"
copy_file "${ROOT}/scripts/update.sh" "${BUNDLE_ROOT}/scripts/update.sh"
copy_file "${ROOT}/docker-compose.ci.yml" "${BUNDLE_ROOT}/docker-compose.ci.yml"
install -m 755 "$AGENT_BINARY" "${BUNDLE_ROOT}/bin/docsops-agent"
copy_file "${ROOT}/systemd/docsops-agent.service" "${BUNDLE_ROOT}/systemd/docsops-agent.service"
echo "$VERSION" >"${BUNDLE_ROOT}/VERSION"
chmod +x "${BUNDLE_ROOT}/install.sh" "${BUNDLE_ROOT}/uninstall.sh" \
  "${BUNDLE_ROOT}/scripts/install-prod.sh" "${BUNDLE_ROOT}/scripts/uninstall-prod.sh" \
  "${BUNDLE_ROOT}/scripts/update.sh"

ARCHIVE="${OUT_DIR}/docsops-${VERSION}.tar.gz"
tar -C "$STAGE" -czf "$ARCHIVE" "docsops-${VERSION}"
cp "${BUNDLE_ROOT}/install.sh" "${OUT_DIR}/install.sh"
copy_file "${ROOT}/uninstall.sh" "${OUT_DIR}/uninstall.sh"
echo "Created ${ARCHIVE}"
