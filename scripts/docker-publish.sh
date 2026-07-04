#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${TOQUEHUB_IMAGE_REGISTRY:-ghcr.io/toquehub}"
VERSION="${TOQUEHUB_IMAGE_VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'local')"
PLATFORMS="${TOQUEHUB_IMAGE_PLATFORMS:-linux/arm64,linux/amd64}"
PUSH="${TOQUEHUB_DOCKER_PUSH:-1}"
PUBLISH_LATEST="${TOQUEHUB_DOCKER_LATEST:-1}"

usage() {
  cat <<'MSG'
Usage: scripts/docker-publish.sh [options]

Build ToqueHub Docker images for Raspberry Pi and PC targets.

Options:
  --registry <name>       Registry/namespace, default ghcr.io/toquehub
  --platforms <list>      Buildx platforms, default linux/arm64,linux/amd64
  --load                  Load a single-platform image locally instead of pushing
  --push                  Push images to the registry, default
  --no-latest             Do not tag images as latest
  -h, --help              Show help

Environment:
  TOQUEHUB_IMAGE_REGISTRY
  TOQUEHUB_IMAGE_PLATFORMS
  TOQUEHUB_DOCKER_PUSH=0
  TOQUEHUB_DOCKER_LATEST=0
MSG
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry)
      REGISTRY="${2:-}"
      [[ -n "$REGISTRY" ]] || { echo "--registry expects a value" >&2; exit 1; }
      shift 2
      ;;
    --platforms)
      PLATFORMS="${2:-}"
      [[ -n "$PLATFORMS" ]] || { echo "--platforms expects a value" >&2; exit 1; }
      shift 2
      ;;
    --load)
      PUSH=0
      shift
      ;;
    --push)
      PUSH=1
      shift
      ;;
    --no-latest)
      PUBLISH_LATEST=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"
REGISTRY="$(printf '%s' "$REGISTRY" | tr '[:upper:]' '[:lower:]')"

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker buildx version >/dev/null 2>&1 || { echo "Docker Buildx is required." >&2; exit 1; }

if [[ "$PUSH" == "0" && "$PLATFORMS" == *,* ]]; then
  echo "--load only supports a single platform. Set --platforms linux/arm64 or linux/amd64." >&2
  exit 1
fi

OUTPUT_FLAG=(--push)
if [[ "$PUSH" == "0" ]]; then
  OUTPUT_FLAG=(--load)
fi

build_image() {
  local name="$1"
  local dockerfile="$2"
  shift 2
  local tags=(
    -t "$REGISTRY/$name:$VERSION"
    -t "$REGISTRY/$name:$GIT_SHA"
  )

  if [[ "$PUBLISH_LATEST" == "1" ]]; then
    tags=(-t "$REGISTRY/$name:latest" "${tags[@]}")
  fi

  docker buildx build \
    --platform "$PLATFORMS" \
    -f "$dockerfile" \
    "${tags[@]}" \
    "${OUTPUT_FLAG[@]}" \
    "$@" \
    .
}

build_image toquehub-api docker/api.Dockerfile --build-arg TOQUEHUB_VERSION="$VERSION"
build_image toquehub-web docker/web.Dockerfile --build-arg VITE_API_URL=
build_image toquehub-updater docker/updater.Dockerfile

cat <<MSG

Images built:
  $REGISTRY/toquehub-api:$VERSION
  $REGISTRY/toquehub-api:$GIT_SHA
  $REGISTRY/toquehub-web:$VERSION
  $REGISTRY/toquehub-web:$GIT_SHA
  $REGISTRY/toquehub-updater:$VERSION
  $REGISTRY/toquehub-updater:$GIT_SHA
MSG

if [[ "$PUBLISH_LATEST" == "1" ]]; then
  cat <<MSG
  $REGISTRY/toquehub-api:latest
  $REGISTRY/toquehub-web:latest
  $REGISTRY/toquehub-updater:latest
MSG
fi
