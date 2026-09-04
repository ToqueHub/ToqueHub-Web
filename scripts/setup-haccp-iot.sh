#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
Z2M_DIR="$ROOT_DIR/.toquehub-iot/zigbee2mqtt"
Z2M_DATA_DIR="$Z2M_DIR/data"
MOSQUITTO_CONF="$ROOT_DIR/.toquehub-iot/mosquitto.conf"
MOSQUITTO_LOG="$ROOT_DIR/.toquehub-iot/mosquitto.log"
MQTT_URL="${MQTT_URL:-mqtt://localhost:1883}"
BASE_TOPIC="${ZIGBEE2MQTT_BASE_TOPIC:-zigbee2mqtt}"
SERIAL_PORT="${SERIAL_PORT:-}"
INSTALL_ZIGBEE2MQTT="${INSTALL_ZIGBEE2MQTT:-1}"
START_MOSQUITTO="${START_MOSQUITTO:-1}"

usage() {
  cat <<'MSG'
Usage: npm run iot:setup -- [options]

Installe et configure l'environnement local HACCP IoT:
  1. Verifie Homebrew et installe Mosquitto si besoin
  2. Demarre le service Mosquitto
  3. Clone Zigbee2MQTT dans .toquehub-iot/zigbee2mqtt
  4. Cree data/configuration.yaml pour Zigbee2MQTT
  5. Ajoute les variables MQTT/HACCP IoT dans .env

Options:
  --serial <path>              Port serie du coordinateur Zigbee
  --mqtt-url <url>             URL MQTT, defaut mqtt://localhost:1883
  --base-topic <topic>         Topic Zigbee2MQTT, defaut zigbee2mqtt
  --no-zigbee2mqtt-install     Ne clone pas / n'installe pas Zigbee2MQTT
  --no-start-mosquitto         Ne demarre pas le service Mosquitto
  -h, --help                   Affiche cette aide

Exemple:
  npm run iot:setup -- --serial /dev/tty.usbserial-0001

Variables equivalentes:
  SERIAL_PORT=/dev/tty.usbserial-0001 npm run iot:setup
MSG
}

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nErreur: %s\n' "$1" >&2
  exit 1
}

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

start_local_mosquitto() {
  write_local_mosquitto_config
  if is_mosquitto_listening; then
    return 0
  fi
  /opt/homebrew/opt/mosquitto/sbin/mosquitto -d -c "$MOSQUITTO_CONF" >> "$MOSQUITTO_LOG" 2>&1
  sleep 1
  is_mosquitto_listening
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial)
      SERIAL_PORT="${2:-}"
      [[ -n "$SERIAL_PORT" ]] || fail "--serial attend un chemin"
      shift 2
      ;;
    --mqtt-url)
      MQTT_URL="${2:-}"
      [[ -n "$MQTT_URL" ]] || fail "--mqtt-url attend une URL"
      shift 2
      ;;
    --base-topic)
      BASE_TOPIC="${2:-}"
      [[ -n "$BASE_TOPIC" ]] || fail "--base-topic attend un topic"
      shift 2
      ;;
    --no-zigbee2mqtt-install)
      INSTALL_ZIGBEE2MQTT=0
      shift
      ;;
    --no-start-mosquitto)
      START_MOSQUITTO=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "option inconnue: $1"
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "ce script automatise l'installation locale macOS. Pour Linux/Raspberry Pi, installe Mosquitto et Zigbee2MQTT sur la machine qui porte le dongle, puis garde MQTT_URL=$MQTT_URL cote ToqueHub."
fi

cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  log "Creation de .env depuis .env.example"
  cp .env.example .env
fi

log "Verification de Homebrew"
command -v brew >/dev/null 2>&1 || fail "Homebrew est requis. Installe-le depuis https://brew.sh puis relance npm run iot:setup"

log "Installation de Mosquitto si necessaire"
if ! brew list mosquitto >/dev/null 2>&1; then
  brew install mosquitto
fi

if [[ "$START_MOSQUITTO" == "1" ]]; then
  log "Demarrage de Mosquitto"
  if ! brew services start mosquitto >/dev/null; then
    printf 'Service Homebrew indisponible, demarrage local de Mosquitto pour ce projet.\n'
    start_local_mosquitto || fail "Mosquitto ne demarre pas. Consulte $MOSQUITTO_LOG"
  fi
fi

if [[ -z "$SERIAL_PORT" ]]; then
  log "Detection du coordinateur Zigbee USB"
  shopt -s nullglob
  candidates=(
    /dev/tty.usbserial*
    /dev/tty.usbmodem*
    /dev/tty.SLAB_USBtoUART*
    /dev/tty.wchusbserial*
  )
  shopt -u nullglob

  if [[ ${#candidates[@]} -eq 1 ]]; then
    SERIAL_PORT="${candidates[0]}"
    printf 'Coordinateur detecte: %s\n' "$SERIAL_PORT"
  elif [[ ${#candidates[@]} -gt 1 ]]; then
    printf 'Ports detectes:\n'
    for i in "${!candidates[@]}"; do
      printf '  %s) %s\n' "$((i + 1))" "${candidates[$i]}"
    done
    printf 'Choisis le numero du coordinateur Zigbee: '
    read -r selected
    [[ "$selected" =~ ^[0-9]+$ ]] || fail "selection invalide"
    index=$((selected - 1))
    [[ $index -ge 0 && $index -lt ${#candidates[@]} ]] || fail "selection hors liste"
    SERIAL_PORT="${candidates[$index]}"
  else
    SERIAL_PORT="/dev/tty.usbserial-CHANGE_ME"
    printf '\nAucun coordinateur USB detecte. La configuration sera creee avec %s.\n' "$SERIAL_PORT"
    printf 'Branche le dongle puis remplace le port dans %s/data/configuration.yaml.\n' "$Z2M_DIR"
  fi
fi

if [[ "$INSTALL_ZIGBEE2MQTT" == "1" ]]; then
  log "Installation de Zigbee2MQTT"
  mkdir -p "$ROOT_DIR/.toquehub-iot"
  if [[ ! -d "$Z2M_DIR/.git" ]]; then
    git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git "$Z2M_DIR"
  else
    git -C "$Z2M_DIR" pull --ff-only
  fi
  corepack enable
  COREPACK_ENABLE_PROJECT_SPEC=0 corepack prepare pnpm@10.18.3 --activate
  COREPACK_ENABLE_PROJECT_SPEC=0 pnpm --dir "$Z2M_DIR" install --frozen-lockfile
  COREPACK_ENABLE_PROJECT_SPEC=0 pnpm --dir "$Z2M_DIR" run build
else
  mkdir -p "$Z2M_DIR"
fi

log "Configuration de Zigbee2MQTT"
write_local_mosquitto_config
mkdir -p "$Z2M_DATA_DIR"
CONFIG_FILE="$Z2M_DATA_DIR/configuration.yaml"
if [[ -f "$CONFIG_FILE" ]]; then
  printf 'Configuration existante conservee: %s\n' "$CONFIG_FILE"
else
  {
    printf 'homeassistant: false\n'
    printf 'permit_join: false\n'
    printf 'mqtt:\n'
    printf '  base_topic: %s\n' "$BASE_TOPIC"
    printf '  server: %s\n' "$MQTT_URL"
    printf 'serial:\n'
    printf '  port: %s\n' "$SERIAL_PORT"
    printf 'frontend:\n'
    printf '  enabled: true\n'
    printf '  port: 8080\n'
    printf 'advanced:\n'
    printf '  log_level: info\n'
  } > "$CONFIG_FILE"
fi

set_env() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" .env; then
    awk -v key="$key" -v value="$value" 'BEGIN { q = sprintf("%c", 34) } $0 ~ "^" key "=" { print key "=" q value q; next } { print }' .env > "$tmp"
  else
    cp .env "$tmp"
    printf '%s="%s"\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" .env
}

log "Mise a jour de .env pour ToqueHub"
set_env "MQTT_URL" "$MQTT_URL"
set_env "MQTT_USERNAME" "${MQTT_USERNAME:-}"
set_env "MQTT_PASSWORD" "${MQTT_PASSWORD:-}"
set_env "ZIGBEE2MQTT_BASE_TOPIC" "$BASE_TOPIC"
set_env "ZIGBEE2MQTT_FRONTEND_URL" "${ZIGBEE2MQTT_FRONTEND_URL:-http://localhost:8080}"
set_env "ZIGBEE_ADAPTER_PATH" "$SERIAL_PORT"
set_env "HACCP_SENSOR_OFFLINE_AFTER_MINUTES" "${HACCP_SENSOR_OFFLINE_AFTER_MINUTES:-30}"
set_env "HACCP_PAIRING_DURATION_SECONDS" "${HACCP_PAIRING_DURATION_SECONDS:-180}"

cat <<MSG

Installation IoT terminee.

Fichiers crees:
  $CONFIG_FILE
  $ROOT_DIR/.env

Prochain demarrage:
  npm run iot:start
  npm run api:dev
  npm run web:dev

Interface Zigbee2MQTT:
  http://localhost:8080

Dans ToqueHub:
  HACCP -> Capteurs -> Ajouter un capteur
MSG
