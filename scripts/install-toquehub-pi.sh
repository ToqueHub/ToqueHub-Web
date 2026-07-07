#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${TOQUEHUB_INSTALL_DIR:-/opt/toquehub}"
CONFIG_DIR="${TOQUEHUB_CONFIG_DIR:-/etc/toquehub}"
DATA_DIR="${TOQUEHUB_DATA_DIR:-/var/lib/toquehub}"
ENV_FILE="$CONFIG_DIR/toquehub.env"
HTTP_PORT="${TOQUEHUB_HTTP_PORT:-80}"
TOQUEHUB_TAILSCALE_ENABLED="${TOQUEHUB_TAILSCALE_ENABLED:-true}"
TOQUEHUB_TAILSCALE_AUTHKEY="${TOQUEHUB_TAILSCALE_AUTHKEY:-}"
TOQUEHUB_TAILSCALE_HOSTNAME="${TOQUEHUB_TAILSCALE_HOSTNAME:-toquehub}"
TOQUEHUB_LOCAL_HOSTNAME="${TOQUEHUB_LOCAL_HOSTNAME:-toquehub}"
TOQUEHUB_SET_LOCAL_HOSTNAME="${TOQUEHUB_SET_LOCAL_HOSTNAME:-true}"

usage() {
  cat <<'MSG'
Usage: scripts/install-toquehub-pi.sh

Install ToqueHub on Raspberry Pi OS 64-bit using Docker.

This script:
  - installs Docker if missing
  - copies ToqueHub Compose/runtime files
  - generates secrets
  - enables systemd services
  - installs Tailscale for private remote access
  - starts ToqueHub
MSG
}

secret() {
  openssl rand -hex 32
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

  sudo mv "$tmp" "$ENV_FILE"
  sudo chmod 0600 "$ENV_FILE"
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

install_tailscale() {
  if [[ "$TOQUEHUB_TAILSCALE_ENABLED" != "true" && "$TOQUEHUB_TAILSCALE_ENABLED" != "1" ]]; then
    return
  fi

  if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sudo sh
  fi

  sudo systemctl enable --now tailscaled || true
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

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "( sport = :$port )" | grep -q .
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  timeout 1 bash -c "</dev/tcp/127.0.0.1/$port" >/dev/null 2>&1
}

find_free_port() {
  local start="$1"
  local port
  for ((port = start; port < start + 200; port++)); do
    if ! port_in_use "$port"; then
      printf '%s\n' "$port"
      return
    fi
  done

  echo "Aucun port libre trouve a partir de $start." >&2
  exit 1
}

resolve_http_port() {
  if ! port_in_use "$HTTP_PORT"; then
    return
  fi

  local fallback
  fallback="$(find_free_port 8080)"
  printf 'Port %s occupe, utilisation de TOQUEHUB_HTTP_PORT=%s\n' "$HTTP_PORT" "$fallback" >&2
  HTTP_PORT="$fallback"
}

configure_local_hostname() {
  sudo apt-get install -y avahi-daemon libnss-mdns
  sudo systemctl enable --now avahi-daemon || true

  if [[ "$TOQUEHUB_SET_LOCAL_HOSTNAME" == "true" || "$TOQUEHUB_SET_LOCAL_HOSTNAME" == "1" ]]; then
    if command -v hostnamectl >/dev/null 2>&1; then
      sudo hostnamectl set-hostname "$TOQUEHUB_LOCAL_HOSTNAME" || true
    else
      printf '%s\n' "$TOQUEHUB_LOCAL_HOSTNAME" | sudo tee /etc/hostname >/dev/null || true
      sudo hostname "$TOQUEHUB_LOCAL_HOSTNAME" || true
    fi

    if grep -qE '^127\.0\.1\.1\s+' /etc/hosts; then
      sudo sed -i "s/^127\\.0\\.1\\.1.*/127.0.1.1 $TOQUEHUB_LOCAL_HOSTNAME/" /etc/hosts || true
    else
      printf '127.0.1.1 %s\n' "$TOQUEHUB_LOCAL_HOSTNAME" | sudo tee -a /etc/hosts >/dev/null || true
    fi
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer must run on Linux/Raspberry Pi OS." >&2
  exit 1
fi

arch="$(uname -m)"
if [[ "$arch" != "aarch64" && "$arch" != "arm64" ]]; then
  echo "Unsupported architecture: $arch. ToqueHub Pi install targets 64-bit Raspberry Pi OS." >&2
  exit 1
fi

command -v sudo >/dev/null 2>&1 || { echo "sudo is required." >&2; exit 1; }

sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl postgresql-client python3

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo systemctl enable --now docker
configure_local_hostname
install_tailscale
resolve_http_port

sudo mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
sudo cp "$ROOT_DIR/docker-compose.pi.yml" "$INSTALL_DIR/docker-compose.pi.yml"
sudo cp "$ROOT_DIR/.env.raspberry.example" "$INSTALL_DIR/toquehub.env.example"
sudo cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$INSTALL_DIR/mosquitto.conf"
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/bin/toquehub" /usr/local/bin/toquehub
sudo cp "$ROOT_DIR/scripts/toquehub-addresses.sh" /usr/local/bin/toquehub-addresses
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/sbin/toquehub-firstboot" /usr/local/sbin/toquehub-firstboot
sudo cp "$ROOT_DIR/scripts/toquehub-remote-agent.py" /usr/local/sbin/toquehub-remote-agent
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub.service" /etc/systemd/system/toquehub.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-firstboot.service" /etc/systemd/system/toquehub-firstboot.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-remote-agent.service" /etc/systemd/system/toquehub-remote-agent.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-zigbee.service" /etc/systemd/system/toquehub-zigbee.service
sudo chmod +x /usr/local/bin/toquehub /usr/local/bin/toquehub-addresses /usr/local/sbin/toquehub-firstboot /usr/local/sbin/toquehub-remote-agent

if [[ ! -f "$ENV_FILE" ]]; then
  sudo cp "$ROOT_DIR/.env.raspberry.example" "$ENV_FILE"
fi

set_env TOQUEHUB_DATA_DIR "$DATA_DIR"
set_env TOQUEHUB_CONFIG_DIR "$CONFIG_DIR"
set_env TOQUEHUB_HTTP_PORT "$HTTP_PORT"
set_env TOQUEHUB_LOCAL_HOSTNAME "$TOQUEHUB_LOCAL_HOSTNAME"
set_env TOQUEHUB_WEB_URL "$(origin_for_host "$TOQUEHUB_LOCAL_HOSTNAME.local" "$HTTP_PORT")"
set_env TOQUEHUB_DISCOVERY_PORT "$HTTP_PORT"
set_env POSTGRES_PASSWORD "$(secret)"
set_env JWT_SECRET "$(secret)"
set_env BACKUP_CLOUD_ENCRYPTION_KEY "$(secret)"
set_env TOQUEHUB_UPDATER_SECRET "$(secret)"
set_env_if_placeholder TOQUEHUB_REMOTE_AGENT_SECRET "$(secret)"
set_env TOQUEHUB_REMOTE_AGENT_URL "http://host.docker.internal:3101"
set_env TOQUEHUB_TAILSCALE_ENABLED "$TOQUEHUB_TAILSCALE_ENABLED"
set_env TOQUEHUB_TAILSCALE_HOSTNAME "$TOQUEHUB_TAILSCALE_HOSTNAME"
set_env TOQUEHUB_TAILSCALE_INSTALLED "$(command -v tailscale >/dev/null 2>&1 && printf true || printf false)"
if [[ -n "$TOQUEHUB_TAILSCALE_AUTHKEY" ]]; then
  set_env TOQUEHUB_TAILSCALE_AUTHKEY "$TOQUEHUB_TAILSCALE_AUTHKEY"
fi

sudo cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$CONFIG_DIR/mosquitto.conf"
sudo systemctl daemon-reload
sudo systemctl enable --now toquehub-remote-agent.service
sudo systemctl enable toquehub-firstboot.service
sudo systemctl start toquehub-firstboot.service

cat <<MSG

ToqueHub is installed.
Open:
  $(origin_for_host "$TOQUEHUB_LOCAL_HOSTNAME.local" "$HTTP_PORT")

Useful commands:
  toquehub status
  toquehub logs
  toquehub update
  toquehub remote-status
  toquehub remote-up
MSG
