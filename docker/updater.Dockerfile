FROM docker:27-cli

RUN apk add --no-cache nodejs

WORKDIR /app

COPY docker/updater/server.js /app/server.js

EXPOSE 3099

CMD ["node", "/app/server.js"]
