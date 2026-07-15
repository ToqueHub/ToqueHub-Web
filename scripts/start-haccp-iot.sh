#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
Z2M_DIR="$ROOT_DIR/.toquehub-iot/zigbee2mqtt"
Z2M_DATA_DIR="$Z2M_DIR/data"
MOSQUITTO_CONF="$ROOT_DIR/.toquehub-iot/mosquitto.conf"
MOSQUITTO_LOG="$ROOT_DIR/.toquehub-iot/mosquitto.log"

if [[ ! -d "$Z2M_DIR" ]]; then
  cat >&2 <<'MSG'
Zigbee2MQTT n'est pas encore installe localement.

Lance d'abord:
  npm run iot:setup
MSG
  exit 1
fi

write_local_mosquitto_config() {
  mkdir -p "$ROOT_DIR/.toquehub-iot"
  if [[ ! -f "$MOSQUITTO_CONF" ]]; then
    {
      printf 'listener 1883 127.0.0.1\n'
      printf 'allow_anonymous true\n'
      printf 'persistence true\n'
      printf 'persistence_location %s/.toquehub-iot/\n' "$ROOT_DIR"
    } > "$MOSQUITTO_CONF"
  fi
}

is_mosquitto_listening() {
  lsof -nP -iTCP:1883 -sTCP:LISTEN >/dev/null 2>&1
}

if ! is_mosquitto_listening; then
  if command -v brew >/dev/null 2>&1 && brew list mosquitto >/dev/null 2>&1; then
    brew services start mosquitto >/dev/null || true
  fi
  if ! is_mosquitto_listening; then
    write_local_mosquitto_config
    /opt/homebrew/opt/mosquitto/sbin/mosquitto -d -c "$MOSQUITTO_CONF" >> "$MOSQUITTO_LOG" 2>&1
    sleep 1
  fi
fi

if ! is_mosquitto_listening; then
  echo "Mosquitto ne demarre pas. Consulte $MOSQUITTO_LOG" >&2
  exit 1
fi

echo "Demarrage Zigbee2MQTT avec data dir: $Z2M_DATA_DIR"
echo "Frontend Zigbee2MQTT: http://localhost:8080"
corepack enable
COREPACK_ENABLE_PROJECT_SPEC=0 corepack prepare pnpm@10.18.3 --activate
COREPACK_ENABLE_PROJECT_SPEC=0 ZIGBEE2MQTT_DATA="$Z2M_DATA_DIR" pnpm --dir "$Z2M_DIR" start
