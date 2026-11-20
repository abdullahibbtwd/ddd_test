# Permissions (CASL)

## How abilities work

- Shared factory: `defineAbilityFor({ id, role, areaIds? })` in `@ddcrm/shared`.
- Actions: `manage`, `create`, `read`, `update`, `delete`.
- Subjects (now): `User`, `Area`, `AuditLog`, `Setting` (plus CASL’s `all`).
- **Current matrix (Task 9):**
  - **ADMIN** — `can('manage', 'all')`
  - **OFFICE** — `can('read', 'Area')` (all active areas); no `User`, `Setting`, or `AuditLog`
  - **FIELD** — `can('read', 'Area', { id: { $in: areaIds } })` only for assigned **active** area ids; no `User`, `Setting`, or `AuditLog`
- Own profile read/change stays on `/api/auth/*` via `@AuthenticatedOnly()`, not CASL.
- API lists and get-one for `Area` apply `accessibleAreaWhere(ability)` from `apps/api/src/auth/accessible-area-where.ts`. Reads outside scope return **404** `NOT_FOUND`.

Conditions such as `{ areaId: { $in: areaIds } }` are supported by the factory
shape (proven with a TEST-ONLY `Site` subject in unit tests). Real site scoping
lands with Sites in Phase 2.

## API guards (default-deny, two layers)

1. Global `JwtAuthGuard` — requires a valid session unless `@Public()`.
2. Global `PoliciesGuard` — every non-public route needs exactly one of:
   - `@AuthenticatedOnly()` — logged in is enough
   - `@Can(action, subject)` — CASL check

A route with none of `@Public` / `@AuthenticatedOnly` / `@Can` is rejected with
403 for everyone. Covered by `apps/api/test/default-deny.spec.ts`.

## Adding a subject and rules

1. Add the subject string to `AppSubject` in `packages/shared/src/ability.ts`.
2. Extend `defineAbilityFor` with role rules (and conditions when needed).
3. Protect API handlers with `@Can('read' | …, 'YourSubject')`.
4. On the web, use `<Can I="read" a="YourSubject">` from `AbilityProvider`.
5. Update the intended matrix below when the phase confirms behaviour.

## Intended permissions (to be confirmed per phase)

Documentation only — **not** enforced in code yet.

| Subject | ADMIN | OFFICE | FIELD |
|---|---|---|---|
| User, Setting, AuditLog | manage | none | none |
| Area | manage | read all | read assigned `areaIds` only |
| Client | manage | manage | read only for clients that have a site in the user's areas |
| Site | manage | manage | read and create in assigned areas only; no delete |
| Subscription | manage | manage | read in assigned areas |
| Visit | manage | manage | create and update own visits in assigned areas; no delete |
| Invoice | manage | manage | read and create/issue in assigned areas; never update or delete an issued invoice |
| Payment | manage | manage | create and read own collected payments; no delete |
| Product, Certificate, Agreement | manage | manage | read |
| Report (view/export) | manage | manage | own activity only |