#!/usr/bin/env bash
set -e

# Prüfung: Docker oder Podman mit Compose
COMPOSE_CMD=""
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v podman &>/dev/null && command -v podman-compose &>/dev/null; then
  COMPOSE_CMD="podman-compose"
else
  echo "Bitte Docker (mit 'docker compose') oder Podman mit podman-compose installieren."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml nicht gefunden. Bitte im Repo-Root ausführen."
  exit 1
fi

echo "Starte Stack mit: $COMPOSE_CMD"
$COMPOSE_CMD up -d

echo "Stack gestartet. App erreichbar unter http://localhost/health (nach kurzer Startzeit)."
