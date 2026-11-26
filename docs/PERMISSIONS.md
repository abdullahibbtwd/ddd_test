# Permissions (CASL)

## How abilities work

- Shared factory: `defineAbilityFor({ id, role, areaIds? })` in `@ddcrm/shared`.
- Actions: `manage`, `create`, `read`, `update`, `delete`, `quickCreate`, `issue`, `cancelViaCreditNote`, `sendEmail`, `batchCreate`.
- Subjects (now): `User`, `Area`, `Client`, `Site`, `SiteType`, `Subscription`, `Visit`, `Invoice`, `Scheduling`, `AuditLog`, `Setting`, `Notification` (plus CASL’s `all`).
- **Invoice scope:** role-only — ADMIN/OFFICE see all invoices. No `accessibleInvoiceWhere` yet. R-3.05 satisfied trivially (FIELD has no invoice access). R-3.04 deferred.

## Current matrix (Task 19)

| Subject | ADMIN | OFFICE | FIELD |
|---|---|---|---|
| User, Setting, AuditLog | manage | User: read (employee filter only); Setting/AuditLog: none | none |
| Area | manage | read all | read assigned `areaIds` only |
| Client | manage | manage | read when client has a site in user’s areas (`siteAreaId`); `quickCreate` (sites route only) |
| Site | manage | manage | read + create in assigned areas; **no update/delete** (Q13) |
| SiteType | manage | read | read |
| Subscription | manage | manage | read when the site’s area is in user’s `areaIds` (`siteAreaId`) |
| Visit | manage | manage | create / read / update (cancel) when the site’s area is in `areaIds`; ownership + 7-day / 24-hour windows enforced in the API; **no delete** |
| Scheduling (`scheduling.read`) | manage (via all) | read | read (sites via `accessibleSiteWhere`) |
| Invoice | manage (incl. issue, cancelViaCreditNote, sendEmail, sendReminder, batchCreate) | manage + named issue / cancelViaCreditNote / sendEmail / sendReminder / batchCreate | **none** (nav + API); issued invoices are immutable for everyone |
| Payment | manage | manage | create + read; API scopes to visits they recorded / payments they created |
| CashHandover | manage | manage | **none** |
| Outstanding | manage | read | **none** |
| CashLedger | manage | read | read **self only** (API forces `employeeId = actor`) |
| Product | manage | manage | **read only** (browse register); no create/archive |
| VisitProduct | manage | manage | manage for **own** visits while not frozen (API) |
| MonitoringPoint | manage | manage | **read only**; cannot change site count (site edit) |
| MonitoringPointCheck | manage | manage | manage for **own** visits while not frozen (API) |
| ClientEmployee | manage (incl. erase, export) | create / read / update / export; **no erase** | **none** on employee CRUD; see HealthCertificate FIELD route |
| HealthCertificate | manage | manage | **read** redacted on assigned sites only: `GET /api/sites/:siteId/certified-employees` — names + nextRenewalAt + status; job title → `[скрито]`; **READ_PII** audited |
| Agreement | manage (incl. renew) | manage + renew | **none** |
| FoodSchedule | manage | manage | **none** |
| FoodRecord | manage | manage | **none** |
| Notification | manage (summary counts) | read + update **own** rows only | read + update **own** rows only |
| Report | read (JSON + Excel/PDF export) | read (JSON + Excel/PDF export) | **none** (nav hidden; API 403) |

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
| Invoice | manage (done) | manage (done) | optional later: read/create/issue in assigned areas (R-3.04 deferred); never update/delete issued |
| Report (Phase 12 view/export) | read | read | **none** (service-report PDF stays on Visit) |

## Notifications (Task 20)

- `read Notification` — `GET /api/notifications/me`. SYSTEM_USER rows for the actor only. Dismissed rows are omitted. CLIENT_CONTACT rows are never returned.
- `update Notification` — mark one read (idempotent), dismiss (a second dismiss is 409), mark all unread as read. A row that is not the actor's SYSTEM_USER row is 404, including every CLIENT_CONTACT row. The office cannot mark those read.
- `manage Notification` — `GET /api/notifications/summary`. ADMIN only. Counts by kind and status. No titles, bodies, params, or addresses. OFFICE and FIELD receive 403.
- Error messages are `{ code, message }`. The Bulgarian text does not include ids, names, or emails.

## READ_PII note

Every successful read of `client_employees` or `health_certificates` (including the FIELD redacted site route) writes a `READ_PII` security audit event. Agreements and food sampling do **not**. If the audit write fails, the HTTP read fails with `READ_PII_AUDIT_FAILED`.
