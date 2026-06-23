#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=install/lib/common.sh
source "${SCRIPT_DIR}/install/lib/common.sh"

KEEP_DATA=0
KEEP_CONFIG=0
KEEP_DEPLOY_DIR=0
PURGE_IMAGES=0
REMOVE_SYSTEMD=1

usage() {
  cat <<EOF
Usage: uninstall-prod.sh [OPTIONS]

Stoppt DocsOps und entfernt Installationsspuren auf dem Server.

Standard (ohne --keep-*): Container stoppen, Docker-Volumes löschen (DB + MinIO),
/opt/docsops entfernen, /etc/docsops/docsops.env entfernen, systemd-Unit deaktivieren.

Options:
  --keep-data         Container stoppen, Volumes behalten (Daten bleiben)
  --keep-config       /etc/docsops/docsops.env behalten
  --keep-deploy-dir   /opt/docsops (Compose, Skripte) behalten
  --purge-images      GHCR/lokal gebaute docsops-Images entfernen
  --no-systemd        systemd-Unit nicht anfassen
  -h, --help          Diese Hilfe

Environment:
  DOCSOPS_NON_INTERACTIVE=1   Keine Prompts
  DOCSOPS_ASSUME_YES=1        Bestätigung überspringen (Pflicht mit NON_INTERACTIVE)
  DOCSOPS_INSTALL_DIR         Default: /opt/docsops
  DOCSOPS_ENV_FILE            Default: /etc/docsops/docsops.env

Beispiel (komplett entfernen):

  sudo /opt/docsops/scripts/uninstall-prod.sh

Oder per curl (ohne bestehendes Bundle):

  curl -fsSL https://github.com/bjkawecki/docs-ops/releases/download/v0.1.0/uninstall.sh | sudo bash
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --keep-data)
        KEEP_DATA=1
        shift
        ;;
      --keep-config)
        KEEP_CONFIG=1
        shift
        ;;
      --keep-deploy-dir)
        KEEP_DEPLOY_DIR=1
        shift
        ;;
      --purge-images)
        PURGE_IMAGES=1
        shift
        ;;
      --no-systemd)
        REMOVE_SYSTEMD=0
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

confirm_uninstall() {
  if [[ "${DOCSOPS_ASSUME_YES:-}" == "1" ]]; then
    return 0
  fi
  if [[ "${DOCSOPS_NON_INTERACTIVE:-}" == "1" ]]; then
    die "Non-interactive mode erfordert DOCSOPS_ASSUME_YES=1."
  fi
  require_interactive_tty
  echo ""
  echo "DocsOps wird deinstalliert:"
  echo "  Deploy:  ${DOCSOPS_INSTALL_DIR}$([[ "$KEEP_DEPLOY_DIR" == "1" ]] && echo " (behalten)" || echo " (löschen)")"
  echo "  Config:  ${DOCSOPS_ENV_FILE}$([[ "$KEEP_CONFIG" == "1" ]] && echo " (behalten)" || echo " (löschen)")"
  echo "  Daten:   Docker-Volumes$([[ "$KEEP_DATA" == "1" ]] && echo " (behalten)" || echo " (löschen – DB + Anhänge)")"
  [[ "$REMOVE_SYSTEMD" == "1" ]] && echo "  systemd: docsops.service deaktivieren"
  [[ "$PURGE_IMAGES" == "1" ]] && echo "  Images:  docsops-Container-Images entfernen"
  echo ""
  if [[ "$KEEP_DATA" != "1" ]]; then
    echo "WARNUNG: Ohne --keep-data sind alle Dokumente und Benutzer in der Datenbank unwiderruflich weg."
    echo ""
  fi
  read_tty -p "Fortfahren? Tippe „yes“ zum Bestätigen: " reply
  [[ "$reply" == "yes" ]] || cancel_install
}

remove_systemd_unit() {
  [[ "$REMOVE_SYSTEMD" == "1" ]] || return 0
  if systemctl list-unit-files docsops.service 2>/dev/null | grep -q docsops.service; then
    log "Stoppe und deaktiviere docsops.service …"
    systemctl disable --now docsops.service 2>/dev/null || true
  fi
  if [[ -f /etc/systemd/system/docsops.service ]]; then
    rm -f /etc/systemd/system/docsops.service
    systemctl daemon-reload
    log "systemd-Unit entfernt"
  fi
}

compose_down_from_install_dir() {
  local install_dir="$DOCSOPS_INSTALL_DIR"
  [[ -d "$install_dir" ]] || return 1
  [[ -f "${install_dir}/docker-compose.yml" ]] || return 1

  cd "$install_dir"
  load_compose_project_name_from_env_file

  if [[ -f "$DOCSOPS_ENV_FILE" && -f "${install_dir}/docker-compose.prod.yml" ]]; then
    DOCSOPS_COMPOSE_FILES="docker-compose.yml:docker-compose.prod.yml"
    compose_stack_setup
    if [[ "$KEEP_DATA" == "1" ]]; then
      compose_stack_cmd down
    else
      compose_stack_cmd down -v
    fi
    return 0
  fi

  log "Compose ohne Production-Env – stoppe mit docker-compose.yml (+ override falls vorhanden) …"
  local files=(-f docker-compose.yml)
  [[ -f docker-compose.override.yml ]] && files+=(-f docker-compose.override.yml)
  if [[ "$KEEP_DATA" == "1" ]]; then
    docker compose "${files[@]}" down
  else
    docker compose "${files[@]}" down -v
  fi
}

stop_orphan_docsops_containers() {
  local ids
  ids="$(docker ps -aq --filter 'name=docsops' 2>/dev/null || true)"
  [[ -n "$ids" ]] || return 0
  log "Entferne verbleibende docsops-Container …"
  docker rm -f $ids 2>/dev/null || true
}

remove_project_volumes() {
  [[ "$KEEP_DATA" == "1" ]] && return 0
  load_compose_project_name_from_env_file
  local vol prefix="${COMPOSE_PROJECT_NAME}_"
  while read -r vol; do
    [[ -z "$vol" ]] && continue
    if [[ "$vol" == "${prefix}"* ]] || [[ "$vol" == *docsops* ]]; then
      log "Entferne Volume ${vol} …"
      docker volume rm "$vol" 2>/dev/null || true
    fi
  done < <(docker volume ls -q 2>/dev/null || true)
}

purge_docsops_images() {
  [[ "$PURGE_IMAGES" == "1" ]] || return 0
  local ids
  ids="$(docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' 2>/dev/null \
    | awk '/docsops/ {print $2}' | sort -u | tr '\n' ' ' || true)"
  [[ -n "${ids// /}" ]] || return 0
  log "Entferne docsops-Images …"
  # shellcheck disable=SC2086
  docker rmi -f $ids 2>/dev/null || true
}

remove_paths() {
  if [[ "$KEEP_DEPLOY_DIR" != "1" && -d "$DOCSOPS_INSTALL_DIR" ]]; then
    log "Entferne ${DOCSOPS_INSTALL_DIR} …"
    rm -rf "${DOCSOPS_INSTALL_DIR:?}"/*
    rmdir "$DOCSOPS_INSTALL_DIR" 2>/dev/null || true
  fi
  if [[ "$KEEP_CONFIG" != "1" && -d "$(dirname "$DOCSOPS_ENV_FILE")" ]]; then
    if [[ -f "$DOCSOPS_ENV_FILE" ]]; then
      log "Entferne ${DOCSOPS_ENV_FILE} …"
      rm -f "$DOCSOPS_ENV_FILE"
    fi
    rmdir "$(dirname "$DOCSOPS_ENV_FILE")" 2>/dev/null || true
  fi
}

print_finish() {
  echo ""
  log "Deinstallation abgeschlossen."
  if [[ "$KEEP_DATA" == "1" ]]; then
    echo "Daten-Volumes wurden behalten. Für Neuinstallation ggf. --keep-data weglassen oder Volumes manuell löschen."
  fi
  if [[ "$KEEP_CONFIG" != "1" ]]; then
    echo "Neuinstallation: curl -fsSL https://github.com/${DOCSOPS_GITHUB_REPO}/releases/download/vX.Y.Z/install.sh | sudo bash"
  fi
}

main() {
  require_root
  parse_args "$@"
  confirm_uninstall

  if ! command -v docker >/dev/null 2>&1; then
    log "Docker nicht installiert – überspringe Container-Schritte."
  else
    remove_systemd_unit
    if compose_down_from_install_dir; then
      :
    else
      log "Kein Compose-Stack unter ${DOCSOPS_INSTALL_DIR} – suche verwaiste Container …"
      stop_orphan_docsops_containers
      remove_project_volumes
    fi
    stop_orphan_docsops_containers
    purge_docsops_images
  fi

  remove_paths
  print_finish
}

main "$@"
