#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${TOQUEHUB_DB_NAME:-toquehub}"
DB_USER="${TOQUEHUB_DB_USER:-toquehub}"
DB_PASSWORD="${TOQUEHUB_DB_PASSWORD:-toquehub}"
DB_HOST="${TOQUEHUB_DB_HOST:-localhost}"
DB_PORT="${TOQUEHUB_DB_PORT:-5432}"

if ! command -v psql >/dev/null 2>&1; then
  cat >&2 <<'MSG'
psql is required but was not found.
Install PostgreSQL first, for example:
  macOS Homebrew: brew install postgresql@16 && brew services start postgresql@16
  Debian/Ubuntu:  sudo apt install postgresql postgresql-client
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

PSQL=(psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d postgres)

if ! "${PSQL[@]}" -tAc "SELECT 1" >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Could not connect to PostgreSQL database "postgres" with your current OS user.
Try running this script as a PostgreSQL superuser, or create the role/database manually.
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

psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";" >/dev/null

cat <<MSG
Local PostgreSQL database is ready. The role also has CREATEDB so Prisma Migrate can create its shadow database.

Use this DATABASE_URL in .env:
postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?schema=public

Next commands:
  npm run prisma:migrate
  npm run prisma:seed
MSG
