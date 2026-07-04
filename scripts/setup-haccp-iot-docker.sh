#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.toquehub-iot/zigbee2mqtt-data"
CONFIG_FILE="$DATA_DIR/configuration.yaml"
SERIAL_PORT="${ZIGBEE_ADAPTER_PATH:-}"
BASE_TOPIC="${ZIGBEE2MQTT_BASE_TOPIC:-zigbee2mqtt}"

log() {
  printf '\n==> %s\n' "$1"
}

detect_serial_port() {
  shopt -s nullglob
  local candidates=(
    /dev/ttyUSB*
    /dev/ttyACM*
    /dev/serial/by-id/*
  )
  shopt -u nullglob
  if [[ ${#candidates[@]} -gt 0 ]]; then
    printf '%s\n' "${candidates[0]}"
  fi
}

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  fi
  if grep -q "^${key}=" "$ROOT_DIR/.env"; then
    awk -v key="$key" -v value="$value" 'BEGIN { q = sprintf("%c", 34) } $0 ~ "^" key "=" { print key "=" q value q; next } { print }' "$ROOT_DIR/.env" > "$tmp"
  else
    cp "$ROOT_DIR/.env" "$tmp"
    printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$ROOT_DIR/.env"
}

cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || {
  echo "Docker est requis pour le profil IoT Compose." >&2
  exit 1
}

if [[ -z "$SERIAL_PORT" ]]; then
  SERIAL_PORT="$(detect_serial_port || true)"
fi

if [[ -z "$SERIAL_PORT" ]]; then
  SERIAL_PORT="/dev/ttyUSB0"
  printf 'Aucun coordinateur Zigbee detecte. Le profil Docker utilisera %s par defaut.\n' "$SERIAL_PORT"
fi

log "Configuration Zigbee2MQTT Docker"
mkdir -p "$DATA_DIR"
if [[ ! -f "$CONFIG_FILE" ]]; then
  {
    printf 'homeassistant: false\n'
    printf 'permit_join: false\n'
    printf 'mqtt:\n'
    printf '  base_topic: %s\n' "$BASE_TOPIC"
    printf '  server: mqtt://mosquitto:1883\n'
    printf 'serial:\n'
    printf '  port: /dev/ttyUSB0\n'
    printf 'frontend:\n'
    printf '  enabled: true\n'
    printf '  port: 8080\n'
    printf 'advanced:\n'
    printf '  log_level: info\n'
  } > "$CONFIG_FILE"
else
  printf 'Configuration existante conservee: %s\n' "$CONFIG_FILE"
fi

set_env "MQTT_URL" "mqtt://localhost:1883"
set_env "ZIGBEE2MQTT_BASE_TOPIC" "$BASE_TOPIC"
set_env "ZIGBEE2MQTT_FRONTEND_URL" "http://localhost:8080"
set_env "ZIGBEE_ADAPTER_PATH" "$SERIAL_PORT"

cat <<MSG

Profil IoT Docker pret.
  Coordinateur host: $SERIAL_PORT
  Coordinateur conteneur: /dev/ttyUSB0
  Config: $CONFIG_FILE
MSG
