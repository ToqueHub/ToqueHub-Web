#!/usr/bin/env bash

infer_zigbee_adapter_type() {
  local serial_port
  serial_port="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

  case "$serial_port" in
    *mg21*|*dongle_lite*|*dongle_plus_v2*|*dongle-plus-v2*|*efr32*|*silabs*|*silicon_labs*)
      printf 'ember\n'
      ;;
    *)
      printf 'zstack\n'
      ;;
  esac
}
