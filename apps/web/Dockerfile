# syntax=docker/dockerfile:1.7
# Multi-stage web image: Vite build → static files served by unprivileged nginx.
# VITE_API_URL is empty so the browser calls same-origin /api/* via Caddy.

ARG NODE_VERSION=24.20.0
ARG PNPM_VERSION=12.10.1
ARG TURBO_VERSION=2.11.11
ARG NGINX_VERSION=1.28.0

# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    TZ=UTC
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# -----------------------------------------------------------------------------
FROM base AS pruner
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune @ddcrm/web --docker

# -----------------------------------------------------------------------------
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ /app/
COPY tsconfig.base.json /app/tsconfig.base.json
# Same-origin API through Caddy — do not bake a cross-origin API URL.
ENV NODE_ENV=development \
    VITE_API_URL=
# vite build (plugin generates routeTree); typecheck stays a separate CI job
RUN pnpm --filter @ddcrm/shared build \
  && pnpm --filter @ddcrm/web exec vite build

# -----------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runner
ENV TZ=UTC \
    NODE_ENV=production
USER root
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
