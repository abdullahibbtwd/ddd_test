# Authentication

## Token model

- **access_token** — short-lived JWT (HS256 only), default TTL 15 minutes (`ACCESS_TOKEN_TTL_SECONDS`). Cookie name `access_token`, path `/api`, `httpOnly`, `SameSite=Strict`, `Secure` when `NODE_ENV=production`.
- **refresh_token** — opaque 32-byte random value (base64url). Cookie name `refresh_token`, path `/api/auth`, same cookie flags, default TTL 30 days. Only the **SHA-256 hash** is stored in `auth_sessions.token_hash`.
- Tokens are never returned in JSON bodies and must never be read from `localStorage` or JS memory.

## Refresh rotation

Atomic rules on `POST /api/auth/refresh`:

1. Unknown, revoked, expired, or family older than 90 days → 401.
2. Already rotated less than 10 seconds ago → 401 **without** revoking the family (concurrent tabs).
3. Already rotated more than 10 seconds ago → reuse attack: revoke the **whole** family, then 401.
4. Otherwise: `updateMany` where `rotated_at IS NULL`, create a new session in the same family, set new cookies.
5. Deactivated users can never refresh.

## Guards

- Global `JwtAuthGuard` is **default-deny**. Mark public routes with `@Public()`.
- Global `PoliciesGuard` (after JWT): every non-public route needs `@AuthenticatedOnly()` or `@Can(action, subject)`. See [PERMISSIONS.md](./PERMISSIONS.md).
- Reloads the user from the database on every request (deactivated users are rejected even with a valid JWT).
- When `must_change_password` is true, only `/api/auth/me`, `/api/auth/change-password`, and `/api/auth/logout` are allowed; everything else returns 403 `PASSWORD_CHANGE_REQUIRED`. Admin-created users and admin password resets always land with `must_change_password` until they set a new password.
- `OriginGuard` on mutating methods: if `Origin` is present and not in `APP_URL` / `CORS_ORIGIN`, return 403.

## Throttling vs lockout

- Login route: **10 requests / minute / IP** (`@Throttle`). Exceeding it returns **429** with code `TOO_MANY_REQUESTS`.
- Account lockout after 10 failed passwords: **429** with code `ACCOUNT_LOCKED` and a `Retry-After` header (seconds remaining / 15 minutes on fresh lock).
- Client IP comes from Fastify `req.ip` (see `TRUST_PROXY_HOPS` in [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Create the first admin

Development:

```bash
pnpm --filter @ddcrm/api cli:create-admin -- --email admin@example.com --name "Admin"
```

Password is prompted (hidden) twice, or set `CREATE_ADMIN_PASSWORD` for automation.

Production (Docker):

```bash
docker compose -f infra/docker-compose.yml --env-file .env.production run --rm -it api \
  node dist/cli/create-admin.js --email admin@example.com --name "Admin"
```

## Add a public route

1. Add `@Public()` on the handler (or controller).
2. Update the default-deny allowlist in `apps/api/test/default-deny.spec.ts` if the route should stay unauthenticated.
3. Prefer keeping the surface minimal — default deny is intentional.

## Session payload (`/api/auth/me`, login response)

- `user.areas` — `{ id, name }[]` for **active** assigned areas only (inactive areas and inactive assignments are omitted).
- Deactivating a user revokes all `auth_sessions` for that user immediately; the next API call returns 401 and the web shell redirects to `/login`.

## Admin-provisioned passwords

- Admins never set passwords in the UI. `POST /api/users` and `POST /api/users/:id/reset-password` return a one-time `temporaryPassword` in the response body (never stored in audit).
- New and reset accounts get `must_change_password = true` until `/api/auth/change-password` succeeds.

## Bull Board

Queue UI at `/api/admin/queues` uses the same `access_token` session cookie as the API (path `/api`). Only users with CASL `manage Setting` (ADMIN) can open it. No separate Bull Board credentials.

## Playwright e2e users

`apps/web/e2e/global-setup.ts` runs `apps/api/scripts/seed-e2e-users.ts` before the suite. It creates (if missing) and resets lockout counters for:

**Areas (active):** Център (A), Изток (B), Запад (C).

**Users:**

- `admin@e2e.local` / `E2eAdminPass1!` (ADMIN)
- `office@e2e.local` / `E2eOfficePass1!` (OFFICE)
- `field@e2e.local` / `E2eFieldPass1!` (FIELD — areas A + B)
- `field2@e2e.local` / `E2eField2Pass1!` (FIELD — area C)

Requires `DATABASE_URL` from the repo `.env` and a running Postgres. Re-run manually:

```bash
pnpm --filter @ddcrm/api exec tsx scripts/seed-e2e-users.ts
```

The Playwright API `webServer` sets `E2E=1`, which skips Nest throttling so the login `10/min` limit does not flake the suite. The env schema **refuses** `E2E` when `NODE_ENV=production`.
