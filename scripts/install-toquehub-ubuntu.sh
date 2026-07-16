#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${TOQUEHUB_REPO_URL:-https://github.com/ToqueHub/ToqueHub-Web.git}"
BRANCH="${TOQUEHUB_BRANCH:-1.0.0}"
INSTALL_DIR="${TOQUEHUB_INSTALL_DIR:-/opt/toquehub}"
HTTP_PORT="${TOQUEHUB_HTTP_PORT:-80}"
ZIGBEE2MQTT_PORT="${ZIGBEE2MQTT_HTTP_PORT:-8081}"
MQTT_PORT="${MQTT_PORT:-1883}"
TOQUEHUB_TAILSCALE_ENABLED="${TOQUEHUB_TAILSCALE_ENABLED:-true}"
TOQUEHUB_TAILSCALE_AUTHKEY="${TOQUEHUB_TAILSCALE_AUTHKEY:-}"
TOQUEHUB_TAILSCALE_HOSTNAME="${TOQUEHUB_TAILSCALE_HOSTNAME:-toquehub}"
TOQUEHUB_LOCAL_HOSTNAME="${TOQUEHUB_LOCAL_HOSTNAME:-toquehub}"
TOQUEHUB_SET_LOCAL_HOSTNAME="${TOQUEHUB_SET_LOCAL_HOSTNAME:-true}"
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
  TOQUEHUB_HTTP_PORT=80
  ZIGBEE2MQTT_HTTP_PORT=8081
  MQTT_PORT=1883
  TOQUEHUB_LOCAL_HOSTNAME=toquehub
  TOQUEHUB_SET_LOCAL_HOSTNAME=true
  TOQUEHUB_TAILSCALE_ENABLED=true
  TOQUEHUB_TAILSCALE_AUTHKEY=tskey-auth-... (optionnel, jamais stocké dans .env.docker)
  TOQUEHUB_TAILSCALE_HOSTNAME=toquehub
  TOQUEHUB_REMOTE_AGENT_URL=http://host.docker.internal:3101

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

origin_for_host() {
  local host="$1"
  local port="$2"
  if [[ "$port" == "80" ]]; then
    printf 'http://%s\n' "$host"
  else
    printf 'http://%s:%s\n' "$host" "$port"
  fi
}

url_for_host() {
  origin_for_host "$@"
}

ensure_mdns_nsswitch() {
  if [[ ! -f /etc/nsswitch.conf ]]; then
    return
  fi

  if grep -E '^hosts:' /etc/nsswitch.conf | grep -q 'mdns4_minimal'; then
    return
  fi

  sudo_cmd cp /etc/nsswitch.conf /etc/nsswitch.conf.toquehub.bak || true
  sudo_cmd sed -i -E 's/^hosts:.*/hosts:          files mdns4_minimal [NOTFOUND=return] dns mdns4/' /etc/nsswitch.conf || true
}

tailscale_ip() {
  command -v tailscale >/dev/null 2>&1 || return 0
  tailscale ip -4 2>/dev/null | head -1 || true
}

tailscale_dns_name() {
  command -v tailscale >/dev/null 2>&1 || return 0
  tailscale status --json 2>/dev/null \
    | sed -n 's/^[[:space:]]*"DNSName":[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1 \
    | sed 's/\.$//' || true
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

configure_local_hostname() {
  log "Configuration de l'adresse locale http://$TOQUEHUB_LOCAL_HOSTNAME.local"
  sudo_cmd apt-get install -y avahi-daemon libnss-mdns
  ensure_mdns_nsswitch
  sudo_cmd systemctl enable --now avahi-daemon || true

  if [[ "$TOQUEHUB_SET_LOCAL_HOSTNAME" == "true" || "$TOQUEHUB_SET_LOCAL_HOSTNAME" == "1" ]]; then
    if command -v hostnamectl >/dev/null 2>&1; then
      sudo_cmd hostnamectl set-hostname "$TOQUEHUB_LOCAL_HOSTNAME" || true
    else
      printf '%s\n' "$TOQUEHUB_LOCAL_HOSTNAME" | sudo_cmd tee /etc/hostname >/dev/null || true
      sudo_cmd hostname "$TOQUEHUB_LOCAL_HOSTNAME" || true
    fi

    if grep -qE '^127\.0\.1\.1\s+' /etc/hosts; then
      sudo_cmd sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1 $TOQUEHUB_LOCAL_HOSTNAME/" /etc/hosts || true
    else
      printf '127.0.1.1 %s\n' "$TOQUEHUB_LOCAL_HOSTNAME" | sudo_cmd tee -a /etc/hosts >/dev/null || true
    fi
  fi
}

install_tailscale() {
  if [[ "$TOQUEHUB_TAILSCALE_ENABLED" != "true" && "$TOQUEHUB_TAILSCALE_ENABLED" != "1" ]]; then
    return
  fi

  if ! command -v tailscale >/dev/null 2>&1; then
    log "Installation de Tailscale"
    curl -fsSL https://tailscale.com/install.sh | sudo_cmd sh
  fi

  sudo_cmd systemctl enable --now tailscaled || true

  if [[ -n "$TOQUEHUB_TAILSCALE_AUTHKEY" ]]; then
    log "Activation de Tailscale"
    sudo_cmd tailscale up --authkey "$TOQUEHUB_TAILSCALE_AUTHKEY" --hostname "$TOQUEHUB_TAILSCALE_HOSTNAME" || true
  else
    log "Tailscale installe; activation disponible depuis l'interface ToqueHub"
  fi
}

install_remote_agent() {
  log "Installation de l'agent acces distant ToqueHub"
  sudo_cmd install -m 0755 "$INSTALL_DIR/scripts/toquehub-remote-agent.py" /usr/local/sbin/toquehub-remote-agent

  local service_tmp
  service_tmp="$(mktemp)"
  cat > "$service_tmp" <<SERVICE
[Unit]
Description=ToqueHub Remote Access Agent
After=network-online.target tailscaled.service
Wants=network-online.target tailscaled.service

[Service]
Type=simple
EnvironmentFile=$ENV_FILE
Environment=TOQUEHUB_REMOTE_AGENT_ENV_FILE=$ENV_FILE
ExecStart=/usr/local/sbin/toquehub-remote-agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE
  sudo_cmd mv "$service_tmp" /etc/systemd/system/toquehub-remote-agent.service
  sudo_cmd chmod 0644 /etc/systemd/system/toquehub-remote-agent.service
  sudo_cmd systemctl daemon-reload
  sudo_cmd systemctl enable --now toquehub-remote-agent.service
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
  set_env COMPOSE_PROJECT_NAME "$(get_env COMPOSE_PROJECT_NAME toquehub)"
  set_env TOQUEHUB_IMAGE_REGISTRY "ghcr.io/$owner"
  set_env TOQUEHUB_IMAGE_TAG "$version"
  set_env TOQUEHUB_VERSION "$version"
  set_env_if_placeholder POSTGRES_PASSWORD "$(secret)"
  set_env_if_placeholder JWT_SECRET "$(secret)"
  set_env_if_placeholder BACKUP_CLOUD_ENCRYPTION_KEY "$(secret)"
  set_env_if_placeholder PURCHASING_EMAIL_ENCRYPTION_KEY "$(secret)"
  set_env_if_placeholder TOQUEHUB_UPDATER_SECRET "$(secret)"
  set_env_if_placeholder TOQUEHUB_REMOTE_AGENT_SECRET "$(secret)"
  set_env TOQUEHUB_REMOTE_AGENT_URL "${TOQUEHUB_REMOTE_AGENT_URL:-http://host.docker.internal:3101}"
  set_env TOQUEHUB_DISCOVERY_ENABLED "true"
  set_env TOQUEHUB_DISCOVERY_PORT "$HTTP_PORT"
  set_env TOQUEHUB_LOCAL_HOSTNAME "$TOQUEHUB_LOCAL_HOSTNAME"
  set_env TOQUEHUB_TAILSCALE_ENABLED "$TOQUEHUB_TAILSCALE_ENABLED"
  set_env TOQUEHUB_TAILSCALE_INSTALLED "$(command -v tailscale >/dev/null 2>&1 && printf true || printf false)"
  set_env TOQUEHUB_TAILSCALE_HOSTNAME "$TOQUEHUB_TAILSCALE_HOSTNAME"

  local ip
  ip="$(server_ip || true)"
  local local_origin
  local_origin="$(origin_for_host "$TOQUEHUB_LOCAL_HOSTNAME.local" "$HTTP_PORT")"
  if [[ -n "$ip" ]]; then
    set_env TOQUEHUB_WEB_URL "$local_origin"
    set_env CORS_ORIGIN "$(origin_for_host "$ip" "$HTTP_PORT"),$local_origin,$(origin_for_host localhost "$HTTP_PORT"),$(origin_for_host 127.0.0.1 "$HTTP_PORT")"
    set_env ZIGBEE2MQTT_FRONTEND_URL "http://$ip:$ZIGBEE2MQTT_PORT"
    set_env TOQUEHUB_DISCOVERY_HOST "$ip"
  else
    set_env TOQUEHUB_WEB_URL "$local_origin"
    set_env CORS_ORIGIN "$local_origin,$(origin_for_host localhost "$HTTP_PORT"),$(origin_for_host 127.0.0.1 "$HTTP_PORT")"
  fi

  local tail_ip
  tail_ip="$(tailscale_ip || true)"
  local tail_dns_name
  tail_dns_name="$(tailscale_dns_name || true)"
  if [[ -n "$tail_ip" ]]; then
    set_env TOQUEHUB_TAILSCALE_IP "$tail_ip"
    set_env TOQUEHUB_TAILSCALE_DNS_NAME "$tail_dns_name"
    set_env TOQUEHUB_REMOTE_ACCESS_URL "$(url_for_host "${tail_dns_name:-$tail_ip}" "$HTTP_PORT")"
    local tailscale_origin
    tailscale_origin="$(origin_for_host "${tail_dns_name:-$tail_ip}" "$HTTP_PORT")"
    set_env CORS_ORIGIN "$(get_env CORS_ORIGIN "$(origin_for_host localhost "$HTTP_PORT")"),$tailscale_origin"
  else
    set_env TOQUEHUB_TAILSCALE_IP ""
    set_env TOQUEHUB_TAILSCALE_DNS_NAME ""
    set_env TOQUEHUB_REMOTE_ACCESS_URL ""
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
  local local_url ip_url
  local_url="$(url_for_host "$TOQUEHUB_LOCAL_HOSTNAME.local" "$HTTP_PORT")"
  ip_url="$(url_for_host "${ip:-IP_DU_SERVEUR}" "$HTTP_PORT")"

  cat <<MSG

ToqueHub est installe.

Depuis un ordinateur connecte au meme reseau, ouvre:
  $local_url

Si cette adresse ne charge pas, utilise l'adresse IP de secours:
  $ip_url

Adresse web officielle:
  $(get_env TOQUEHUB_WEB_URL "$local_url")

Ports:
  ToqueHub web: $HTTP_PORT
  Zigbee2MQTT: $ZIGBEE2MQTT_PORT
  MQTT: $MQTT_PORT
  Acces Tailscale: ${TOQUEHUB_TAILSCALE_ENABLED}
  URL distante: $(get_env TOQUEHUB_REMOTE_ACCESS_URL "-")

Commandes utiles:
  cd $INSTALL_DIR
  ./scripts/toquehub-addresses.sh
  docker compose --env-file .env.docker ps
  docker compose --env-file .env.docker logs -f api web mdns postgres mosquitto zigbee2mqtt
  docker compose --env-file .env.docker down
  docker compose --env-file .env.docker up -d --build
  sudo systemctl status toquehub-remote-agent

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
sudo_cmd apt-get install -y ca-certificates curl git openssl gnupg lsb-release postgresql-client python3

install_node
install_docker
configure_local_hostname
install_tailscale
prepare_repository
configure_toquehub
install_remote_agent
open_firewall_ports
start_toquehub
print_summary
