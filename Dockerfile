# ---------- 1. Build TypeScript ----------
FROM node:26-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
# Le schéma doit être là AVANT l'install : le postinstall lance `prisma generate`
COPY prisma ./prisma/
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY .env.example .env

RUN npm run build

# ---------- 2. Image d'exécution ----------
FROM node:26-alpine
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production \
    PORT=4001 \
    UPLOAD_DIR=/app/uploads \
    CHECKPOINT_DISABLE=1

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

# Pas de .env dans l'image : les variables viennent du --env-file passé par Jenkins
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 4001

# Crée/met à jour les tables puis démarre l'API
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
