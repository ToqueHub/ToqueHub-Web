#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${TOQUEHUB_INSTALL_DIR:-/opt/toquehub}"
CONFIG_DIR="${TOQUEHUB_CONFIG_DIR:-/etc/toquehub}"
DATA_DIR="${TOQUEHUB_DATA_DIR:-/var/lib/toquehub}"
ENV_FILE="$CONFIG_DIR/toquehub.env"
HTTP_PORT="${TOQUEHUB_HTTP_PORT:-8080}"
TOQUEHUB_TAILSCALE_ENABLED="${TOQUEHUB_TAILSCALE_ENABLED:-true}"
TOQUEHUB_TAILSCALE_AUTHKEY="${TOQUEHUB_TAILSCALE_AUTHKEY:-}"
TOQUEHUB_TAILSCALE_HOSTNAME="${TOQUEHUB_TAILSCALE_HOSTNAME:-toquehub}"

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
install_tailscale

sudo mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
sudo cp "$ROOT_DIR/docker-compose.pi.yml" "$INSTALL_DIR/docker-compose.pi.yml"
sudo cp "$ROOT_DIR/.env.raspberry.example" "$INSTALL_DIR/toquehub.env.example"
sudo cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$INSTALL_DIR/mosquitto.conf"
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/bin/toquehub" /usr/local/bin/toquehub
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/sbin/toquehub-firstboot" /usr/local/sbin/toquehub-firstboot
sudo cp "$ROOT_DIR/scripts/toquehub-remote-agent.py" /usr/local/sbin/toquehub-remote-agent
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub.service" /etc/systemd/system/toquehub.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-firstboot.service" /etc/systemd/system/toquehub-firstboot.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-remote-agent.service" /etc/systemd/system/toquehub-remote-agent.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-zigbee.service" /etc/systemd/system/toquehub-zigbee.service
sudo chmod +x /usr/local/bin/toquehub /usr/local/sbin/toquehub-firstboot /usr/local/sbin/toquehub-remote-agent

if [[ ! -f "$ENV_FILE" ]]; then
  sudo cp "$ROOT_DIR/.env.raspberry.example" "$ENV_FILE"
fi

set_env TOQUEHUB_DATA_DIR "$DATA_DIR"
set_env TOQUEHUB_CONFIG_DIR "$CONFIG_DIR"
set_env TOQUEHUB_HTTP_PORT "$HTTP_PORT"
set_env TOQUEHUB_WEB_URL "http://toquehub.local:$HTTP_PORT"
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
  http://toquehub.local:$HTTP_PORT

Useful commands:
  toquehub status
  toquehub logs
  toquehub update
  toquehub remote-status
  toquehub remote-up
MSG
