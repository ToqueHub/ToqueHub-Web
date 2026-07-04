#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${TOQUEHUB_RPI_WORK_DIR:-$ROOT_DIR/raspberry-pi/build}"
RPI_IMAGE_GEN_REPO="${RPI_IMAGE_GEN_REPO:-https://github.com/raspberrypi/rpi-image-gen.git}"
RPI_IMAGE_GEN_REF="${RPI_IMAGE_GEN_REF:-v2.7.0}"
PROJECT_DIR="$WORK_DIR/toquehub-project"
IMAGE_NAME="${TOQUEHUB_RPI_IMAGE_NAME:-toquehub-pi64}"
PREPARE_ONLY="false"

usage() {
  cat <<'MSG'
Usage: scripts/build-rpi-image.sh [--prepare-only]

Prepare and build a Raspberry Pi OS Lite 64-bit ToqueHub image.

Requirements:
  - Linux or Raspberry Pi OS 64-bit builder
  - sudo
  - git
  - at least 25-30 GB free disk space

Environment:
  TOQUEHUB_RPI_WORK_DIR
  RPI_IMAGE_GEN_REPO
  RPI_IMAGE_GEN_REF        default: v2.7.0
  TOQUEHUB_RPI_IMAGE_NAME
MSG
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --prepare-only)
      PREPARE_ONLY="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  cat >&2 <<'MSG'
Raspberry Pi SD image builds must run on Linux or Raspberry Pi OS.
This Mac can build/publish the Docker images, but not the final SD image.
MSG
  exit 1
fi

command -v git >/dev/null 2>&1 || { echo "git is required." >&2; exit 1; }
command -v sudo >/dev/null 2>&1 || { echo "sudo is required." >&2; exit 1; }

mkdir -p "$WORK_DIR"

if [[ ! -d "$WORK_DIR/rpi-image-gen/.git" ]]; then
  git clone "$RPI_IMAGE_GEN_REPO" "$WORK_DIR/rpi-image-gen"
fi
git -C "$WORK_DIR/rpi-image-gen" fetch --depth 1 origin "$RPI_IMAGE_GEN_REF"
git -C "$WORK_DIR/rpi-image-gen" checkout FETCH_HEAD

sudo "$WORK_DIR/rpi-image-gen/install_deps.sh"

rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cp -R "$ROOT_DIR/raspberry-pi/image/." "$PROJECT_DIR/"
mkdir -p "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay"
cp -R "$ROOT_DIR/raspberry-pi/files/rootfs/." "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/"
mkdir -p \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/etc/toquehub"
cp "$ROOT_DIR/docker-compose.pi.yml" "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/docker-compose.pi.yml"
cp "$ROOT_DIR/.env.raspberry.example" "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/toquehub.env.example"
cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/mosquitto.conf"

chmod +x \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/bin/toquehub" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-firstboot"

cat <<MSG

Project prepared in:
  $PROJECT_DIR

Building image with rpi-image-gen.
Output will be under:
  $WORK_DIR/rpi-image-gen/work
MSG

if [[ "$PREPARE_ONLY" == "true" ]]; then
  cat <<MSG

Prepare-only mode requested; image build skipped.
To build manually:
  cd "$WORK_DIR/rpi-image-gen"
  ./rpi-image-gen build -S "$PROJECT_DIR" -c "$PROJECT_DIR/project.yaml" -- IGconf_image_name="$IMAGE_NAME"
MSG
  exit 0
fi

cd "$WORK_DIR/rpi-image-gen"
./rpi-image-gen build -S "$PROJECT_DIR" -c "$PROJECT_DIR/project.yaml" -- IGconf_image_name="$IMAGE_NAME"
