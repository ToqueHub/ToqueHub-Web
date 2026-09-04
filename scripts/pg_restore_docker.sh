#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${POSTGRES_DOCKER_IMAGE:-postgres:15}"

args=()
for arg in "$@"; do
  arg="${arg//localhost/host.docker.internal}"
  arg="${arg//127.0.0.1/host.docker.internal}"
  args+=("$arg")
done

exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${ROOT_DIR}:${ROOT_DIR}" \
  -w "${ROOT_DIR}" \
  "${IMAGE}" \
  pg_restore "${args[@]}"
