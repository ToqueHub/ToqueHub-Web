#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/zigbee-adapter.sh"

assert_adapter() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(infer_zigbee_adapter_type "$path")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected %s for %s, got %s\n' "$expected" "$path" "$actual" >&2
    exit 1
  fi
}

assert_adapter '/dev/serial/by-id/usb-ITEAD_SONOFF_Zigbee_3.0_USB_Dongle_Plus_V2-if00-port0' ember
assert_adapter '/dev/serial/by-id/usb-Silicon_Labs_CP2102N_EFR32MG21-if00-port0' ember
assert_adapter '/dev/serial/by-id/usb-SONOFF_Dongle_Lite-if00-port0' ember
assert_adapter '/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_1234-if00-port0' zstack

printf 'Zigbee adapter detection tests passed.\n'
