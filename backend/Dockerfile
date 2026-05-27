# ═══════════════════════════════════════════════════════════════════════════════
#  FoodBF / Dodo — Backend NestJS Dockerfile
#  Multi-stage : deps → development (hot-reload) → builder → production
#
#  Stack cible : NestJS 10 · Fastify 4 · TypeORM 0.3 · BullMQ 5
#
#  Dev  : docker compose up api        (src/ monté en volume, nest --watch)
#  Prod : déploiement via Render (render.yaml à la racine du repo)
#
#  Note : après modification de package.json, relancez :
#         docker compose up --build api
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1 : installation des dépendances ────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# pnpm via corepack — pnpm@9 requis : pnpm 10/11 nécessite Node 22+
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copier manifestes uniquement pour exploiter le cache Docker layer
COPY package.json ./

# pnpm-lock.yaml optionnel — si présent, utilisé pour reproductibilité
COPY package.json pnpm-lock.yaml* ./

# Installation complète (dev + prod nécessaire pour le build TypeScript)
RUN pnpm install --no-frozen-lockfile

# ── Stage 2 : développement avec hot-reload ──────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@9 --activate

# Fichiers de config NestJS
COPY package.json pnpm-lock.yaml* nest-cli.json tsconfig.json tsconfig.build.json ./

# Réutiliser node_modules du stage deps (évite une double installation)
COPY --from=deps /app/node_modules ./node_modules

# Le code source sera monté en volume par docker-compose (hot-reload)
# COPY src ./src  ← intentionnellement absent pour le dev

EXPOSE 3001

# nest start --watch : compile en mémoire avec transpileOnly + redémarre sur changement
CMD ["pnpm", "run", "dev"]

# ── Stage 3 : compilation TypeScript complète ─────────────────────────────────
FROM deps AS builder

WORKDIR /app

COPY . .

# Build NestJS → dist/ puis pruner les devDependencies
RUN pnpm run build && pnpm prune --prod

# ── Stage 4 : image de production minimale (non-root, dumb-init) ─────────────
FROM node:20-alpine AS production

WORKDIR /app

# dumb-init : propagation correcte des signaux POSIX (SIGTERM graceful shutdown)
# wget : utilisé par le HEALTHCHECK natif Docker
RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
# PORT est injecté par Render à l'exécution — ne pas fixer de valeur fixe ici
# La valeur par défaut 3001 est utilisée si PORT est absent (dev local)

# Utilisateur non-root — principe du moindre privilège
RUN addgroup -S foodbf && adduser -S nestjs -G foodbf

# Copier uniquement le strict nécessaire depuis le builder
COPY --from=builder --chown=nestjs:foodbf /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:foodbf /app/dist         ./dist
COPY --from=builder --chown=nestjs:foodbf /app/package.json ./package.json

USER nestjs

# Render injecte PORT dynamiquement — EXPOSE est indicatif uniquement
EXPOSE 3001

# Healthcheck Docker local (Render utilise /api/v1/ping comme healthcheckPath)
HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-3001}/api/v1/ping" 2>/dev/null | grep -q '"ok":true' || exit 1

# dumb-init en PID 1 → signals bien propagés → arrêt propre NestJS
CMD ["dumb-init", "node", "dist/main.js"]
