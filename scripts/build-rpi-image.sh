#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${TOQUEHUB_RPI_WORK_DIR:-$ROOT_DIR/raspberry-pi/build}"
RPI_IMAGE_GEN_REPO="${RPI_IMAGE_GEN_REPO:-https://github.com/raspberrypi/rpi-image-gen.git}"
RPI_IMAGE_GEN_REF="${RPI_IMAGE_GEN_REF:-v2.7.0}"
PROJECT_DIR="$WORK_DIR/toquehub-project"
IMAGE_NAME="${TOQUEHUB_RPI_IMAGE_NAME:-toquehub-pi64}"
RELEASE_TAG="${TOQUEHUB_RPI_RELEASE_TAG:-1.1.45}"
SSH_PUBLIC_KEY_FILE="${TOQUEHUB_RPI_SSH_PUBLIC_KEY_FILE:-}"
CONTAINER_BUNDLE_DIR="${TOQUEHUB_RPI_CONTAINER_BUNDLE_DIR:-}"
PREPARE_ONLY="false"

usage() {
  cat <<'MSG'
Usage: scripts/build-rpi-image.sh [options]

Prepare and build a Raspberry Pi OS Lite 64-bit ToqueHub image.

Options:
  --release <version>           ToqueHub image tag embedded in the appliance
  --ssh-public-key <path>       Public key installed for the toquehub user
  --container-bundle-dir <dir>  Directory containing the four ARM64 image archives
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
  TOQUEHUB_RPI_SSH_PUBLIC_KEY_FILE
  TOQUEHUB_RPI_CONTAINER_BUNDLE_DIR
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
    --ssh-public-key)
      SSH_PUBLIC_KEY_FILE="${2:-}"
      shift 2
      ;;
    --container-bundle-dir)
      CONTAINER_BUNDLE_DIR="${2:-}"
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
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required." >&2; exit 1; }

[[ "$RELEASE_TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+([._-][A-Za-z0-9.-]+)?$ ]] || {
  echo "Invalid ToqueHub release tag: $RELEASE_TAG" >&2
  exit 1
}
[[ -n "$SSH_PUBLIC_KEY_FILE" && -f "$SSH_PUBLIC_KEY_FILE" ]] || {
  echo "A readable SSH public key is required (--ssh-public-key)." >&2
  exit 1
}
grep -Eq '^ssh-(ed25519|rsa|ecdsa-sha2-nistp(256|384|521)) ' "$SSH_PUBLIC_KEY_FILE" || {
  echo "Unsupported or invalid SSH public key: $SSH_PUBLIC_KEY_FILE" >&2
  exit 1
}
[[ -n "$CONTAINER_BUNDLE_DIR" && -d "$CONTAINER_BUNDLE_DIR" ]] || {
  echo "An ARM64 container bundle directory is required (--container-bundle-dir)." >&2
  exit 1
}

IMAGE_ARCHIVES=(
  "toquehub-api-${RELEASE_TAG}-arm64.tar"
  "toquehub-web-${RELEASE_TAG}-arm64.tar"
  "toquehub-mdns-${RELEASE_TAG}-arm64.tar"
  "toquehub-updater-${RELEASE_TAG}-arm64.tar"
)
for archive in "${IMAGE_ARCHIVES[@]}"; do
  [[ -s "$CONTAINER_BUNDLE_DIR/$archive" ]] || {
    echo "Missing ARM64 container archive: $CONTAINER_BUNDLE_DIR/$archive" >&2
    exit 1
  }
done

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
mkdir -p "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/images"
for archive in "${IMAGE_ARCHIVES[@]}"; do
  cp "$CONTAINER_BUNDLE_DIR/$archive" \
    "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/images/$archive"
done
(
  cd "$PROJECT_DIR/layer/toquehub-appliance.rootfs-overlay/opt/toquehub/images"
  sha256sum "${IMAGE_ARCHIVES[@]}" > SHA256SUMS
)

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
    IGconf_image_name="$IMAGE_NAME" \
    "IGconf_ssh_pubkey_user1=$(< "$SSH_PUBLIC_KEY_FILE")"
MSG
  exit 0
fi

cd "$WORK_DIR/rpi-image-gen"
./rpi-image-gen build -S "$PROJECT_DIR" -c "$PROJECT_DIR/project.yaml" -- \
  IGconf_image_name="$IMAGE_NAME" \
  "IGconf_ssh_pubkey_user1=$(< "$SSH_PUBLIC_KEY_FILE")"
