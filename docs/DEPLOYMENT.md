# Deployment (Docker on a fresh VPS)

Backups are **not** built yet. Plan them for the go-live phase. Until then, treat volumes as precious and snapshot the VPS disk yourself if needed.

## Prerequisites

- Docker Engine + Compose plugin
- A DNS A/AAAA record pointing at the VPS (for real TLS)
- SMTP credentials for the client’s mail server

## 1. Copy the project

```bash
git clone <repo-url> ddcrm && cd ddcrm
```

## 2. Create the env file

```bash
cp .env.production.example .env.production
# Edit every CHANGE_ME. Set SITE_ADDRESS to your domain (e.g. crm.example.com).
# Set CORS_ORIGIN to https://crm.example.com
```

Also regenerate Garage `rpc_secret` / admin tokens in `infra/garage/garage.prod.toml` before the first real start (`openssl rand -hex 32`).

## 3. First start (infra + migrate + apps)

```bash
docker compose -f infra/docker-compose.yml --env-file .env.production up -d --build
```

Only Caddy binds host ports **80** and **443**. If Garage has no layout/bucket/key yet, api storage calls will fail until step 4.

## 4. Garage init (once, re-runnable)

```bash
# Optional: export S3_ACCESS_KEY / S3_SECRET_KEY to import fixed credentials
./infra/garage/init-prod.sh
```

If the script created a new key, copy Key ID / Secret into `.env.production`, then:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.production up -d api worker
```

## 5. Admin user

```bash
docker compose -f infra/docker-compose.yml --env-file .env.production run --rm -it api \
  node dist/cli/create-admin.js --email admin@example.com --name "Admin"
```

Prompts for a hidden password (or set `CREATE_ADMIN_PASSWORD`). Fails if the email already exists.
Bull Board is at `/api/admin/queues` and uses the admin session cookie (same as the API). Log in as an ADMIN in the web app first; no separate Bull Board credentials.

## 6. Updates

```bash
git pull
docker compose -f infra/docker-compose.yml --env-file .env.production up -d --build
# migrate runs as a one-shot service before api/worker start
```

## 7. Logs

```bash
docker compose -f infra/docker-compose.yml --env-file .env.production logs -f api worker caddy
docker compose -f infra/docker-compose.yml --env-file .env.production ps
```

## Local production-like test

```bash
cp .env.production.example .env.production
# Keep SITE_ADDRESS=":80" and CADDY_AUTO_HTTPS="auto_https off" for plain HTTP.
# Use weak local passwords and dummy SMTP (mail is only needed when sending).
docker compose -f infra/docker-compose.yml --env-file .env.production up -d --build
./infra/garage/init-prod.sh
# Put S3 keys into .env.production if newly created, recreate api/worker
```

Open `http://127.0.0.1/` — web via Caddy, `/api/health/ready` for dependency checks.
For a real domain, set `SITE_ADDRESS=crm.example.com` and leave `CADDY_AUTO_HTTPS` empty.

## Trust proxy (client IP behind Caddy)

Set `TRUST_PROXY_HOPS=1` in production (already in `.env.production.example` and
compose). The API never passes `trustProxy: true`.

Fastify 5 treats a **numeric** `trustProxy` as fail-closed (ignores
`X-Forwarded-For`). We map `TRUST_PROXY_HOPS` to a hop-index trust function that
trusts exactly that many peers from the socket side — equivalent to “exactly N
hops”. With Caddy in front, `auth_sessions.ip` and throttle buckets see the real
client, not Caddy’s container IP.

## What is not included

- Automated backups / restore drills (go-live phase)
- Monitoring / alerting
- Restricted DB role that cannot drop audit triggers (go-live hardening)
