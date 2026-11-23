const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FIELD_BACKDATE_DAYS = 7;
const FIELD_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function assertDate(value: string): void {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid date string: ${value}`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
}

/** Add n calendar days to a 'YYYY-MM-DD' string (UTC calendar arithmetic). */
export function addCalendarDays(date: string, days: number): string {
  assertDate(date);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * FIELD may set visit_date from today−7 through today (Sofia calendar dates).
 *
 * Role checks are NOT this helper's job — the API enforces FIELD vs OFFICE/ADMIN.
 * These helpers only answer the calendar/instant window questions for FIELD.
 */
export function canFieldUserDateVisit(
  visitDate: string,
  today: string,
): boolean {
  assertDate(visitDate);
  assertDate(today);
  if (visitDate > today) return false;
  const earliest = addCalendarDays(today, -FIELD_BACKDATE_DAYS);
  return visitDate >= earliest;
}

/**
 * FIELD may edit/cancel their own visit within 24 hours of created_at.
 * Uses absolute instant difference (DST-safe) — not local-date difference.
 *
 * Role / ownership checks are NOT this helper's job — the API enforces them.
 */
export function canFieldUserEditVisit(
  createdAtUtc: string,
  nowUtc: string,
): boolean {
  const created = Date.parse(createdAtUtc);
  const now = Date.parse(nowUtc);
  if (Number.isNaN(created) || Number.isNaN(now)) {
    throw new Error("Invalid ISO datetime");
  }
  const elapsed = now - created;
  return elapsed >= 0 && elapsed <= FIELD_EDIT_WINDOW_MS;
}

export const VisitWindowErrorCode = {
  VISIT_DATE_OUT_OF_WINDOW: "VISIT_DATE_OUT_OF_WINDOW",
  VISIT_EDIT_WINDOW_EXPIRED: "VISIT_EDIT_WINDOW_EXPIRED",
} as const;

export type VisitWindowErrorCode =
  (typeof VisitWindowErrorCode)[keyof typeof VisitWindowErrorCode];

/** Stable error code when FIELD visit_date is outside the 7-day back window. */
export function isFieldWindowErrorForDate(
  visitDate: string,
  today: string,
): typeof VisitWindowErrorCode.VISIT_DATE_OUT_OF_WINDOW | null {
  return canFieldUserDateVisit(visitDate, today)
    ? null
    : VisitWindowErrorCode.VISIT_DATE_OUT_OF_WINDOW;
}

/** Stable error code when FIELD edit/cancel is outside the 24-hour window. */
export function isFieldWindowErrorForEdit(
  createdAtUtc: string,
  nowUtc: string,
): typeof VisitWindowErrorCode.VISIT_EDIT_WINDOW_EXPIRED | null {
  return canFieldUserEditVisit(createdAtUtc, nowUtc)
    ? null
    : VisitWindowErrorCode.VISIT_EDIT_WINDOW_EXPIRED;
}

void MS_PER_DAY;
