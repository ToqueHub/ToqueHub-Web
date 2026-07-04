FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set registry https://registry.npmjs.org/

RUN npm ci \
  --workspace @toquehub/web \
  --workspace @toquehub/ui \
  --workspace @toquehub/core \
  --workspace @toquehub/shared-types \
  --include-workspace-root \
  --no-audit \
  --no-fund

COPY apps/web apps/web
COPY packages/ui packages/ui
COPY packages/core packages/core
COPY packages/shared-types packages/shared-types

ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build -w apps/web

FROM nginx:1.27-alpine AS runtime

COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
