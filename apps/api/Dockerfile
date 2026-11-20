# syntax=docker/dockerfile:1.7
# Multi-stage API image: serves `node dist/main.js` (HTTP), `node dist/worker.js`
# (BullMQ), and `prisma migrate deploy` (one-shot migrate).
# Base tag pinned; pnpm-workspace.yaml (minimumReleaseAge) is copied into the build.

ARG NODE_VERSION=24.20.0
ARG PNPM_VERSION=12.10.1
ARG TURBO_VERSION=2.11.11

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NODE_ENV=production \
    TZ=UTC \
    PNPM_CONFIRM_MODULES_PURGE=false
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# -----------------------------------------------------------------------------
FROM base AS pruner
ARG TURBO_VERSION
# Prefer a global turbo install over `pnpm dlx` (faster/more reliable in Docker builds).
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
# turbo prune keeps pnpm-workspace.yaml (including minimumReleaseAge) in out/
RUN turbo prune @ddcrm/api --docker

# -----------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Full install (incl. build tools) for the compile stage
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app /app
COPY --from=pruner /app/out/full/ /app/
# turbo prune does not always include root tsconfig.base.json (extends path)
COPY tsconfig.base.json /app/tsconfig.base.json
# Do not force NODE_ENV=production during compile (Nest/SWC + tsc behave better).
ENV NODE_ENV=development \
    DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
# prisma generate runs inside the api build script; client lands in src/generated
RUN pnpm --filter @ddcrm/shared build && pnpm --filter @ddcrm/api build

# -----------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
# Production deps only (prisma CLI is a runtime dependency for migrate)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# -----------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    TZ=UTC \
    API_PORT=3000
WORKDIR /app

RUN groupadd --system --gid 1001 ddcrm \
  && useradd --system --uid 1001 --gid ddcrm --create-home ddcrm

COPY --from=prod-deps --chown=ddcrm:ddcrm /app/package.json ./package.json
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/node_modules ./node_modules
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=prod-deps --chown=ddcrm:ddcrm /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=builder --chown=ddcrm:ddcrm /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=ddcrm:ddcrm /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=ddcrm:ddcrm /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder --chown=ddcrm:ddcrm /app/packages/shared/dist ./packages/shared/dist

# PATH so `prisma` resolves for the migrate command
ENV PATH="/app/node_modules/.bin:/app/apps/api/node_modules/.bin:$PATH"
WORKDIR /app/apps/api

USER ddcrm
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${API_PORT}/api/health" || exit 1

# Default: HTTP API. Override for worker / migrate in compose:
#   worker:  ["node", "dist/worker.js"]
#   migrate: ["prisma", "migrate", "deploy"]
CMD ["node", "dist/main.js"]
