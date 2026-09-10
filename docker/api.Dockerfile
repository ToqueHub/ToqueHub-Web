FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set registry https://registry.npmjs.org/

RUN npm ci \
  --workspace @toquehub/api \
  --workspace @toquehub/core \
  --workspace @toquehub/shared-types \
  --include-workspace-root \
  --no-audit \
  --no-fund

FROM deps AS build

COPY apps/api apps/api
COPY packages/core packages/core
COPY packages/shared-types packages/shared-types
COPY prisma.config.ts ./

RUN npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM node:20-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/ToqueHub/ToqueHub-Web"

ARG TOQUEHUB_VERSION=0.1.0
ENV NODE_ENV=production
ENV TOQUEHUB_VERSION=$TOQUEHUB_VERSION
ENV FLATPAY_CHROME_PATH=/usr/bin/chromium
ENV FLATPAY_CHROME_NO_SANDBOX=true
ENV FLATPAY_BROWSER_PROFILE_DIR=/app/data/flatpay/browser-profile
ENV FLATPAY_AUTOMATION_STATE_PATH=/app/data/flatpay/state
ENV FLATPAY_REPORTS_INBOX=/app/data/flatpay/reports
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    openssl \
    postgresql-client \
  && chromium --version \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/dist-automation apps/api/dist-automation
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/package.json
COPY docker/api/entrypoint.sh /usr/local/bin/toquehub-api-entrypoint

RUN chmod +x /usr/local/bin/toquehub-api-entrypoint \
  && mkdir -p \
    /app/data/uploads \
    /app/data/backups \
    /app/data/flatpay/browser-profile \
    /app/data/flatpay/state \
    /app/data/flatpay/reports \
  && chown -R node:node /app/data

USER node
EXPOSE 3000

ENTRYPOINT ["toquehub-api-entrypoint"]
