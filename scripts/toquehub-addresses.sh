#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TOQUEHUB_ENV_FILE:-$ROOT_DIR/.env.docker}"

if [[ ! -f "$ENV_FILE" && -f /etc/toquehub/toquehub.env ]]; then
  ENV_FILE="/etc/toquehub/toquehub.env"
fi

get_env() {
  local key="$1"
  local fallback="${2:-}"
  local value=""

  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
  fi

  value="${value%\"}"
  value="${value#\"}"
  printf '%s\n' "${!key:-${value:-$fallback}}"
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

server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

http_port="$(get_env TOQUEHUB_HTTP_PORT 8080)"
local_hostname="$(get_env TOQUEHUB_LOCAL_HOSTNAME toquehub)"
local_url="$(origin_for_host "$local_hostname.local" "$http_port")"
ip="$(server_ip || true)"
ip_url=""
if [[ -n "$ip" ]]; then
  ip_url="$(origin_for_host "$ip" "$http_port")"
fi

cat <<MSG
Adresses ToqueHub
-----------------
Depuis un ordinateur connecte au meme reseau, ouvre:
  $local_url

Si cette adresse ne charge pas, utilise l'adresse IP de secours:
  ${ip_url:-IP non detectee}

Fichier env:
  $ENV_FILE
MSG

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet avahi-daemon 2>/dev/null; then
    printf '\nmDNS/Avahi:\n  actif\n'
  else
    printf '\nmDNS/Avahi:\n  inactif ou indisponible\n'
  fi
fi

if command -v getent >/dev/null 2>&1; then
  printf '\nResolution mDNS:\n'
  if getent hosts "$local_hostname.local" >/dev/null 2>&1; then
    printf '  OK: %s\n' "$(getent hosts "$local_hostname.local" | head -1)"
  else
    printf '  KO: %s.local ne se resout pas sur cette machine.\n' "$local_hostname"
    printf '  Correctif: sudo apt-get install -y avahi-daemon libnss-mdns && sudo systemctl enable --now avahi-daemon && sudo hostnamectl set-hostname %s\n' "$local_hostname"
    printf '  Verifie aussi /etc/nsswitch.conf: la ligne hosts doit contenir mdns4_minimal.\n'
  fi
fi

probe_url() {
  local url="$1"
  local attempts="${2:-1}"
  local delay="${3:-2}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl -fsS --max-time 3 "$url/api/discovery" >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$attempt" -lt "$attempts" ]]; then
      sleep "$delay"
    fi
  done

  return 1
}

if command -v curl >/dev/null 2>&1; then
  printf '\nTest API discovery:\n'
  if probe_url "$local_url" 10 3; then
    printf '  OK: %s/api/discovery\n' "$local_url"
  elif [[ -n "$ip_url" ]] && probe_url "$ip_url" 3 2; then
    printf '  OK via IP: %s/api/discovery\n' "$ip_url"
    printf '  Le serveur marche; si %s ne repond pas, le blocage vient du mDNS/multicast du reseau.\n' "$local_url"
  else
    printf '  KO: ToqueHub ne repond pas encore sur /api/discovery.\n'
    printf '  A verifier: docker compose --env-file %s ps\n' "$ENV_FILE"
    printf '  Puis: curl -v %s/api/discovery\n' "${ip_url:-$local_url}"
  fi
fi
