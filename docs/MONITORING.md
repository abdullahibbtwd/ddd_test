# NEOT / POT monitoring (Phase 9 / Task 18)

## Model

Monitoring points are first-class rows in `monitoring_points` (`site_id`, `label`, `location`, `type` NEOT|POT, `active`). Labels are the office’s identifier (`UNIQUE (site_id, label)`).

There is **no** standalone inspection model — checks are **visit-scoped only** via `monitoring_point_checks` (`point_id`, `visit_id`, `checked_at`, `status`, optional `notes`).

## Reconcile helper

`reconcileMonitoringPointCount(currentRows, targetCount)` (shared) is deterministic:

- Active rows ordered by label
- Target > current → create `Точка N` placeholders (skip labels that already exist, including inactive)
- Target < current → deactivate trailing labels (never delete)
- Target = current → no-op (idempotent)

API: `POST /api/sites/:id/monitoring-points/reconcile` with `{ targetCount }`.

Site PATCH with `monitoringPointCount` also runs reconcile in the same logical flow. **The UI uses PATCH `/api/sites/:id`** (count field on the site drawer); the reconcile route is the explicit alternative.

## Count denormalization

`sites.monitoring_points_count` stays as a display convenience. An **AFTER INSERT/UPDATE/DELETE trigger** on `monitoring_points` keeps it in sync (active rows only) so it cannot drift from the service layer.

## Check statuses

`OK` | `ACTIVITY` | `DAMAGED` | `MISSING` | `OTHER`.

Editable while the visit’s invoice is DRAFT or absent; frozen when ISSUED (`23P04` → `POINT_CHECK_FROZEN`). Point must belong to the visit’s site (`23P05` → `POINT_NOT_IN_SITE`).

## Photos deferred

`monitoring_point_checks.photo_file_id` is nullable and **unused in P9**. No upload UI. The column exists so a future task can add photos without a migration.
