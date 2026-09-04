#!/usr/bin/env sh
set -eu

cd /app

FLATPAY_BROWSER="${FLATPAY_CHROME_PATH:-/usr/bin/chromium}"
if [ ! -x "$FLATPAY_BROWSER" ]; then
  echo "FlatPay browser is missing or not executable: $FLATPAY_BROWSER" >&2
  exit 1
fi
echo "FlatPay browser ready: $("$FLATPAY_BROWSER" --version)"

echo "Applying Prisma migrations..."
npm run prisma:deploy -w apps/api

echo "Starting ToqueHub API..."
exec npm run start -w apps/api
