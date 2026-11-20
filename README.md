# DD CRM

CRM/ERP for a Bulgarian pest-control company (дезинсекция и дератизация). Platform shell only so far — no business features yet.

Progress, requirements, and task roadmap: [PROJECT_PLAN.md](./PROJECT_PLAN.md).

## Prerequisites

- Node.js 24+ (see `.nvmrc`)
- pnpm 12.10.1 (`packageManager` in `package.json`)
- Docker Desktop (or Engine + Compose)

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:deploy
pnpm dev
```

| | URL |
|--|-----|
| Web (Vite) | http://localhost:5173 |
| API | http://localhost:3000/api/health |
| Bull Board | http://localhost:5173/api/admin/queues (admin session) |

## Scripts

| Script | What it does |
|--------|----------------|
| `pnpm dev` | API + web + worker (Turbo) |
| `pnpm build` | Build all packages |
| `pnpm lint` / `typecheck` / `test` | Quality gates |
| `pnpm infra:up` / `down` / `logs` | Dev Docker services |
| `pnpm db:migrate` / `db:deploy` / `db:studio` | Prisma |
| `pnpm openapi` / `api:client` | OpenAPI → Orval client |
| `pnpm prod:up` / `prod:down` / `prod:logs` | Production-like compose |
| `pnpm --filter @ddcrm/web test:e2e` | Playwright |
| `pnpm --filter @ddcrm/api cli:create-admin` | Create first ADMIN user |

## Folder map

```
apps/api          NestJS (Fastify) — HTTP + worker entry points
apps/web          React + Vite + PWA
packages/shared   Shared zod types, queues, ids
infra/            Dev + prod compose, Caddy, Garage
docs/             Architecture, decisions, conventions, deploy, testing
.github/workflows CI
```

## Ports (development)

| Service | Port |
|---------|------|
| Web (Vite) | 5173 |
| API | 3000 |
| Mailpit UI / SMTP | 8025 / 1025 |
| Gotenberg | 3001 |
| Garage S3 | 3900 |
| Postgres | 5432 |
| Redis | 6379 |

Production-like stack publishes **only** Caddy on **80/443**.

## Production-like stack (local)

```bash
cp .env.production.example .env.production
# Keep SITE_ADDRESS=":80" + CADDY_AUTO_HTTPS="auto_https off"; replace CHANGE_ME
pnpm prod:up
./infra/garage/init-prod.sh
# If new S3 keys were printed, put them in .env.production and recreate api/worker
```

Open http://127.0.0.1/ — only ports 80/443 are published. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## Worker

Same package as the API. Production runs two containers from one image: `node dist/main.js` and `node dist/worker.js`. Queue notes: [docs/QUEUES.md](docs/QUEUES.md).
