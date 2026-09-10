FROM node:20-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/ToqueHub/ToqueHub-Web"

WORKDIR /app

RUN npm install bonjour-service@1.4.2 --omit=dev --no-audit --no-fund

COPY docker/mdns-publisher/standalone.js ./standalone.js

ENTRYPOINT ["node", "/app/standalone.js"]
