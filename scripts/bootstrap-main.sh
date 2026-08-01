#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DB_SETUP="${RUN_DB_SETUP:-1}"
RESET_DB="${RESET_DB:-0}"

usage() {
  cat <<'MSG'
Usage: npm run bienvenue -- [options]

Prepares a freshly pulled main branch for local development:
  1. Creates .env from .env.example if missing
  2. Installs npm dependencies
  3. Prepares the local PostgreSQL role/database
  4. Applies pending Prisma migrations without deleting data
  5. Generates Prisma Client and verifies the database

Options:
  --no-db-setup   Skip local PostgreSQL setup
  --reset-db      Drop local data and replay migrations before seeding
  -h, --help      Show this help

Environment:
  RUN_DB_SETUP=0  Same as --no-db-setup
  RESET_DB=1      Same as --reset-db
MSG
}

for arg in "$@"; do
  case "$arg" in
    --no-db-setup)
      RUN_DB_SETUP=0
      ;;
    --reset-db)
      RESET_DB=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  printf '\n==> %s\n' "$1"
}

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
else
  log ".env already exists, keeping it"
fi

log "Installing npm dependencies"
npm install

if [[ "$RUN_DB_SETUP" == "1" ]]; then
  log "Preparing local PostgreSQL"
  npm run db:setup:local
else
  log "Skipping local PostgreSQL setup"
fi

if [[ "$RESET_DB" == "1" ]]; then
  log "Resetting local database and replaying Prisma migrations"
  npm run prisma:reset -- --force
fi

log "Applying migrations, generating Prisma Client, and verifying the database"
if ! npm run prisma:prepare; then
  cat >&2 <<'MSG'
Prisma preparation failed.

If Prisma reported drift, a failed migration, or a migration that exists in your
local database but not in this main branch, your local dev database is out of
sync with the code.
When you are okay with losing local data, rerun:
  npm run bienvenue -- --reset-db

To keep local data, recover the missing migration/code instead of resetting.
MSG
  exit 1
fi

cat <<'MSG'

Done. You can now start the app with:
  npm run api:dev
  npm run web:dev
MSG
