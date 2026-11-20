# Conventions

## Naming

- **Packages / apps:** `@ddcrm/<name>` (`api`, `web`, `shared`).
- **DB:** `snake_case` tables and columns; Prisma models may be PascalCase with `@@map` / `@map`.
- **TS files:** `kebab-case.ts` for modules/files; React components `PascalCase.tsx`.
- **Queues / job names:** constants in `@ddcrm/shared`; deterministic ids via `jobId(...parts)`.

## Feature module layout (`apps/api`)

```
src/<feature>/
  <feature>.module.ts
  <feature>.controller.ts
  <feature>.service.ts
  dto/                 # zod schemas + nestjs-zod DTOs
test/                  # or co-located specs under apps/api/test/
```

Worker-only processors live under `src/processors/` and are registered in `ProcessorsModule` (never imported by `AppModule`).

## API conventions

- Global prefix: `/api`.
- **Pagination:** shared page-query helpers from `@ddcrm/shared`.
- **Errors:** throw `AppException` (or mapped HTTP exceptions); clients receive `{ code, message, details? }` matching `ApiError` / `ErrorCode`.
- **Filters:** global exception filter; production hides internal details.
- **OpenAPI:** controllers decorated for Swagger; regenerate with `pnpm openapi` then `pnpm api:client`.
- **Auth:** httpOnly cookie JWT + opaque refresh; `@Public()` opt-out of default-deny. See [AUTH.md](./AUTH.md). Bull Board at `/api/admin/queues` uses the same admin session (see [QUEUES.md](./QUEUES.md)).

## Commit messages

Imperative, short, focused on why:

```
fix helmet CORP to same-origin in production

Add Testcontainers Postgres helper for concurrency tests
```

## Add a feature end to end

1. **Migration** — `pnpm db:migrate --name describe_change`; edit SQL if needed; `pnpm db:deploy` on shared DBs.
2. **API** — module + service + controller + DTOs; wire into `AppModule` (processors into `ProcessorsModule` if jobs).
3. **OpenAPI** — `pnpm openapi` (writes `apps/api/openapi.json`).
4. **Client** — `pnpm api:client` (Orval into `apps/web/src/api/generated`).
5. **UI** — route under `apps/web/src/routes`, reuse shell components; Bulgarian copy via i18n.
6. **Tests** — unit where pure; integration with docker-compose.dev or `startTestDb()` for DB races; Playwright for critical flows.
