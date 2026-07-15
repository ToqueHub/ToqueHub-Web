# Multi-stage Dockerfile pour ToqueHub RNM

# --- Étape 1 : Installation des dépendances ---
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Étape 2 : Construction de l'application ---
FROM node:20-alpine AS builder
# Installer openssl ici pour que Prisma détecte OpenSSL 3.0 lors de la génération
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# S'assurer que le dossier public existe pour éviter les erreurs de copie Next.js
RUN mkdir -p public

# Générer le client Prisma avec la bonne version d'OpenSSL
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Étape 3 : Image finale de production ---
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Installer ts-node globalement ou s'assurer que typescript est accessible
# pour exécuter les scripts ts de cron
RUN npm install -g ts-node typescript @types/node

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/start.sh ./start.sh

# Rendre start.sh exécutable
RUN chmod +x ./start.sh

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./start.sh"]
