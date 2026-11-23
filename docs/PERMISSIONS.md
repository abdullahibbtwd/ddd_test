# Permissions (CASL)

## How abilities work

- Shared factory: `defineAbilityFor({ id, role, areaIds? })` in `@ddcrm/shared`.
- Actions: `manage`, `create`, `read`, `update`, `delete`, `quickCreate`.
- Subjects (now): `User`, `Area`, `Client`, `Site`, `SiteType`, `Subscription`, `Visit`, `Scheduling`, `AuditLog`, `Setting` (plus CASL’s `all`).

## Current matrix (Task 14)

| Subject | ADMIN | OFFICE | FIELD |
|---|---|---|---|
| User, Setting, AuditLog | manage | User: read (employee filter only); Setting/AuditLog: none | none |
| Area | manage | read all | read assigned `areaIds` only |
| Client | manage | manage | read when client has a site in user’s areas (`siteAreaId`); `quickCreate` (sites route only) |
| Site | manage | manage | read + create in assigned areas; **no update/delete** |
| SiteType | manage | read | read |
| Subscription | manage | manage | read when the site’s area is in user’s `areaIds` (`siteAreaId`) |
| Visit | manage | manage | create / read / update (cancel) when the site’s area is in `areaIds`; ownership + 7-day / 24-hour windows enforced in the API; **no delete** |
| Scheduling (`scheduling.read`) | manage (via all) | read | read (sites via `accessibleSiteWhere`) |

- Own profile read/change stays on `/api/auth/*` via `@AuthenticatedOnly()`, not CASL.
- API lists/get-one apply `accessibleAreaWhere` / `accessibleSiteWhere` / `accessibleClientWhere` / `accessibleSubscriptionWhere` / `accessibleVisitWhere` / `accessibleSchedulingWhere` from `apps/api/src/auth/accessible-where.ts`. Visit/subscription helpers nest `accessibleSiteWhere` on the parent site. Resource reads outside scope return **404** (`NOT_FOUND` or `SITE_OUT_OF_SCOPE`).
- **«Този месец» filter exception:** out-of-scope `areaId` / `employeeId` on `GET /api/scheduling/month` and `/month/days` return an **empty result (200)**, not 404 — the filter is a preference, not a resource. A site appears only if the caller can already see it (`accessibleSchedulingWhere` → `accessibleSiteWhere`).

## API guards (default-deny, two layers)

1. Global `JwtAuthGuard` — requires a valid session unless `@Public()`.
2. Global `PoliciesGuard` — every non-public route needs exactly one of:
   - `@AuthenticatedOnly()` — logged in is enough
   - `@Can(action, subject)` — CASL check

Covered by `apps/api/test/default-deny.spec.ts`.

## Adding a subject and rules

1. Add the subject string to `AppSubject` in `packages/shared/src/ability.ts`.
2. Extend `defineAbilityFor` with role rules (and conditions when needed).
3. Protect API handlers with `@Can('read' | …, 'YourSubject')`.
4. On the web, use `<Can I="read" a="YourSubject">` from `AbilityProvider`.
5. Update this matrix when the phase confirms behaviour.

## Intended permissions (later phases)

| Subject | ADMIN | OFFICE | FIELD |
|---|---|---|---|
| Invoice | manage | manage | read and create/issue in assigned areas; never update or delete an issued invoice |
| Payment | manage | manage | create and read own collected payments; no delete |
| Product, Certificate, Agreement | manage | manage | read |
| Report (view/export) | manage | manage | own activity only |
