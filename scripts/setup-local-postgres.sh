#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${TOQUEHUB_DB_NAME:-toquehub}"
DB_USER="${TOQUEHUB_DB_USER:-toquehub}"
DB_PASSWORD="${TOQUEHUB_DB_PASSWORD:-toquehub}"
DB_HOST="${TOQUEHUB_DB_HOST:-localhost}"
DB_PORT="${TOQUEHUB_DB_PORT:-5432}"

POSTGRES_CONTAINER=""
PSQL_SOURCE="local"
PSQL=()
PSQL_DB=()

docker_container_running() {
  local container="$1"
  [[ -n "$container" ]] || return 1
  docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q '^true$'
}

find_docker_postgres_container() {
  local container

  if [[ -n "${TOQUEHUB_POSTGRES_CONTAINER:-}" ]] && docker_container_running "$TOQUEHUB_POSTGRES_CONTAINER"; then
    printf '%s\n' "$TOQUEHUB_POSTGRES_CONTAINER"
    return 0
  fi

  container="$(docker compose ps -q postgres 2>/dev/null | head -1 || true)"
  if docker_container_running "$container"; then
    printf '%s\n' "$container"
    return 0
  fi

  container="$(docker ps --format '{{.Names}}' \
    | grep -E '(^|[-_])toquehub.*postgres|postgres.*toquehub|(^|[-_])postgres($|[-_])' \
    | head -1 || true)"
  if docker_container_running "$container"; then
    printf '%s\n' "$container"
    return 0
  fi

  return 1
}

docker_container_env() {
  local container="$1"
  local key="$2"
  docker exec "$container" printenv "$key" 2>/dev/null || true
}

use_docker_postgres() {
  local container="$1"
  local postgres_user
  local postgres_password

  postgres_user="${TOQUEHUB_POSTGRES_SUPERUSER:-$(docker_container_env "$container" POSTGRES_USER)}"
  postgres_user="${postgres_user:-postgres}"
  postgres_password="${TOQUEHUB_POSTGRES_SUPERUSER_PASSWORD:-$(docker_container_env "$container" POSTGRES_PASSWORD)}"

  POSTGRES_CONTAINER="$container"
  PSQL_SOURCE="docker:$container"
  PSQL=(docker exec -i -e "PGPASSWORD=$postgres_password" "$container" psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d postgres)
  PSQL_DB=(docker exec -i -e "PGPASSWORD=$postgres_password" "$container" psql -v ON_ERROR_STOP=1 -U "$postgres_user" -d "$DB_NAME")
}

use_local_postgres() {
  PSQL_SOURCE="local"
  PSQL=(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d postgres)
  PSQL_DB=(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME")
}

if command -v psql >/dev/null 2>&1; then
  use_local_postgres
elif command -v docker >/dev/null 2>&1 && POSTGRES_CONTAINER="$(find_docker_postgres_container)"; then
  echo "psql was not found locally; using PostgreSQL from Docker container \"$POSTGRES_CONTAINER\"."
  use_docker_postgres "$POSTGRES_CONTAINER"
else
  cat >&2 <<'MSG'
psql is required but was not found, and no running Docker PostgreSQL container was detected.
Install PostgreSQL first, or start the ToqueHub PostgreSQL container, for example:
  macOS Homebrew: brew install postgresql@16 && brew services start postgresql@16
  Debian/Ubuntu:  sudo apt install postgresql postgresql-client
  Docker:         docker compose --env-file .env.docker up -d postgres
MSG
  exit 1
fi

if [[ "$PSQL_SOURCE" == "local" ]]; then
  if ! command -v pg_isready >/dev/null 2>&1; then
    cat >&2 <<'MSG'
pg_isready is required but was not found. Install the PostgreSQL client tools first.
MSG
    exit 1
  fi

  if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    cat >&2 <<MSG
PostgreSQL is not reachable on $DB_HOST:$DB_PORT.
Start PostgreSQL, then rerun this script.
MSG
    exit 1
  fi
else
  if ! docker exec "$POSTGRES_CONTAINER" pg_isready -U "${TOQUEHUB_POSTGRES_SUPERUSER:-$DB_USER}" >/dev/null 2>&1; then
    cat >&2 <<MSG
PostgreSQL is not ready in Docker container "$POSTGRES_CONTAINER".
Start PostgreSQL, then rerun this script.
MSG
    exit 1
  fi
fi

if ! "${PSQL[@]}" -tAc "SELECT 1" >/dev/null 2>&1; then
  cat >&2 <<MSG
Could not connect to PostgreSQL database "postgres" with your current OS user.
Try running this script as a PostgreSQL superuser, set TOQUEHUB_POSTGRES_CONTAINER/TOQUEHUB_POSTGRES_SUPERUSER, or create the role/database manually.
MSG
  exit 1
fi

USER_EXISTS=$("${PSQL[@]}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'")
if [[ "$USER_EXISTS" != "1" ]]; then
  "${PSQL[@]}" -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASSWORD' CREATEDB;"
else
  "${PSQL[@]}" -c "ALTER USER \"$DB_USER\" WITH PASSWORD '$DB_PASSWORD' CREATEDB;"
fi

DB_EXISTS=$("${PSQL[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")
if [[ "$DB_EXISTS" != "1" ]]; then
  "${PSQL[@]}" -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
fi

"${PSQL[@]}" -c "ALTER DATABASE \"$DB_NAME\" OWNER TO \"$DB_USER\";"
"${PSQL[@]}" -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$DB_USER\";"

"${PSQL_DB[@]}" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";" >/dev/null

cat <<MSG
Local PostgreSQL database is ready. The role also has CREATEDB so Prisma Migrate can create its shadow database.

Use this DATABASE_URL in .env:
postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?schema=public

Next commands:
  npm run prisma:migrate
  npm run prisma:seed
MSG
