#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=install/lib/common.sh
source "${SCRIPT_DIR}/install/lib/common.sh"

RECONFIGURE=0
INSTALL_SYSTEMD=0

usage() {
  cat <<EOF
Usage: install-prod.sh [OPTIONS]

Production install (run via install.sh or from repo checkout with sudo).

Options:
  --reconfigure       /etc/docsops/docsops.env neu schreiben (Secrets neu!)
  --install-systemd   systemd-Unit docsops.service registrieren
  -h, --help          Diese Hilfe

Environment:
  DOCSOPS_NON_INTERACTIVE=1   Keine Prompts (ADMIN_EMAIL/PASSWORD Pflicht)
  DOCSOPS_ASSUME_YES=1        Disclaimer-Bestätigung überspringen
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

  while [[ -z "${ADMIN_EMAIL:-}" ]]; do
    read -r -p "Admin E-Mail: " ADMIN_EMAIL
    ADMIN_EMAIL="$(echo "$ADMIN_EMAIL" | tr -d '[:space:]')"
  done

  while true; do
    read -r -s -p "Admin Passwort (min. 12 Zeichen): " ADMIN_PASSWORD
    echo ""
    if [[ "${#ADMIN_PASSWORD}" -ge 12 ]]; then
      break
    fi
    echo "Passwort zu kurz (mindestens 12 Zeichen)."
  done

  if [[ -z "${DOCSOPS_HOSTNAME:-}" ]]; then
    read -r -p "Hostname optional (z. B. docsops.intranet, leer = nur IP): " DOCSOPS_HOSTNAME
  fi

  export ADMIN_EMAIL ADMIN_PASSWORD DOCSOPS_HOSTNAME
}

main() {
  parse_args "$@"
  require_root

  if [[ ! -f "${DOCSOPS_INSTALL_DIR}/docker-compose.prod.yml" ]]; then
    die "docker-compose.prod.yml nicht gefunden unter ${DOCSOPS_INSTALL_DIR}"
  fi

  print_security_notice
  confirm_or_exit

  ensure_docker_compose
  prompt_admin_credentials

  if [[ -f "$DOCSOPS_ENV_FILE" && "$RECONFIGURE" != "1" ]]; then
    die "Installation bereits vorhanden (${DOCSOPS_ENV_FILE}). Für neue Secrets: --reconfigure. Stack manuell: siehe docs/install.md"
  fi

  if [[ "$RECONFIGURE" == "1" ]] || [[ ! -f "$DOCSOPS_ENV_FILE" ]]; then
    export DOCSOPS_RECONFIGURE=1
    write_env_file
  fi

  compose_up_prod
  wait_for_health

  if [[ "$INSTALL_SYSTEMD" == "1" || "${DOCSOPS_INSTALL_SYSTEMD:-}" == "1" ]]; then
    install_systemd_unit
  fi

  print_finish
}

main "$@"
