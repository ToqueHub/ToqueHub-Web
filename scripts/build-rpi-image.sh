#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${TOQUEHUB_RPI_WORK_DIR:-$ROOT_DIR/raspberry-pi/build}"
RPI_IMAGE_GEN_REPO="${RPI_IMAGE_GEN_REPO:-https://github.com/raspberrypi/rpi-image-gen.git}"
RPI_IMAGE_GEN_REF="${RPI_IMAGE_GEN_REF:-v2.7.0}"
PROJECT_DIR="$WORK_DIR/toquehub-project"
IMAGE_NAME="${TOQUEHUB_RPI_IMAGE_NAME:-}"
DEFAULT_RELEASE_TAG="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT_DIR/package.json" | head -1)"
RELEASE_TAG="${TOQUEHUB_RPI_RELEASE_TAG:-$DEFAULT_RELEASE_TAG}"
DEVICE="${TOQUEHUB_RPI_DEVICE:-rpi4}"
SSH_PUBLIC_KEY_FILE="${TOQUEHUB_RPI_SSH_PUBLIC_KEY_FILE:-}"
PREPARE_ONLY="false"

usage() {
  cat <<'MSG'
Usage: scripts/build-rpi-image.sh [options]

Prepare and build a lightweight Raspberry Pi OS Lite 64-bit ToqueHub image.

Options:
  --release <version>           ToqueHub image tag downloaded on first boot
  --device <rpi4|rpi5>          Raspberry Pi target, default: rpi4
  --ssh-public-key <path>       Public key installed for the toquehub user
  --prepare-only                Prepare the rpi-image-gen project without building
  -h, --help                    Show this help

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
  TOQUEHUB_RPI_RELEASE_TAG
  TOQUEHUB_RPI_DEVICE
  TOQUEHUB_RPI_SSH_PUBLIC_KEY_FILE
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
    --release)
      RELEASE_TAG="${2:-}"
      shift 2
      ;;
    --device)
      DEVICE="${2:-}"
      shift 2
      ;;
    --ssh-public-key)
      SSH_PUBLIC_KEY_FILE="${2:-}"
      shift 2
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
[[ "$RELEASE_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([._-][A-Za-z0-9.-]+)?$ ]] || {
  echo "Invalid ToqueHub release tag: $RELEASE_TAG" >&2
  exit 1
}
[[ "$DEVICE" == "rpi4" || "$DEVICE" == "rpi5" ]] || {
  echo "Invalid Raspberry Pi target: $DEVICE (expected rpi4 or rpi5)" >&2
  exit 1
}
if [[ -z "$IMAGE_NAME" ]]; then
  IMAGE_NAME="toquehub-${DEVICE}-${RELEASE_TAG}"
fi
[[ -n "$SSH_PUBLIC_KEY_FILE" && -f "$SSH_PUBLIC_KEY_FILE" ]] || {
  echo "A readable SSH public key is required (--ssh-public-key)." >&2
  exit 1
}
grep -Eq '^ssh-(ed25519|rsa|ecdsa-sha2-nistp(256|384|521)) ' "$SSH_PUBLIC_KEY_FILE" || {
  echo "Unsupported or invalid SSH public key: $SSH_PUBLIC_KEY_FILE" >&2
  exit 1
}

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
sed -i "s/^TOQUEHUB_IMAGE_TAG=.*/TOQUEHUB_IMAGE_TAG=$RELEASE_TAG/" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/toquehub.env.example"
cp "$ROOT_DIR/docker/iot/mosquitto.conf" "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/mosquitto.conf"
cp "$ROOT_DIR/scripts/toquehub-remote-agent.py" "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-remote-agent"
chmod +x \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/bin/toquehub" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/bin/toquehub-addresses" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-grow-root" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-remote-agent" \
  "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-firstboot"

test -x "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/usr/local/sbin/toquehub-remote-agent"

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
  ./rpi-image-gen build -S "$PROJECT_DIR" -c "$PROJECT_DIR/project.yaml" -- \
    IGconf_device_layer="$DEVICE" \
    IGconf_image_name="$IMAGE_NAME" \
    "IGconf_ssh_pubkey_user1=$(< "$SSH_PUBLIC_KEY_FILE")"
MSG
  exit 0
fi

cd "$WORK_DIR/rpi-image-gen"
./rpi-image-gen build -S "$PROJECT_DIR" -c "$PROJECT_DIR/project.yaml" -- \
  IGconf_device_layer="$DEVICE" \
  IGconf_image_name="$IMAGE_NAME" \
  "IGconf_ssh_pubkey_user1=$(< "$SSH_PUBLIC_KEY_FILE")"
