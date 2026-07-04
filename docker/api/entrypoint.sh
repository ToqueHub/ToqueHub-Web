#!/usr/bin/env sh
set -eu

cd /app

echo "Applying Prisma migrations..."
npm run prisma:deploy -w apps/api

echo "Starting ToqueHub API..."
exec npm run start -w apps/api
