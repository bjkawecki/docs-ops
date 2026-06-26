#!/usr/bin/env bash
# Shared helpers for DocsOps production install scripts.
set -euo pipefail

DOCSOPS_ENV_FILE="${DOCSOPS_ENV_FILE:-/etc/docsops/docsops.env}"
DOCSOPS_INSTALL_DIR="${DOCSOPS_INSTALL_DIR:-/opt/docsops}"
DOCSOPS_GITHUB_REPO="${DOCSOPS_GITHUB_REPO:-bjkawecki/docs-ops}"
DOCSOPS_IMAGE_PREFIX="${DOCSOPS_IMAGE_PREFIX:-ghcr.io/bjkawecki}"
DOCSOPS_HEALTH_URL="${DOCSOPS_HEALTH_URL:-http://127.0.0.1/health}"
DOCSOPS_COMPOSE_FILES="${DOCSOPS_COMPOSE_FILES:-docker-compose.yml:docker-compose.prod.yml}"
DOCSOPS_DOCKER_COMPOSE_VERSION="${DOCSOPS_DOCKER_COMPOSE_VERSION:-v2.32.4}"
# Local update testing: path to docsops-vX.Y.Z.tar.gz instead of GitHub download.
DOCSOPS_BUNDLE_PATH="${DOCSOPS_BUNDLE_PATH:-}"
# Set to 1 to skip `docker compose pull` (use pre-tagged local images).
DOCSOPS_SKIP_IMAGE_PULL="${DOCSOPS_SKIP_IMAGE_PULL:-}"

log() {
  echo "==> $*"
}

install_stage() {
  local title="$1"
  local total="${DOCSOPS_INSTALL_STAGE_TOTAL:-?}"
  INSTALL_STAGE_N="${INSTALL_STAGE_N:-0}"
  INSTALL_STAGE_N=$((INSTALL_STAGE_N + 1))
  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Schritt ${INSTALL_STAGE_N}/${total}: ${title}"
  echo "────────────────────────────────────────────────────────"
  echo ""
}

die() {
  echo "Fehler: $*" >&2
  exit 1
}

assert_release_version() {
  local version="${1:-${DOCSOPS_VERSION:-}}"
  if [[ -z "$version" ]]; then
    die "DOCSOPS_VERSION fehlt. Production-Install nur mit Release-Tag (z. B. v0.1.0)."
  fi
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "DOCSOPS_VERSION muss ein Release-Tag sein (z. B. v0.1.0), nicht „${version}“. Siehe https://github.com/${DOCSOPS_GITHUB_REPO}/releases"
  fi
}

docsops_github_install_curl_url() {
  echo "https://github.com/${DOCSOPS_GITHUB_REPO}/releases/latest/download/install.sh"
}

docsops_github_uninstall_curl_url() {
  echo "https://github.com/${DOCSOPS_GITHUB_REPO}/releases/latest/download/uninstall.sh"
}

fetch_latest_github_release_tag() {
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${DOCSOPS_GITHUB_REPO}/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  [[ -n "$tag" ]] || die "Kein GitHub-Release ermittelbar (https://github.com/${DOCSOPS_GITHUB_REPO}/releases)."
  echo "$tag"
}

resolve_release_version() {
  local version="${1:-${DOCSOPS_VERSION:-}}"
  if [[ -n "$version" ]]; then
    echo "$version"
    return 0
  fi
  fetch_latest_github_release_tag
}

find_bundle_root_in_dir() {
  local search_dir="$1" item extracted_root=""
  for item in "$search_dir"/*; do
    [[ -e "$item" ]] || continue
    [[ "$(basename "$item")" == "bundle.tar.gz" ]] && continue
    if [[ -f "${item}/scripts/install-prod.sh" ]]; then
      extracted_root="$item"
      break
    fi
  done
  [[ -n "$extracted_root" ]] || die "Ungültiges Release-Bundle (scripts/install-prod.sh fehlt)."
  printf '%s' "$extracted_root"
}

copy_bundle_root_to_install_dir() {
  local extracted_root="$1"
  rm -rf "${DOCSOPS_INSTALL_DIR:?}"/*
  cp -a "${extracted_root}/." "$DOCSOPS_INSTALL_DIR/"
  log "Deploy-Dateien unter ${DOCSOPS_INSTALL_DIR} aktualisiert"
}

extract_bundle_archive_to_install_dir() {
  local archive_path="$1" tmpdir extracted_root
  [[ -f "$archive_path" ]] || die "Bundle nicht gefunden: ${archive_path}"
  tmpdir="$(mktemp -d)"
  tar -xzf "$archive_path" -C "$tmpdir"
  extracted_root="$(find_bundle_root_in_dir "$tmpdir")"
  copy_bundle_root_to_install_dir "$extracted_root"
  rm -rf "$tmpdir"
}

download_release_bundle_to_install_dir() {
  local version="$1" bundle_url tmpdir extracted_root
  assert_release_version "$version"
  bundle_url="https://github.com/${DOCSOPS_GITHUB_REPO}/releases/download/${version}/docsops-${version}.tar.gz"
  log "Lade Release-Bundle ${version} …"
  tmpdir="$(mktemp -d)"
  curl -fsSL "$bundle_url" -o "${tmpdir}/bundle.tar.gz"
  tar -xzf "${tmpdir}/bundle.tar.gz" -C "$tmpdir"
  extracted_root="$(find_bundle_root_in_dir "$tmpdir")"
  copy_bundle_root_to_install_dir "$extracted_root"
  rm -rf "$tmpdir"
}

install_release_bundle_to_install_dir() {
  local version="$1"
  assert_release_version "$version"
  if [[ -n "${DOCSOPS_BUNDLE_PATH:-}" ]]; then
    log "Installiere Bundle aus ${DOCSOPS_BUNDLE_PATH} (Version ${version}) …"
    extract_bundle_archive_to_install_dir "$DOCSOPS_BUNDLE_PATH"
    return 0
  fi
  download_release_bundle_to_install_dir "$version"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Bitte mit sudo ausführen: sudo $0"
  fi
}

# curl | bash: stdin is the script; prompts must read from the controlling terminal.
require_interactive_tty() {
  if [[ ! -r /dev/tty ]]; then
    die "Kein interaktives Terminal (TTY). Setze DOCSOPS_ASSUME_YES=1 bzw. DOCSOPS_NON_INTERACTIVE=1 mit ADMIN_EMAIL/PASSWORD, oder führe install.sh als Datei aus."
  fi
}

read_tty() {
  read -r "$@" </dev/tty
}

cancel_install() {
  echo ""
  echo "Installation nicht gestartet."
  echo "Es wurden keine Änderungen vorgenommen."
  exit 0
}

confirm_or_exit() {
  if [[ "${DOCSOPS_ASSUME_YES:-}" == "1" || "${DOCSOPS_INSTALL_CONFIRMED:-}" == "1" ]]; then
    return 0
  fi
  require_interactive_tty
  echo ""
  local prompt="Fortfahren? [y/N] "
  if [[ "${DOCSOPS_BOOTSTRAP_CONFIRM:-}" == "1" ]]; then
    prompt="Fortfahren? Release ${DOCSOPS_VERSION} wird nach ${DOCSOPS_INSTALL_DIR} installiert. [y/N] "
  fi
  read_tty -p "$prompt" reply
  case "${reply}" in
    y | Y | yes | YES) ;;
    *) cancel_install ;;
  esac
}

confirm_backup_key_saved() {
  if [[ "${DOCSOPS_NON_INTERACTIVE:-}" == "1" || "${DOCSOPS_ASSUME_YES:-}" == "1" ]]; then
    echo "Hinweis: BACKUP_ENCRYPTION_KEY liegt in ${DOCSOPS_ENV_FILE} – bitte zusätzlich extern sichern."
    return 0
  fi
  require_interactive_tty
  echo "Notiere den BACKUP_ENCRYPTION_KEY jetzt (Passwortmanager o. Ä.)."
  echo "Ohne diesen Schlüssel sind Backups nicht wiederherstellbar."
  echo ""
  while true; do
    read_tty -p "Key notiert – fortfahren? [y/N] " reply
    case "${reply}" in
      y | Y | yes | YES) return 0 ;;
      *) echo "Nimm dir Zeit zum Notieren. Bestätige mit y, wenn du bereit bist." ;;
    esac
  done
}

print_security_notice() {
  cat <<EOF

DocsOps Production-Installation
================================

Einsatzmodell (Standard: Intranet)
----------------------------------
DocsOps Production ist für einen **Linux-Server im Intranet** gedacht:
  - Zugriff per **HTTP** auf Port **80** (z. B. http://docsops.intranet oder Server-IP)
  - Hostname optional – internes DNS oder /etc/hosts auf Clients
  - Kein öffentliches Internet / keine TLS-Pflicht in der Standard-Installation
  - Session-Cookies funktionieren über http:// (kein Secure-Flag)
  - Keine Demo-Seed-Daten; kein Admin-Debug („View as user“)

HTTPS oder Zugriff von außen (VPN) sind optional (spätere Phase): Caddy mit TLS,
dann in ${DOCSOPS_ENV_FILE} SESSION_COOKIE_SECURE=1 setzen.

Dieses Skript wird als root ausgeführt und kann:
  - Systempakete installieren (curl, openssl, Docker)
  - Deploy-Dateien nach ${DOCSOPS_INSTALL_DIR} entpacken
  - /etc/docsops/docsops.env mit Secrets anlegen
  - Container-Images von der Registry laden und starten (Port 80 frei oder bereits durch DocsOps/Caddy belegt)

Warum root-Skripte aus dem Internet riskant sind
-------------------------------------------------
Beliebiger Code mit Administratorrechten kann das System vollständig
kompromittieren. curl | bash sollte nur verwendet werden, wenn du dem
Quellcode vertraust.

Warum es hier vertretbar sein kann
----------------------------------
DocsOps ist Open Source (FOSS). Prüfe Release-Notes und Images auf GitHub,
bevor du curl | bash ausführst.

Production-Install: curl -fsSL …/releases/latest/download/install.sh | sudo bash
(Pinning: …/releases/download/vX.Y.Z/install.sh oder DOCSOPS_VERSION=vX.Y.Z) –
kein Branch main, kein lokaler Image-Build auf dem Server.

EOF
  if [[ "${DOCSOPS_BOOTSTRAP_CONFIRM:-}" == "1" ]]; then
    echo "Nach deiner Bestätigung wird Release ${DOCSOPS_VERSION} nach ${DOCSOPS_INSTALL_DIR} installiert."
    echo ""
  fi
}

docker_compose_ready() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

# Debian docker.io has no compose plugin in default repos; official GitHub binary works.
install_compose_plugin_binary() {
  local arch dest url version
  version="${DOCSOPS_DOCKER_COMPOSE_VERSION}"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch=x86_64 ;;
    aarch64 | arm64) arch=aarch64 ;;
    armv7l) arch=armv7 ;;
    *) die "Architektur ${arch} wird für docker compose nicht unterstützt." ;;
  esac
  dest="/usr/lib/docker/cli-plugins/docker-compose"
  install -d "$(dirname "$dest")"
  url="https://github.com/docker/compose/releases/download/${version}/docker-compose-linux-${arch}"
  log "Installiere docker compose ${version} …"
  curl -fsSL "$url" -o "$dest"
  chmod +x "$dest"
}

ensure_docker_compose() {
  docker_compose_ready && return 0

  if ! command -v docker >/dev/null 2>&1; then
    log "Docker wird installiert …"
    if [[ -f /etc/debian_version ]]; then
      apt-get update
      apt-get install -y curl openssl ca-certificates docker.io
    elif [[ -f /etc/fedora-release ]] || grep -qE '^ID="?(fedora|rhel|centos)"?' /etc/os-release 2>/dev/null; then
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y curl openssl docker docker-compose-plugin
      else
        die "Unsupported RPM-based system (dnf fehlt)."
      fi
    elif [[ -f /etc/arch-release ]]; then
      pacman -Sy --noconfirm curl openssl docker docker-compose
    else
      die "Unbekannte Distribution. Bitte Docker und docker compose manuell installieren."
    fi
    systemctl enable --now docker 2>/dev/null || true
  fi

  if ! docker compose version >/dev/null 2>&1; then
    if [[ -f /etc/debian_version ]] && apt-cache show docker-compose-plugin >/dev/null 2>&1; then
      log "Installiere docker-compose-plugin (Paket) …"
      apt-get install -y docker-compose-plugin || true
    fi
  fi

  if ! docker compose version >/dev/null 2>&1; then
    install_compose_plugin_binary
  fi

  docker_compose_ready \
    || die "Docker Compose ist nach der Installation nicht verfügbar."
}

resolve_install_dir() {
  [[ -f "${DOCSOPS_INSTALL_DIR}/docker-compose.prod.yml" ]] || return 1
  return 0
}

publish_port_from_health_url() {
  local url="${DOCSOPS_HEALTH_URL:-http://127.0.0.1/health}"
  if [[ "$url" =~ :([0-9]+)/ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo 80
  fi
}

load_compose_project_name_from_env_file() {
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-docsops}"
  [[ -f "$DOCSOPS_ENV_FILE" ]] || return 0
  local line
  line="$(grep -E '^COMPOSE_PROJECT_NAME=' "$DOCSOPS_ENV_FILE" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  COMPOSE_PROJECT_NAME="${line#COMPOSE_PROJECT_NAME=}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME#\"}"
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME%\"}"
}

docsops_caddy_container_name() {
  load_compose_project_name_from_env_file
  echo "${COMPOSE_PROJECT_NAME}-caddy"
}

# True when the DocsOps Caddy container already publishes the host port (re-install / update).
docsops_caddy_publishes_port() {
  local port="$1" name mapping
  command -v docker >/dev/null 2>&1 || return 1
  name="$(docsops_caddy_container_name)"
  [[ -n "$(docker ps -q --filter "name=^${name}$" 2>/dev/null)" ]] || return 1
  while read -r mapping; do
    [[ -z "$mapping" ]] && continue
    if [[ "$mapping" =~ :${port}$ ]]; then
      return 0
    fi
  done < <(docker port "$name" 80/tcp 2>/dev/null || docker port "$name" 80 2>/dev/null)
  return 1
}

port_in_use() {
  local port="$1"
  ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .
}

pids_on_port() {
  local port="$1"
  ss -tlnHp "sport = :${port}" 2>/dev/null \
    | grep -oE 'pid=[0-9]+' \
    | cut -d= -f2 \
    | sort -u
}

process_names_on_port() {
  local port="$1" pid name names=()
  while read -r pid; do
    [[ -n "$pid" ]] || continue
    name="$(ps -o comm= -p "$pid" 2>/dev/null | tr -d ' ')"
    [[ -n "$name" ]] && names+=("$name(pid=$pid)")
  done < <(pids_on_port "$port")
  (IFS=', '; echo "${names[*]}")
}

# Prüft den Publish-Port (Default 80, aus DOCSOPS_HEALTH_URL ableitbar).
# Belegt durch den DocsOps-Caddy-Container ist OK (idempotentes Re-Install / Update).
require_publish_port_free() {
  local port proc_info caddy_name
  port="$(publish_port_from_health_url)"

  if ! port_in_use "$port"; then
    log "Port ${port} ist frei"
    return 0
  fi

  if docsops_caddy_publishes_port "$port"; then
    caddy_name="$(docsops_caddy_container_name)"
    log "Port ${port} wird bereits vom DocsOps-Stack (${caddy_name}) verwendet – Update-Installation"
    return 0
  fi

  if curl -sf "${DOCSOPS_HEALTH_URL}" >/dev/null 2>&1; then
    log "Port ${port} belegt, DocsOps Health-Check OK (${DOCSOPS_HEALTH_URL}) – Update-Installation"
    return 0
  fi

  echo "Port ${port} ist belegt:" >&2
  ss -tlnp "sport = :${port}" 2>/dev/null || true
  proc_info="$(process_names_on_port "$port")"
  [[ -n "$proc_info" ]] && echo "Prozesse: ${proc_info}" >&2

  if [[ "$port" == "80" ]]; then
    die "Port 80 ist belegt (nicht durch DocsOps). Bitte den bestehenden Webserver stoppen oder DocsOps auf einem anderen Host installieren."
  fi

  die "Port ${port} ist belegt (nicht durch DocsOps). DOCSOPS_HEALTH_URL=${DOCSOPS_HEALTH_URL}"
}

require_port_80_free() {
  require_publish_port_free
}

write_env_file() {
  local session_secret backup_key admin_email admin_password hostname image_prefix version
  assert_release_version
  session_secret="$(openssl rand -hex 32)"
  backup_key="$(openssl rand -base64 32)"
  admin_email="${ADMIN_EMAIL:-}"
  admin_password="${ADMIN_PASSWORD:-}"
  hostname="${DOCSOPS_HOSTNAME:-}"
  image_prefix="${DOCSOPS_IMAGE_PREFIX:-ghcr.io/bjkawecki}"
  version="${DOCSOPS_VERSION}"
  update_github_repo="${DOCSOPS_UPDATE_GITHUB_REPO:-${DOCSOPS_GITHUB_REPO:-bjkawecki/docs-ops}}"
  agent_token="$(openssl rand -hex 32)"

  install -d -m 700 /etc/docsops

  if [[ -f "$DOCSOPS_ENV_FILE" && "${DOCSOPS_RECONFIGURE:-}" != "1" ]]; then
    die "$DOCSOPS_ENV_FILE existiert bereits. Nutze --reconfigure oder entferne die Datei bewusst."
  fi

  umask 077
  cat >"$DOCSOPS_ENV_FILE" <<EOF
# DocsOps production config (generated by install-prod.sh)
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-docsops}
DOCSOPS_VERSION=${version}
DOCSOPS_IMAGE_PREFIX=${image_prefix}
DOCSOPS_UPDATE_GITHUB_REPO=${update_github_repo}
DOCSOPS_AGENT_URL=http://host.docker.internal:8091
DOCSOPS_AGENT_TOKEN=${agent_token}
DOCSOPS_AGENT_LISTEN=0.0.0.0:8091
DOCSOPS_AGENT_INSTALL_DIR=${DOCSOPS_INSTALL_DIR}
DOCSOPS_AGENT_ENV_FILE=${DOCSOPS_ENV_FILE}
DOCSOPS_AGENT_HEALTH_URL=${DOCSOPS_HEALTH_URL:-http://127.0.0.1/health}
DOCSOPS_EXTRA_COMPOSE_FILES=${DOCSOPS_EXTRA_COMPOSE_FILES:-}
SESSION_SECRET=${session_secret}
BACKUP_ENCRYPTION_KEY="${backup_key}"
ADMIN_EMAIL=${admin_email}
ADMIN_PASSWORD=${admin_password}
DOCSOPS_HOSTNAME=${hostname}
EOF
  chmod 600 "$DOCSOPS_ENV_FILE"

  echo ""
  echo "================================================================"
  echo " BACKUP_ENCRYPTION_KEY (einmalig – im Passwortmanager sichern!)"
  echo "================================================================"
  echo "${backup_key}"
  echo "================================================================"
  echo "Gespeichert in: ${DOCSOPS_ENV_FILE}"
  echo ""
  confirm_backup_key_saved
}

compose_stack_setup() {
  local compose_files extra_files
  compose_files="${DOCSOPS_COMPOSE_FILES}"
  extra_files="${DOCSOPS_EXTRA_COMPOSE_FILES:-}"
  if [[ -n "$extra_files" ]]; then
    compose_files="${compose_files}:${extra_files}"
  fi
  export COMPOSE_FILE="$compose_files"
  cd "$DOCSOPS_INSTALL_DIR"
}

compose_stack_cmd() {
  docker compose --env-file "$DOCSOPS_ENV_FILE" "$@"
}

diagnose_stack_failure() {
  compose_stack_setup
  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Container-Status"
  echo "────────────────────────────────────────────────────────"
  compose_stack_cmd ps -a 2>&1 || true
  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Logs: app (letzte 80 Zeilen)"
  echo "────────────────────────────────────────────────────────"
  compose_stack_cmd logs --tail=80 app 2>&1 || true
  echo ""
  echo "────────────────────────────────────────────────────────"
  echo " Logs: docsops-migrate (letzte 80 Zeilen)"
  echo "────────────────────────────────────────────────────────"
  compose_stack_cmd logs --tail=80 docsops-migrate 2>&1 || true
  echo ""
  echo "Nächste Schritte:"
  echo "  cd ${DOCSOPS_INSTALL_DIR}"
  echo "  docker compose --env-file ${DOCSOPS_ENV_FILE} logs -f app"
  echo "  docker compose --env-file ${DOCSOPS_ENV_FILE} ps"
  echo ""
  echo "Konfiguration (${DOCSOPS_ENV_FILE}) und Volumes bleiben erhalten."
  echo "Nach Behebung des Problems Install erneut starten."
}

abort_stack_failure() {
  local reason="$1"
  echo "" >&2
  echo "════════════════════════════════════════════════════════" >&2
  echo " Installation fehlgeschlagen" >&2
  echo "════════════════════════════════════════════════════════" >&2
  echo "" >&2
  echo "${reason}" >&2
  diagnose_stack_failure >&2
  exit 1
}

compose_pull_images() {
  compose_stack_setup
  if [[ "${DOCSOPS_SKIP_IMAGE_PULL:-}" == "1" ]]; then
    log "Überspringe docker compose pull (DOCSOPS_SKIP_IMAGE_PULL=1)."
    return 0
  fi
  if ! compose_stack_cmd pull; then
    abort_stack_failure "docker compose pull fehlgeschlagen. Prüfe DOCSOPS_VERSION und Registry-Zugriff (${DOCSOPS_IMAGE_PREFIX})."
  fi
}

compose_up_prod() {
  local wait_timeout up_args
  wait_timeout="${DOCSOPS_COMPOSE_WAIT_TIMEOUT:-300}"
  compose_stack_setup
  assert_release_version
  load_existing_env_optional
  if [[ "${DOCSOPS_SKIP_IMAGE_PULL:-}" == "1" ]]; then
    log "Starte Container mit lokalen Images (${DOCSOPS_IMAGE_PREFIX}, ${DOCSOPS_VERSION}) …"
  else
    log "Lade Container-Images von ${DOCSOPS_IMAGE_PREFIX} (${DOCSOPS_VERSION}) …"
  fi
  compose_pull_images
  up_args=(-d)
  if compose_stack_cmd up --help 2>&1 | grep -q -- '--wait'; then
    up_args=(-d --wait --wait-timeout "$wait_timeout")
    log "Starte Container (Health-Wait, max. ${wait_timeout}s) …"
  else
    log "Starte Container …"
  fi
  if ! compose_stack_cmd up "${up_args[@]}"; then
    abort_stack_failure "Der Stack konnte nicht starten (Container unhealthy oder Abhängigkeit fehlgeschlagen)."
  fi
}

load_existing_env_optional() {
  [[ -f "$DOCSOPS_ENV_FILE" ]] || return 0
  # shellcheck disable=SC1090
  set -a
  source "$DOCSOPS_ENV_FILE"
  set +a
  export DOCSOPS_VERSION="${DOCSOPS_VERSION:-}"
  export DOCSOPS_IMAGE_PREFIX="${DOCSOPS_IMAGE_PREFIX:-ghcr.io/bjkawecki}"
}

patch_env_version() {
  local version="$1" env_file="${DOCSOPS_ENV_FILE}"
  assert_release_version "$version"
  [[ -f "$env_file" ]] || die "${env_file} fehlt – zuerst installieren."
  if grep -q '^DOCSOPS_VERSION=' "$env_file"; then
    sed -i "s/^DOCSOPS_VERSION=.*/DOCSOPS_VERSION=${version}/" "$env_file"
  else
    echo "DOCSOPS_VERSION=${version}" >>"$env_file"
  fi
  export DOCSOPS_VERSION="$version"
}

wait_for_health() {
  local i max delay url
  max="${DOCSOPS_HEALTH_RETRIES:-30}"
  delay="${DOCSOPS_HEALTH_DELAY:-10}"
  url="${DOCSOPS_HEALTH_URL}"
  log "Warte auf ${url} …"
  for ((i = 1; i <= max; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "Health-Check OK"
      return 0
    fi
    echo "  Versuch ${i}/${max}, erneut in ${delay}s …"
    sleep "$delay"
  done
  abort_stack_failure "Health-Check fehlgeschlagen: ${url}"
}

install_systemd_unit() {
  cat >/etc/systemd/system/docsops.service <<EOF
[Unit]
Description=DocsOps (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DOCSOPS_INSTALL_DIR}
EnvironmentFile=${DOCSOPS_ENV_FILE}
ExecStart=/usr/bin/docker compose --env-file ${DOCSOPS_ENV_FILE} -f docker-compose.yml -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose --env-file ${DOCSOPS_ENV_FILE} -f docker-compose.yml -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable docsops.service
  log "systemd-Unit docsops.service aktiviert"
}

install_agent_binary() {
  local src="${DOCSOPS_INSTALL_DIR}/bin/docsops-agent"
  [[ -f "$src" ]] || die "docsops-agent binary fehlt im Bundle (bin/docsops-agent)."
  install -m 755 "$src" /usr/local/bin/docsops-agent
  log "docsops-agent nach /usr/local/bin/docsops-agent installiert"
}

install_agent_systemd_unit() {
  [[ -n "${DOCSOPS_ENV_FILE:-}" ]] || die "DOCSOPS_ENV_FILE fehlt für docsops-agent.service."
  cat >/etc/systemd/system/docsops-agent.service <<EOF
[Unit]
Description=DocsOps host update agent
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
EnvironmentFile=${DOCSOPS_ENV_FILE}
ExecStart=/usr/local/bin/docsops-agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable docsops-agent.service
  systemctl restart docsops-agent.service
  log "systemd-Unit docsops-agent.service aktiviert (EnvironmentFile=${DOCSOPS_ENV_FILE})"
}

print_finish() {
  local ip url
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  url="http://${ip:-localhost}/"
  if [[ -n "${DOCSOPS_HOSTNAME:-}" ]]; then
    echo ""
    echo "Optionaler Hostname: ${DOCSOPS_HOSTNAME}"
    echo "Clients: Eintrag in /etc/hosts oder internes DNS, z. B.:"
    echo "  ${ip:-<server-ip>}  ${DOCSOPS_HOSTNAME}"
    url="http://${DOCSOPS_HOSTNAME}/"
  fi
  echo ""
  echo "DocsOps ist installiert (Intranet-Standard: HTTP auf Port 80)."
  echo "  URL:        ${url}"
  echo "  Admin:      ${ADMIN_EMAIL:-}"
  echo "  Konfiguration: ${DOCSOPS_ENV_FILE}"
  echo ""
  echo "HTTPS später: Caddy TLS einrichten und SESSION_COOKIE_SECURE=1 in ${DOCSOPS_ENV_FILE} setzen."
  echo ""
}
