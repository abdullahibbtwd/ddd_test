# DDD CRM: Master Requirements and Progress Tracker

**Project:** CRM/ERP for pest control, self-monitoring (SMS), food sampling and health certificates (Bulgaria)
**Source:** Business Requirements Document v1.0 (preliminary, subject to clarification with the Client)
**Last updated:** 2026-11-20

**Legend:** `[x]` done and verified · `[~]` in progress or partly done · `[ ]` not started

**Progress snapshot**

- Requirements from the document: **1 of 83 done**, 8 in progress, 74 not started
- Build roadmap items: **9 of 22 done**, 0 in progress, 13 not started
- Platform foundation (Phase 0): **complete**. Business features: **not started** (by design, the foundation comes first)

---

## 1. Where we are right now

- **Done through Task 16:** Platform, auth, users/areas, clients/sites, subscriptions/scheduling, visits, invoicing core, invoice documents.
- **Just finished (awaiting your acceptance):** Task 17 / Phase 8 — payments, outstanding report, cash ledger, payment reminders.
- **Next:** Phase 9 (products, service reports, NEOT/POT logs).
- **Waiting on you:**
  - [ ] Push the repo to a private GitHub repository and confirm CI turns green (the CI file was only syntax-checked locally).
  - [ ] Look at `/dev/styleguide` (desktop and phone width) and approve or request design changes.
  - [ ] Accept or request changes on Task 17 (payments).
  - [ ] Send the client the open questions in section 6 (including Q20 on prepayment).

---

## 2. Build roadmap (how the work is split)

"Task" means one instruction sent to the coding agent. "Phase" means a group of tasks around one business area.

### Phase 0: Platform foundation (not in the requirements document, but everything depends on it)

| Task | Scope | Status |
|---|---|---|
| 1 | Monorepo, tooling, dev infrastructure (Postgres 18, Redis, Garage, Gotenberg, Mailpit) | [x] |
| 2 | API foundation: config validation, logging, security, error format, Swagger, health checks, Prisma 7, DB extensions | [x] |
| 3 | Background jobs: BullMQ queues, worker entry point, Bull Board, deterministic job IDs | [x] |
| 4 | File storage (Garage), PDF engine with embedded Cyrillic fonts, email queue and templates | [x] |
| 5 | Web foundation: design tokens, fonts, app shell, base components, i18n, API client, PWA, style guide | [x] |
| 6 | Production Docker, Caddy, test infrastructure (Testcontainers), CI, documentation | [x] |

### Phase 1: Access and security

| Task | Scope | Status |
|---|---|---|
| 7 | Login, tokens in httpOnly cookies, refresh rotation, lockout, default-deny guard, first admin from CLI, login screen, role-filtered nav, session cleanup job | [x] |
| 8 | Audit log (DB triggers, append-only), actor context, CASL permissions, audit viewer screen, trust-proxy fix, E2E safety flag, throttle vs lockout codes | [x] |
| 9 | User management screens, areas, assigning FIELD users to areas, area-scoped permissions, move Bull Board behind admin login | [x] |

### Business phases

| Phase | Scope | Status |
|---|---|---|
| 2 | Clients and sites (search, EIK validation, duplicates, map) | [ ] |
| 3 | Data migration from AppSheet (RamboBookV2) | [ ] |
| 4 | Subscriptions and scheduling engine ("This Month", unserviced) | [ ] |
| 5 | Visits and the field mobile experience | [ ] |
| 6 | Invoicing core (gapless numbering, issue, immutability) | [ ] |
| 7 | Invoice documents (PDF original/copy, email, credit/debit notes, batch invoicing) | [ ] |
| 8 | Payments, outstanding balances, cash ledger | [x] |
| 9 | Products, service reports, NEOT/POT logs | [ ] |
| 10 | Health certificates, agreements, food sampling (GDPR) | [ ] |
| 11 | Notification engine (in-app and email) | [ ] |
| 12 | Reports and Excel/PDF export | [ ] |
| 13 | Hardening, testing, training, go-live | [ ] |
| Opt. | Offline mode, on-screen signature, Commercial Register lookup, accounting integration | [ ] |

Each business phase will be split into tasks when we reach it.

---

## 3. Requirements checklist

Every line comes from the requirements document. "Target" is the phase where it gets built.

### 3. Users and roles

- [~] **R-3.01** Administrator: full access, users, areas, master data, settings, numbering sequences (users and areas in Task 9; numbering in Phase 6) · Target: T9, P6
- [~] **R-3.02** Office/Accountant: all clients and sites, invoices, payments, reports; no settings access (role and nav filtering exist; CASL denies User/Area/AuditLog/Setting in Task 8) · Target: T8
- [ ] **R-3.03** Field employee: mobile, sees only sites in assigned areas · Target: T9, P2
- [ ] **R-3.04** Field employee: creates sites, records treatments and payments, issues and prints reports and invoices · Target: P2, P5, P7, P8
- [ ] **R-3.05** Field employee cannot delete or modify issued invoices · Target: P6
- [x] **R-3.06** All actions recorded in an audit log (who, what, when) · Target: T8

### 4.1 Clients and sites

- [ ] **R-4.1-01** Separate Client (legal entity or individual) from Site (service location); one client with many sites · P2
- [ ] **R-4.1-02** Billing details: legal name, UIC/EIK, VAT number, registered address, legal representative, phone, email, preferred payment method · P2
- [ ] **R-4.1-03** Validate UIC/EIK (checksum) · P2
- [ ] **R-4.1-04** Detect duplicate clients · P2
- [ ] **R-4.1-05** Site details: name, type, address, map and navigation, area, contact person, floor area, number of NEOT/POT points, notes · P2
- [ ] **R-4.1-06** Search and filter by name, EIK, area, site type, status (active/terminated) · P2
- [ ] **R-4.1-07** Dedicated phone and email fields (missing in the old system) · P2
- [x] **R-4.1-08** Geographic areas managed by admin · T9
- [ ] **R-4.1-09** Optional: automatic lookup from the Bulgarian Commercial Register · Optional

### 4.2 Subscriptions and scheduling

- [ ] **R-4.2-01** Subscription per site: services, frequency (monthly, every 2 months, quarterly, on demand), service rate, start and end dates · P4
- [ ] **R-4.2-02** Automatically identify sites not serviced this month or per agreed frequency · P4
- [ ] **R-4.2-03** Colour coding and area-based lists for serviced / upcoming / overdue · P4
- [ ] **R-4.2-04** "This Month" dashboard by area and employee · P4

### 4.3 Treatments (visits)

- [ ] **R-4.3-01** Mobile recording: site, date, employees, treatment type, service charge · P5
- [ ] **R-4.3-02** Record products used and quantities · P9
- [ ] **R-4.3-03** Record amount collected and payment method · P8
- [ ] **R-4.3-04** One-off treatments outside subscriptions · P5
- [ ] **R-4.3-05** Calendar and list views · P5
- [ ] **R-4.3-06** Full service history per site · P5

### 4.4 Service reports, products and monitoring

- [ ] **R-4.4-01** Service reports for insect control, rodent control, disinfection, auto-filled from product data · P9
- [ ] **R-4.4-02** Product register: permit details, formulation, active substances, antidote, ventilation and exposure periods, recommendations · P9
- [ ] **R-4.4-03** NEOT/POT monitoring logs by point, with status of each point · P9
- [ ] **R-4.4-04** PDF generation for printing and email · P9 (engine already proven in Task 4)
- [ ] **R-4.4-05** Optional on-screen client signature · Optional

### 4.5 Invoicing (critical)

- [ ] **R-4.5-01** Sequential, unique 10-digit numbers with no gaps or duplicates, enforced at database level · P6
- [ ] **R-4.5-02** Correct under simultaneous work by employees (concurrency test with 50+ parallel issues) · P6
- [ ] **R-4.5-03** Correct under poor connectivity (number assigned at issue/sync time) · P6
- [ ] **R-4.5-04** Create from one treatment, several treatments, or manually · P6
- [ ] **R-4.5-05** Monthly batch invoicing of subscriptions (drafts reviewed, then issued) · P7
- [ ] **R-4.5-06** Credit notes, debit notes, cancellation keeping the original number and reason · P7
- [ ] **R-4.5-07** No physical deletion; issued invoices immutable (DB trigger) · P6
- [ ] **R-4.5-08** Configurable VAT rate, VAT-exempt and non-taxable supplies · P6
- [ ] **R-4.5-09** Original and copy as PDF · P7
- [ ] **R-4.5-10** Printing from mobile devices · P7
- [ ] **R-4.5-11** Email delivery · P7
- [ ] **R-4.5-12** Compliance with the Bulgarian VAT Act and Accounting Act (must be reviewed by the client's accountant) · P6, P7

### 4.6 Payments and outstanding balances

- [ ] **R-4.6-01** Record cash payments collected by field employees and bank payments · P8
- [ ] **R-4.6-02** Partial payments · P8
- [ ] **R-4.6-03** View unpaid and overdue client balances · P8
- [ ] **R-4.6-04** Issue payment reminders · P8
- [ ] **R-4.6-05** Cash ledger per employee: collected vs handed over · P8

### 4.7 Health certificates

- [ ] **R-4.7-01** Register client employees: name, job title, site, last certification date, next renewal date · P10
- [ ] **R-4.7-02** Notify about upcoming renewals (30, 14, 7 days) · P10, P11
- [ ] **R-4.7-03** List expired certificates · P10

### 4.8 Self-monitoring and food sampling agreements

- [ ] **R-4.8-01** Annual agreements: client, site, service type, signing date, expiry date, contract value · P10
- [ ] **R-4.8-02** Expiry notifications · P10, P11
- [ ] **R-4.8-03** One-click agreement renewal · P10
- [ ] **R-4.8-04** Schedule and record food sample collection and test results · P10

### 4.9 Notifications

- [ ] **R-4.9-01** In-app notifications (dashboard and bell) · P11
- [ ] **R-4.9-02** Email to the responsible employee · P11
- [ ] **R-4.9-03** Optional notification to the client (per-client switch, off by default) · P11

### 4.10 Reports (all with Excel and PDF export)

- [ ] **R-4.10-01** Revenue: by client, site, area, employee, service, period · P12
- [ ] **R-4.10-02** Service coverage: serviced vs unserviced by month and area · P12
- [ ] **R-4.10-03** Outstanding balances with aging · P12
- [ ] **R-4.10-04** Cash: collected by employee and day · P12
- [ ] **R-4.10-05** Expirations: certificates, agreements, food sampling in a period · P12
- [ ] **R-4.10-06** Products: quantities by product and period · P12
- [ ] **R-4.10-07** Excel export for every report · P12
- [ ] **R-4.10-08** PDF export for every report · P12

### 5. Non-functional requirements

- [~] **R-5.01** Responsive web app for phones and tablets, no installation, home-screen icon (app shell is responsive and installable; real screens still to come) · ongoing
- [ ] **R-5.02** Optional offline mode with sync; invoice numbers assigned at sync · Optional
- [x] **R-5.03** Individual user accounts · T7
- [~] **R-5.04** Role-based access (roles exist, nav filtered, CASL + PoliciesGuard in T8; area scoping in T9) · T8, T9
- [~] **R-5.05** Encrypted connections (Caddy with automatic TLS is configured; not yet tested with a real domain) · P13
- [x] **R-5.06** Audit logs · T8
- [ ] **R-5.07** Automatic daily backups, with a tested restore · P13
- [ ] **R-5.08** EU-based hosting (VPS choice and contract) · P13
- [ ] **R-5.09** GDPR protection of client-employee personal data (access restricted, reads audited, export and erasure on request) · P10
- [ ] **R-5.10** Performance with thousands of sites and tens of thousands of treatments (load test with seeded data, lists under 500 ms) · P13
- [~] **R-5.11** Fully localized in Bulgarian (shell, auth, errors and audit done; each new screen must follow) · ongoing

### 6. Data migration

- [ ] **R-6.01** Import all clients and sites from RamboBookV2 · P3
- [ ] **R-6.02** Remove placeholder entries · P3
- [ ] **R-6.03** Merge duplicate companies into one client with many sites · P3
- [ ] **R-6.04** Extract phone numbers from free-text fields · P3
- [ ] **R-6.05** Optional: import treatment history · P3
- [ ] **R-6.06** Optional: populate chemical product master data · P3, P9
- [ ] **R-6.07** Client verification and approval before go-live · P13

---

## 4. Engineering foundation checklist (what already exists in the code)

- [x] Monorepo (pnpm + Turborepo), TypeScript strict, ESLint, Prettier, git hooks
- [x] Dev infrastructure in Docker: Postgres 18, Redis 8, Garage, Gotenberg, Mailpit
- [x] Env validation at startup (app refuses to start if invalid)
- [x] Structured logging with request IDs and redaction
- [x] Security headers, cookies, CORS, rate limiting
- [x] Uniform error format and shared Zod schemas
- [x] OpenAPI docs (non-production) and generated typed web client (Orval)
- [x] Health checks (liveness and readiness for 4 dependencies)
- [x] Prisma 7 with `pg_trgm`, `unaccent`, `pgcrypto` and Cyrillic search proven
- [x] BullMQ queues, separate worker entry point, Bull Board, retries, deterministic job IDs
- [x] Private file storage with presigned downloads
- [x] PDF engine with embedded Cyrillic fonts, tested visually
- [x] Email via queue with attachments from storage, tested in Mailpit
- [x] Design tokens, self-hosted fonts, app shell, base component set, style guide page
- [x] Bulgarian i18n with a lint rule against hardcoded text
- [x] PWA shell (installable, no caching of `/api` or `/admin`)
- [x] Production Docker images, compose stack, Caddy, migrate job, non-root containers
- [x] Testcontainers database test helper
- [x] CI workflow written (syntax validated)
- [x] Login, token rotation, lockout, default-deny guard, first admin CLI, session cleanup job
- [x] Audit log, hybrid actor context, CASL permissions, Журнал screen (Task 8)
- [ ] CI confirmed green on real GitHub
- [ ] Backups, monitoring, restricted DB role for audit table

---

## 5. Key decisions (so nobody re-argues them later)

| Decision | Why |
|---|---|
| One backend codebase with two entry points (API and worker) | Shared config, database and services; one image, two containers |
| pnpm with a 7-day `minimumReleaseAge`, pins instead of global exceptions | Protects against freshly published malicious package versions |
| Prisma 7.10.1 stable (not the 8 release candidate) | Stability |
| `@nestjs/jwt` with a custom guard, no Passport | Less adapter code on Fastify |
| Tokens only in httpOnly cookies; refresh tokens stored hashed and rotated | No token reachable from JavaScript |
| Default-deny on every route, enforced by a test | A forgotten route can never ship open |
| Audit by database triggers, append-only | No code path can forget or tamper |
| Job IDs joined with `_` | BullMQ only allows `:` with exactly 3 segments |
| Fonts embedded in PDFs as base64 | Cyrillic renders the same on any server |
| Actor context for audit: Prisma extension for single writes plus a required `transaction()` helper | Avoids fragile Proxy wrapping; lint rule bans raw `$transaction` |
| Gapless invoice numbers via a locked counter row, never a Postgres sequence | Sequences leave gaps on rollback |
| UUID v7 primary keys generated by the app | Offline-friendly later, sortable |
| Money as `NUMERIC(12,2)`, currency configurable (default EUR) | No float errors |
| Time stored in UTC, calculated in Europe/Sofia | Correct month boundaries |
| Email through the client's own SMTP, always via a queue | Provided by client; failures never block users |
| Garage for S3 storage behind an S3 abstraction | MinIO community edition was scaled back; easy to swap |

---

## 6. Open questions for the client

| # | Question | Status | Assumption until answered |
|---|---|---|---|
| 1 | How many office and field users? | [ ] open | up to 20 users |
| 2 | How many geographic areas; are employees tied to areas? | [ ] open | about 10 areas; yes, FIELD users are tied to areas |
| 3 | Accounting software integration needed? | [ ] open | not required |
| 4 | Fiscal device for cash payments? | [ ] open | not required |
| 5 | Printing in the field: mobile printer, email, or both? | [ ] open | email and PDF download |
| 6 | Approved templates for reports, invoices, agreements? | [ ] open | clean default templates |
| 7 | Offline operation needed? | [ ] open | no (optional module) |
| 8 | Automatic reminder emails to clients too? | [ ] open | off by default, per-client switch |
| 9 | How many years of history to migrate? | [ ] open | clients and sites only |
| 10 | Hosting and data ownership requirements? | [ ] open | EU VPS |
| 20 | Can a field employee record a payment before the invoice exists (prepayment), or is the payment always against an already-issued invoice? | [ ] open | always against an issued invoice; prepayment is a future feature |

Also to confirm with the client's accountant: invoice format and legal wording, VAT handling, rounding rule, currency handling for older documents.

---

## 7. Known issues and parking lot

| Item | Planned for |
|---|---|
| CI not yet confirmed on real GitHub | You, now |
| API Docker image is about 1 GB (too large) | Phase 13 |
| `nestjs-zod` declares support for Nest 10/11 only; we override the peer rule | Watch; first place to look if validation or Swagger acts oddly |
| ~~Bull Board uses temporary basic auth~~ | Resolved in Task 9 (`/api/admin/queues`, admin session) |
| Style guide design not yet reviewed by you | You, now |
| Real TLS, real SMTP not testable until deployment | Phase 13 |
| Audit table owner could drop the trigger (needs a restricted DB role) | Phase 13 |
| Gotenberg footer must stay minimal (large embedded fonts drop complex footers) | Accepted limitation |
| Login limit 10 per minute per IP; lockout after 10 failures; separate `TOO_MANY_REQUESTS` vs `ACCOUNT_LOCKED` | Done in Task 8 |
| Forgot-password email flow not built (admin resets passwords) | Decide after Task 9 |
| Retention policy for the audit log and email log | Phase 13 |
| Журнал filter bar is dense on 390px width | Polish later if needed |

---

## 8. Standing rules for every task

1. One task at a time. No work from later tasks.
2. Every task ends with evidence: tests, commands, screenshots, honest list of what could not be verified.
3. `pnpm lint`, `pnpm typecheck`, `pnpm test` and Playwright must pass before a task is accepted.
4. Every new screen follows the design rules: calm, simple, max 7 table columns, drawer for details, one primary button, status badges only for real statuses, all text in Bulgarian from translation files.
5. Every new table is audited (the guard test fails otherwise); every new route has an explicit permission (the default-deny test fails otherwise).
6. `minimumReleaseAge` is never disabled globally; every new pin is reported.
7. After each accepted task, update this file: flip the checkboxes, move "Where we are right now", and add decisions and issues.

---

## 9. Go-live checklist (Phase 13)

- [ ] Client signs off migrated data
- [ ] Full restore test of backups, documented
- [ ] Nightly backups of database and file storage, copied offsite in the EU
- [ ] Real domain with TLS tested
- [ ] Real SMTP tested (SPF, DKIM, DMARC set up by the client)
- [ ] Load test passed (5,000 sites, 50,000 visits, 20,000 invoices)
- [ ] Permission matrix tested for all three roles
- [ ] Restricted database role for the audit table
- [ ] Monitoring and error tracking in place
- [ ] API image slimmed down
- [ ] Bulgarian user guide and short training per role
- [ ] Production runbook (restore, rotate secrets, add users)
