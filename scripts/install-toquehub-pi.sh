#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${TOQUEHUB_INSTALL_DIR:-/opt/toquehub}"
CONFIG_DIR="${TOQUEHUB_CONFIG_DIR:-/etc/toquehub}"
DATA_DIR="${TOQUEHUB_DATA_DIR:-/var/lib/toquehub}"
ENV_FILE="$CONFIG_DIR/toquehub.env"

usage() {
  cat <<'MSG'
Usage: scripts/install-toquehub-pi.sh

Install ToqueHub on Raspberry Pi OS 64-bit using Docker.

This script:
  - installs Docker if missing
  - copies ToqueHub Compose/runtime files
  - generates secrets
  - enables systemd services
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
sudo apt-get install -y ca-certificates curl openssl postgresql-client

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo systemctl enable --now docker

sudo mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
sudo cp "$ROOT_DIR/docker-compose.pi.yml" "$INSTALL_DIR/docker-compose.pi.yml"
sudo cp "$ROOT_DIR/.env.raspberry.example" "$INSTALL_DIR/toquehub.env.example"
sudo cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$INSTALL_DIR/mosquitto.conf"
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/bin/toquehub" /usr/local/bin/toquehub
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/usr/local/sbin/toquehub-firstboot" /usr/local/sbin/toquehub-firstboot
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub.service" /etc/systemd/system/toquehub.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-firstboot.service" /etc/systemd/system/toquehub-firstboot.service
sudo cp "$ROOT_DIR/raspberry-pi/files/rootfs/etc/systemd/system/toquehub-zigbee.service" /etc/systemd/system/toquehub-zigbee.service
sudo chmod +x /usr/local/bin/toquehub /usr/local/sbin/toquehub-firstboot

if [[ ! -f "$ENV_FILE" ]]; then
  sudo cp "$ROOT_DIR/.env.raspberry.example" "$ENV_FILE"
fi

set_env TOQUEHUB_DATA_DIR "$DATA_DIR"
set_env TOQUEHUB_CONFIG_DIR "$CONFIG_DIR"
set_env POSTGRES_PASSWORD "$(secret)"
set_env JWT_SECRET "$(secret)"
set_env BACKUP_CLOUD_ENCRYPTION_KEY "$(secret)"
set_env TOQUEHUB_UPDATER_SECRET "$(secret)"

sudo cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$CONFIG_DIR/mosquitto.conf"
sudo systemctl daemon-reload
sudo systemctl enable toquehub-firstboot.service
sudo systemctl start toquehub-firstboot.service

cat <<MSG

ToqueHub is installed.
Open:
  http://toquehub.local:8080

Useful commands:
  toquehub status
  toquehub logs
  toquehub update
MSG
