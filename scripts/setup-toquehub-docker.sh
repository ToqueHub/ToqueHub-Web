#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.docker"
IOT_DATA_DIR="$ROOT_DIR/.toquehub-iot/zigbee2mqtt-data"
IOT_CONFIG_FILE="$IOT_DATA_DIR/configuration.yaml"

log() {
  printf '\n==> %s\n' "$1"
}

detect_serial_port() {
  shopt -s nullglob
  local candidates=(
    /dev/serial/by-id/*
    /dev/ttyUSB*
    /dev/ttyACM*
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

  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '$0 ~ "^" key "=" { print key "=" value; next } { print }' "$ENV_FILE" > "$tmp"
  else
    cp "$ENV_FILE" "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$ENV_FILE"
}

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker n'est pas disponible ici; la configuration sera preparee, mais le lancement necessitera Docker." >&2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/.env.docker.example" "$ENV_FILE"
fi

SERIAL_PORT="${ZIGBEE_ADAPTER_PATH:-$(detect_serial_port || true)}"
if [[ -z "$SERIAL_PORT" ]]; then
  SERIAL_PORT="/dev/ttyUSB0"
  printf 'Aucun coordinateur Zigbee detecte. Zigbee2MQTT utilisera %s par defaut.\n' "$SERIAL_PORT"
fi

BASE_TOPIC="$(grep -E '^ZIGBEE2MQTT_BASE_TOPIC=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
BASE_TOPIC="${BASE_TOPIC:-zigbee2mqtt}"

log "Preparation de la configuration Docker"
set_env "ZIGBEE_ADAPTER_PATH" "$SERIAL_PORT"
set_env "ZIGBEE2MQTT_FRONTEND_URL" "http://localhost:$(grep -E '^ZIGBEE2MQTT_HTTP_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- || printf '8081')"

mkdir -p "$IOT_DATA_DIR"
if [[ ! -f "$IOT_CONFIG_FILE" ]]; then
  {
    printf 'homeassistant: false\n'
    printf 'permit_join: false\n'
    printf 'mqtt:\n'
    printf '  base_topic: %s\n' "$BASE_TOPIC"
    printf '  server: mqtt://mosquitto:1883\n'
    printf 'serial:\n'
    printf '  port: %s\n' "$SERIAL_PORT"
    printf 'frontend:\n'
    printf '  enabled: true\n'
    printf '  port: 8080\n'
    printf 'advanced:\n'
    printf '  log_level: info\n'
  } > "$IOT_CONFIG_FILE"
else
  printf 'Configuration Zigbee2MQTT existante conservee: %s\n' "$IOT_CONFIG_FILE"
fi

cat <<MSG

Prototype Docker pret.
  Fichier env: $ENV_FILE
  Config Zigbee2MQTT: $IOT_CONFIG_FILE
  Coordinateur Zigbee: $SERIAL_PORT

Lancement:
  docker compose --env-file .env.docker up -d --build
MSG
