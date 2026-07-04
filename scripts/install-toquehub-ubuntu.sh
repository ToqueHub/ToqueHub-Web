#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TOQUEHUB_REPO_URL:-https://github.com/ToqueHub/ToqueHub-Web.git}"
BRANCH="${TOQUEHUB_BRANCH:-1.0.0}"
INSTALL_DIR="${TOQUEHUB_INSTALL_DIR:-/opt/toquehub}"
HTTP_PORT="${TOQUEHUB_HTTP_PORT:-8080}"
ZIGBEE2MQTT_PORT="${ZIGBEE2MQTT_HTTP_PORT:-8081}"
MQTT_PORT="${MQTT_PORT:-1883}"
ENV_FILE="$INSTALL_DIR/.env.docker"

repo_slug() {
  local url="$1"
  url="${url#git@github.com:}"
  url="${url#https://*@github.com/}"
  url="${url#http://*@github.com/}"
  url="${url#https://github.com/}"
  url="${url#http://github.com/}"
  url="${url%.git}"
  printf '%s\n' "$url"
}

repo_owner() {
  repo_slug "$1" | cut -d/ -f1
}

version_from_ref() {
  local ref="$1"
  if [[ "$ref" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s\n' "${ref#v}"
    return
  fi
  printf 'latest\n'
}

usage() {
  cat <<'MSG'
Usage: scripts/install-toquehub-ubuntu.sh

Fresh Ubuntu Server installer for ToqueHub.

It installs:
  - apt prerequisites
  - Node.js 22 + npm
  - Docker Engine + Docker Compose plugin
  - ToqueHub from Git
  - generated local secrets in .env.docker
  - Docker containers for web, API, PostgreSQL, Mosquitto and Zigbee2MQTT

Useful environment variables:
  TOQUEHUB_REPO_URL=https://github.com/ToqueHub/ToqueHub-Web.git
  TOQUEHUB_BRANCH=1.0.0
  TOQUEHUB_INSTALL_DIR=/opt/toquehub
  TOQUEHUB_HTTP_PORT=8080
  ZIGBEE2MQTT_HTTP_PORT=8081
  MQTT_PORT=1883

Example:
  curl -fsSL https://raw.githubusercontent.com/ToqueHub/ToqueHub-Web/1.0.0/scripts/install-toquehub-ubuntu.sh | bash
MSG
}

log() {
  printf '\n==> %s\n' "$1"
}

require_ubuntu() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This installer must run on Linux." >&2
    exit 1
  fi

  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"ubuntu"* && "${ID_LIKE:-}" != *"debian"* ]]; then
      echo "Unsupported distribution: ${PRETTY_NAME:-unknown}. This script targets Ubuntu/Debian servers." >&2
      exit 1
    fi
  fi
}

sudo_cmd() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

docker_cmd() {
  if docker ps >/dev/null 2>&1; then
    docker "$@"
  else
    sudo_cmd docker "$@"
  fi
}

secret() {
  openssl rand -hex 32
}

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

get_env() {
  local key="$1"
  local fallback="${2:-}"
  local value

  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  else
    value=""
  fi

  printf '%s\n' "${value:-$fallback}"
}

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"

  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '$0 ~ "^" key "=" { print key "=" value; next } { print }' "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$ENV_FILE"
}

set_env_if_placeholder() {
  local key="$1"
  local value="$2"
  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"

  if [[ -z "$current" || "$current" == replace-with-* || "$current" == change-me-* ]]; then
    set_env "$key" "$value"
  fi
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
    if [[ "$major" -ge 20 ]]; then
      return
    fi
  fi

  log "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo_cmd bash -
  sudo_cmd apt-get install -y nodejs
}

install_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Installation de Docker"
    curl -fsSL https://get.docker.com | sudo_cmd sh
  fi

  sudo_cmd systemctl enable --now docker

  if ! docker compose version >/dev/null 2>&1; then
    log "Installation du plugin Docker Compose"
    sudo_cmd apt-get update
    sudo_cmd apt-get install -y docker-compose-plugin
  fi

  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    sudo_cmd usermod -aG docker "$USER" || true
  fi
}

prepare_repository() {
  log "Preparation du dossier ToqueHub: $INSTALL_DIR"
  sudo_cmd mkdir -p "$(dirname "$INSTALL_DIR")"

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    sudo_cmd chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
  else
    if [[ -e "$INSTALL_DIR" && -n "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | head -1)" ]]; then
      echo "$INSTALL_DIR exists and is not an empty Git repository." >&2
      exit 1
    fi
    sudo_cmd rm -rf "$INSTALL_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    sudo_cmd chown -R "$(id -u):$(id -g)" "$INSTALL_DIR"
  fi
}

configure_toquehub() {
  log "Configuration de ToqueHub"
  cd "$INSTALL_DIR"

  TOQUEHUB_HTTP_PORT="$HTTP_PORT" ZIGBEE2MQTT_HTTP_PORT="$ZIGBEE2MQTT_PORT" MQTT_PORT="$MQTT_PORT" ./scripts/setup-toquehub-docker.sh

  local slug owner version
  slug="$(repo_slug "$REPO_URL")"
  owner="$(repo_owner "$REPO_URL" | tr '[:upper:]' '[:lower:]')"
  version="$(version_from_ref "$BRANCH")"

  HTTP_PORT="$(get_env TOQUEHUB_HTTP_PORT "$HTTP_PORT")"
  ZIGBEE2MQTT_PORT="$(get_env ZIGBEE2MQTT_HTTP_PORT "$ZIGBEE2MQTT_PORT")"
  MQTT_PORT="$(get_env MQTT_PORT "$MQTT_PORT")"
  set_env TOQUEHUB_RELEASE_REPO "$slug"
  set_env TOQUEHUB_IMAGE_REGISTRY "ghcr.io/$owner"
  set_env TOQUEHUB_IMAGE_TAG "$version"
  set_env TOQUEHUB_VERSION "$version"
  set_env_if_placeholder POSTGRES_PASSWORD "$(secret)"
  set_env_if_placeholder JWT_SECRET "$(secret)"
  set_env_if_placeholder BACKUP_CLOUD_ENCRYPTION_KEY "$(secret)"
  set_env_if_placeholder TOQUEHUB_UPDATER_SECRET "$(secret)"
  set_env TOQUEHUB_DISCOVERY_PORT "$HTTP_PORT"

  local ip
  ip="$(server_ip || true)"
  if [[ -n "$ip" ]]; then
    set_env CORS_ORIGIN "http://$ip:$HTTP_PORT,http://localhost:$HTTP_PORT,http://127.0.0.1:$HTTP_PORT"
    set_env ZIGBEE2MQTT_FRONTEND_URL "http://$ip:$ZIGBEE2MQTT_PORT"
    set_env TOQUEHUB_DISCOVERY_HOST "$ip"
  fi
}

open_firewall_ports() {
  if command -v ufw >/dev/null 2>&1 && sudo_cmd ufw status | grep -q "Status: active"; then
    log "Ouverture des ports UFW"
    sudo_cmd ufw allow "$HTTP_PORT/tcp"
    sudo_cmd ufw allow "$ZIGBEE2MQTT_PORT/tcp"
    sudo_cmd ufw allow "$MQTT_PORT/tcp"
    sudo_cmd ufw allow 5353/udp
  fi
}

start_toquehub() {
  log "Lancement de ToqueHub"
  cd "$INSTALL_DIR"
  docker_cmd compose --env-file .env.docker up -d --build
}

print_summary() {
  local ip
  ip="$(server_ip || true)"

  cat <<MSG

ToqueHub est installe.

Adresse locale serveur:
  http://localhost:$HTTP_PORT

Adresse reseau probable:
  http://${ip:-IP_DU_SERVEUR}:$HTTP_PORT

Ports:
  ToqueHub web: $HTTP_PORT
  Zigbee2MQTT: $ZIGBEE2MQTT_PORT
  MQTT: $MQTT_PORT

Commandes utiles:
  cd $INSTALL_DIR
  docker compose --env-file .env.docker ps
  docker compose --env-file .env.docker logs -f api web mdns postgres mosquitto zigbee2mqtt
  docker compose --env-file .env.docker down
  docker compose --env-file .env.docker up -d --build

Note:
  Si ton utilisateur vient d'etre ajoute au groupe docker, reconnecte-toi en SSH
  pour utiliser docker sans sudo.
MSG
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_ubuntu

log "Installation des prerequis systeme"
sudo_cmd apt-get update
sudo_cmd apt-get install -y ca-certificates curl git openssl gnupg lsb-release postgresql-client

install_node
install_docker
prepare_repository
configure_toquehub
open_firewall_ports
start_toquehub
print_summary
