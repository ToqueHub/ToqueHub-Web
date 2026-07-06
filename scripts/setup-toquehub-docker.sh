#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.docker"
IOT_DATA_DIR="$ROOT_DIR/.toquehub-iot/zigbee2mqtt-data"
IOT_CONFIG_FILE="$IOT_DATA_DIR/configuration.yaml"
PROJECT_HINT="$(basename "$ROOT_DIR")"

log() {
  printf '\n==> %s\n' "$1"
}

secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    printf '%s-%s\n' "$(date +%s)" "$RANDOM$RANDOM$RANDOM$RANDOM" | sha256sum | awk '{print $1}'
  fi
}

set_env_if_placeholder() {
  local key="$1"
  local value="$2"
  local current
  current="$(get_env "$key")"

  if [[ -z "$current" || "$current" == replace-with-* || "$current" == change-me-* ]]; then
    set_env "$key" "$value"
  fi
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

infer_zigbee_adapter_type() {
  local serial_port
  serial_port="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

  case "$serial_port" in
    *mg21*|*dongle_lite*|*efr32*|*silabs*|*silicon_labs*)
      printf 'ember\n'
      ;;
    *)
      printf 'zstack\n'
      ;;
  esac
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

  printf '%s\n' "${!key:-${value:-$fallback}}"
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

port_owned_by_toquehub() {
  local port="$1"

  command -v docker >/dev/null 2>&1 || return 1
  docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null \
    | grep -E "(toquehub|${PROJECT_HINT}).*:${port}->" >/dev/null 2>&1
}

port_available_for_toquehub() {
  local port="$1"

  if ! port_in_use "$port"; then
    return 0
  fi

  port_owned_by_toquehub "$port"
}

find_free_port() {
  local start="$1"
  shift
  local reserved=("$@")
  local port
  local reserved_port

  for ((port = start; port < start + 200; port++)); do
    for reserved_port in "${reserved[@]}"; do
      if [[ "$port" == "$reserved_port" ]]; then
        continue 2
      fi
    done

    if ! port_in_use "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
  done

  echo "Aucun port libre trouve a partir de $start." >&2
  exit 1
}

ensure_port() {
  local key="$1"
  local preferred="$2"
  shift 2
  local reserved=("$@")
  local selected

  selected="$(get_env "$key" "$preferred")"

  if [[ ! "$selected" =~ ^[0-9]+$ ]]; then
    selected="$preferred"
  fi

  if port_available_for_toquehub "$selected"; then
    set_env "$key" "$selected"
    printf '%s\n' "$selected"
    return
  fi

  local next_port
  next_port="$(find_free_port "$preferred" "${reserved[@]}")"
  printf '%s occupe, utilisation de %s=%s\n' "$selected" "$key" "$next_port" >&2
  set_env "$key" "$next_port"
  printf '%s\n' "$next_port"
}

update_zigbee_serial_config() {
  local config_file="$1"
  local serial_port="$2"
  local adapter_type="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v serial_port="$serial_port" -v adapter_type="$adapter_type" '
    /^serial:/ { in_serial = 1; print; next }
    in_serial && /^[^[:space:]]/ { in_serial = 0 }
    in_serial && /^[[:space:]]+port:/ { print "  port: " serial_port; updated = 1; next }
    in_serial && /^[[:space:]]+adapter:/ { print "  adapter: " adapter_type; adapter_updated = 1; next }
    { print }
    END {
      if (in_serial && !updated) {
        print "  port: " serial_port
      }
      if (in_serial && !adapter_updated) {
        print "  adapter: " adapter_type
      }
    }
  ' "$config_file" > "$tmp"

  mv "$tmp" "$config_file"
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
ADAPTER_TYPE="$(grep -E '^ZIGBEE_ADAPTER_TYPE=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
if [[ -n "${ZIGBEE_ADAPTER_TYPE:-}" ]]; then
  ADAPTER_TYPE="$ZIGBEE_ADAPTER_TYPE"
elif [[ -z "$ADAPTER_TYPE" || "$ADAPTER_TYPE" == "zstack" ]]; then
  ADAPTER_TYPE="$(infer_zigbee_adapter_type "$SERIAL_PORT")"
fi

log "Preparation de la configuration Docker"
HTTP_PORT="$(ensure_port "TOQUEHUB_HTTP_PORT" "8080")"
ZIGBEE_HTTP_PORT="$(ensure_port "ZIGBEE2MQTT_HTTP_PORT" "8081" "$HTTP_PORT")"
MQTT_PORT="$(ensure_port "MQTT_PORT" "1883" "$HTTP_PORT" "$ZIGBEE_HTTP_PORT")"
set_env_if_placeholder "TOQUEHUB_UPDATER_SECRET" "$(secret)"
set_env_if_placeholder "TOQUEHUB_REMOTE_AGENT_SECRET" "$(secret)"
set_env "TOQUEHUB_REMOTE_AGENT_URL" "${TOQUEHUB_REMOTE_AGENT_URL:-http://host.docker.internal:3101}"
set_env "ZIGBEE_ADAPTER_PATH" "$SERIAL_PORT"
set_env "ZIGBEE_ADAPTER_TYPE" "$ADAPTER_TYPE"
set_env "ZIGBEE2MQTT_FRONTEND_URL" "http://localhost:$ZIGBEE_HTTP_PORT"
set_env "TOQUEHUB_DISCOVERY_ENABLED" "true"
set_env "TOQUEHUB_DISCOVERY_PORT" "$HTTP_PORT"
set_env "TOQUEHUB_WEB_URL" "http://localhost:$HTTP_PORT"
set_env "CORS_ORIGIN" "http://localhost:$HTTP_PORT,http://127.0.0.1:$HTTP_PORT"

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
    printf '  adapter: %s\n' "$ADAPTER_TYPE"
    printf 'frontend:\n'
    printf '  enabled: true\n'
    printf '  port: 8080\n'
    printf 'advanced:\n'
    printf '  log_level: info\n'
  } > "$IOT_CONFIG_FILE"
else
  printf 'Configuration Zigbee2MQTT existante conservee: %s\n' "$IOT_CONFIG_FILE"
  update_zigbee_serial_config "$IOT_CONFIG_FILE" "$SERIAL_PORT" "$ADAPTER_TYPE"
  printf 'Port Zigbee2MQTT mis a jour: %s\n' "$SERIAL_PORT"
  printf 'Adaptateur Zigbee2MQTT mis a jour: %s\n' "$ADAPTER_TYPE"
fi

cat <<MSG

Prototype Docker pret.
  Fichier env: $ENV_FILE
  Config Zigbee2MQTT: $IOT_CONFIG_FILE
  Coordinateur Zigbee: $SERIAL_PORT
  Frontend ToqueHub: http://localhost:$HTTP_PORT
  Zigbee2MQTT: http://localhost:$ZIGBEE_HTTP_PORT
  MQTT host: localhost:$MQTT_PORT

Lancement:
  docker compose --env-file .env.docker up -d --build
MSG
