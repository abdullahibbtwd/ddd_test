# Scheduling («Този месец»)

This document is the business definition of how recurring site service is
planned and how the office sees coverage for a chosen month. Status is computed
once on the server by `computeScheduleStatus` in `@ddcrm/shared` and returned in
the list, summary, and calendar payloads. The web app does **not** re-implement
the rules.

## Dates

- All business dates are **calendar dates in Europe/Sofia**, stored as Postgres
  `DATE` (no timestamps).
- “Today” always means the Sofia calendar day (`todayInSofia`), never the
  server’s UTC date.
- Month filters and due months use `YYYY-MM`; visit dates use `YYYY-MM-DD`.
- For a viewed month, `asOf` is today clamped into that month
  (`[firstDayOfMonth, lastDayOfMonth]`).

## Subscriptions

- A site has **at most one subscription active on any given day**. History is
  kept: ended rows stay in the table. The database enforces non-overlapping
  inclusive date ranges (`EXCLUDE USING gist`).
- Frequencies: every month, every 2 months, every 3 months (quarterly), or
  on demand.
- Changing the rate affects **only future visits**. Past visits keep the charge
  they stored at save time.

## Rolling schedule (month level)

The next due month is counted from the **month of the last done visit**, not
from a fixed calendar grid.

- Only **ACTIVE** visits count. Cancelled visits are ignored by
  `computeScheduleStatus` (they never turn a site into SERVICED).
- If there has never been a visit, the first due month is the month of the
  subscription’s start date.
- **On demand** never becomes overdue; the engine reports ON_DEMAND (even if
  there was a visit this month — SERVICED does not override ON_DEMAND).

### Status meanings

| Status | Meaning |
|---|---|
| NOT_STARTED | Start month is after the month of “as of” |
| ENDED | End date is before the first day of the “as of” month (a subscription ending *inside* the month is still scheduled for that month) |
| ON_DEMAND | Frequency is on demand |
| SERVICED | There is a considered done visit in the “as of” month |
| UPCOMING | Next due month equals the “as of” month |
| OVERDUE | Next due month is before the “as of” month (`monthsOverdue` = difference) |
| NOT_DUE | Next due month is after the “as of” month |

## «Този месец» views (one endpoint family)

List, dashboard tiles, and calendar all share the same filter
`{ month, areaId?, employeeId? }` and the same scoped site set:

- `GET /api/scheduling/month` — paginated rows + summary counts
- `GET /api/scheduling/month/days` — per-day buckets for the calendar

There is **no separate dashboard route**. The summary strip on `/month` *is*
the dashboard. This screen is about **coverage**, not money: no revenue,
invoices, payments, or amounts.

### Sites without a subscription

A site with no subscription for the viewed month is a **data-quality** issue,
not a scheduling row. Those sites are **excluded from the list** and counted
separately as `summary.withoutSubscription`. The UI shows a muted line
«Без абонамент: N» linking to `/sites?hasSubscription=false`.

### Employee filter

A site matches employee **E** when:

1. **E is the LEAD** on the site’s most recent **ACTIVE** visit in the current
   Sofia month; or
2. if there is **no ACTIVE visit this month**, **E is `created_by`** of the
   site’s most recent ACTIVE visit ever.

ASSIST-only participation does **not** match. An out-of-scope `areaId` /
`employeeId` for a FIELD user returns an **empty result** (200), not 404 —
the filter is a preference, not a resource.

### Calendar semantics

For each day of the month:

- **Serviced** — site ids that have an ACTIVE visit **on that day** (and
  status SERVICED for the month).
- **Due (Предстоящи)** — every UPCOMING site for the month appears on
  **every day** of the month (so the calendar answers “what is due this
  month?” from any day).
- **Overdue** — every OVERDUE site likewise appears on **every day** of the
  month so overdue work stays visible.

Clicking a day opens a read-only drawer of site names. No drag-and-drop, no
creating visits from the calendar (creation stays on `/visits/new` from the
site drawer).

## Example cases (engine)

| Setup | asOf | Expected |
|---|---|---|
| Monthly, start 2026-01-15, no visits | 2026-01-20 | UPCOMING |
| Monthly, start 2026-01-15, no visits | 2026-02-01 | OVERDUE (1) |
| Monthly, visit 2026-01-25 | 2026-01-31 | SERVICED (next 2026-02) |
| Monthly, visit 2026-01-25 | 2026-02-10 | UPCOMING |
| Quarterly, start 2026-01-10, visit 2026-02-05 | 2026-05-02 | UPCOMING |
| Quarterly, start 2026-01-10, visit 2026-02-05 | 2026-06-02 | OVERDUE (1) |
| Start 2026-03-01 | 2026-02-28 | NOT_STARTED |
| End 2026-01-31 | 2026-02-01 | ENDED |
| ON_DEMAND, no visits | any later date | ON_DEMAND (never OVERDUE) |
| Monthly, only a cancelled visit this month | mid-month | UPCOMING (cancelled ignored) |

## Deliberately not modelled (yet)

- Pause / suspend of a subscription
- Separate schedules per service type
- Notifications / reminders
- Invoice generation from the schedule
- Editing visits from the calendar
