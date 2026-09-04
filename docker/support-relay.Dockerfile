FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/support-relay/package.json apps/support-relay/package.json
RUN npm ci --include=dev
COPY . .
RUN npm run prisma:generate -w apps/api && npm run build -w apps/support-relay
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/support-relay/dist ./apps/support-relay/dist
CMD ["node", "apps/support-relay/dist/main.js"]
