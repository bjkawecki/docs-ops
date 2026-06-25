#!/usr/bin/env bash
# Report local Docker image sizes for DocsOps production images.
# Usage: ./scripts/docker-image-sizes.sh [tag-suffix]
# Example: ./scripts/docker-image-sizes.sh measure
set -euo pipefail

TAG_SUFFIX="${1:-measure}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

build_one() {
  local name="$1"
  shift
  echo "==> Building ${name}:${TAG_SUFFIX} …"
  docker build "$@" -t "${name}:${TAG_SUFFIX}" .
}

build_one docsops-app -f apps/backend/Dockerfile --target app
build_one docsops-migrate -f apps/backend/Dockerfile --target migrate
build_one docsops-worker -f apps/backend/Dockerfile --target worker
build_one docsops-frontend -f apps/frontend/Dockerfile
build_one docsops-updater -f docker/Dockerfile.updater

echo ""
echo "Image sizes (${TAG_SUFFIX}):"
docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' \
  | rg "docsops-(app|migrate|worker|frontend|updater)\s+${TAG_SUFFIX}"
