# Food sampling (ХВП) — Task 19

## Schedule vs record

- **Schedule** (`food_sampling_schedules`): cadence_months (1–24) + `next_due_at`. Drives “due this month”. At most one **active** schedule per `(site_id, service_type)`.
- **Record** (`food_sample_records`): what actually happened. May exist without a schedule. No client-employee/sampler link in P10.

## Advancing next_due_at

AFTER INSERT on records with `schedule_id`: trigger sets `next_due_at = next_due_at + cadence_months`. The API does **not** double-update; the trigger is the truth.

## Result lifecycle

`PENDING` → `CONFORMING` / `NON_CONFORMING`. Non-PENDING requires `result_received_at`. Once set, the row is **frozen** (`FOOD_RECORD_FROZEN`). Optional `result_file_id` attachment.
