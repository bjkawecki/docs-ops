#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=install/lib/common.sh
source "${SCRIPT_DIR}/install/lib/common.sh"

RECONFIGURE=0
INSTALL_SYSTEMD=0

usage() {
  cat <<EOF
Usage: install-prod.sh [OPTIONS]

Production install (run via install.sh or from repo checkout with sudo).

Target environment: intranet Linux server, HTTP on port 80 by default (not public internet).

Options:
  --reconfigure       /etc/docsops/docsops.env neu schreiben (Secrets neu!)
  --install-systemd   systemd-Unit docsops.service registrieren
  -h, --help          Diese Hilfe

Environment:
  DOCSOPS_NON_INTERACTIVE=1   Keine Prompts (ADMIN_EMAIL/PASSWORD Pflicht)
  DOCSOPS_ASSUME_YES=1        Disclaimer-Bestätigung überspringen
  DOCSOPS_INSTALL_CONFIRMED=1 Disclaimer bereits in install.sh bestätigt
  DOCSOPS_INSTALL_DIR         Default: /opt/docsops
  DOCSOPS_EXTRA_COMPOSE_FILES z. B. docker-compose.ci.yml für CI
  DOCSOPS_HEALTH_URL          Default: http://127.0.0.1/health
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --reconfigure)
        DOCSOPS_RECONFIGURE=1
        RECONFIGURE=1
        shift
        ;;
      --install-systemd)
        INSTALL_SYSTEMD=1
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

prompt_admin_credentials() {
  if [[ "${DOCSOPS_NON_INTERACTIVE:-}" == "1" ]]; then
    [[ -n "${ADMIN_EMAIL:-}" ]] || die "ADMIN_EMAIL ist in non-interactive mode Pflicht."
    [[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD ist in non-interactive mode Pflicht."
    return 0
  fi

  require_interactive_tty

  while [[ -z "${ADMIN_EMAIL:-}" ]]; do
    read_tty -p "Admin E-Mail: " ADMIN_EMAIL
    ADMIN_EMAIL="$(echo "$ADMIN_EMAIL" | tr -d '[:space:]')"
  done

  while true; do
    read_tty -s -p "Admin Passwort (min. 6 Zeichen): " ADMIN_PASSWORD
    echo ""
    if [[ "${#ADMIN_PASSWORD}" -ge 6 ]]; then
      break
    fi
    echo "Passwort zu kurz (mindestens 6 Zeichen)."
  done

  if [[ -z "${DOCSOPS_HOSTNAME:-}" ]]; then
    read_tty -p "Hostname optional (z. B. docsops.intranet, leer = nur IP): " DOCSOPS_HOSTNAME
  fi

  export ADMIN_EMAIL ADMIN_PASSWORD DOCSOPS_HOSTNAME
}

load_existing_env() {
  [[ -f "$DOCSOPS_ENV_FILE" ]] || return 1
  # shellcheck disable=SC1090
  set -a
  source "$DOCSOPS_ENV_FILE"
  set +a
  export ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  export DOCSOPS_HOSTNAME="${DOCSOPS_HOSTNAME:-}"
}

main() {
  parse_args "$@"
  require_root

  resolve_install_dir "$(cd "${SCRIPT_DIR}/.." && pwd)" \
    || die "docker-compose.prod.yml nicht gefunden unter ${DOCSOPS_INSTALL_DIR} (DOCSOPS_INSTALL_DIR setzen oder aus Repo-Checkout starten)"

  local stage_total=5
  if [[ "${DOCSOPS_INSTALL_CONFIRMED:-}" != "1" ]]; then
    stage_total=$((stage_total + 1))
  fi
  if [[ "$INSTALL_SYSTEMD" == "1" || "${DOCSOPS_INSTALL_SYSTEMD:-}" == "1" ]]; then
    stage_total=$((stage_total + 1))
  fi
  export DOCSOPS_INSTALL_STAGE_TOTAL=$stage_total
  INSTALL_STAGE_N=0

  if [[ "${DOCSOPS_INSTALL_CONFIRMED:-}" != "1" ]]; then
    install_stage "Sicherheitshinweis"
    print_security_notice
    confirm_or_exit
  fi

  install_stage "Voraussetzungen prüfen"
  ensure_docker_compose
  require_publish_port_free

  install_stage "Konfiguration"
  if [[ -f "$DOCSOPS_ENV_FILE" && "$RECONFIGURE" != "1" ]]; then
    log "Bestehende Konfiguration (${DOCSOPS_ENV_FILE}) – Repository-Stand wird angewendet …"
    load_existing_env || die "Konfiguration konnte nicht gelesen werden: ${DOCSOPS_ENV_FILE}"
  else
    prompt_admin_credentials
    export DOCSOPS_RECONFIGURE=1
    write_env_file
  fi

  install_stage "Docker-Stack bereitstellen"
  compose_up_prod

  install_stage "Bereitschaft prüfen"
  wait_for_health

  if [[ "$INSTALL_SYSTEMD" == "1" || "${DOCSOPS_INSTALL_SYSTEMD:-}" == "1" ]]; then
    install_stage "systemd einrichten"
    install_systemd_unit
  fi

  install_stage "Abschluss"
  print_finish
}

main "$@"
