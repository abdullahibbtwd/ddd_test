import { SubscriptionFrequency } from "./subscription-frequency";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

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

function assertMonth(value: string): void {
  if (!MONTH_RE.test(value)) {
    throw new Error(`Invalid month string: ${value}`);
  }
  const [y, m] = value.split("-").map(Number) as [number, number];
  if (m < 1 || m > 12) {
    throw new Error(`Invalid month string: ${value}`);
  }
  void y;
}

/**
 * Calendar date in Europe/Sofia for the given instant.
 * Only helper that may depend on timezones.
 */
export function todayInSofia(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Failed to format Sofia date");
  }
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export function monthOf(date: string): string {
  assertDate(date);
  return date.slice(0, 7);
}

/** Add n calendar months to 'YYYY-MM'. */
export function addMonths(month: string, n: number): string {
  assertMonth(month);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

/**
 * Add n calendar months to a 'YYYY-MM-DD' date.
 * Day-of-month is clamped to the last day of the target month
 * (matches Postgres `date + n * interval '1 month'`).
 */
export function addCalendarMonths(date: string, n: number): string {
  assertDate(date);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const dd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Month difference: monthDiff(a, b) = months from b to a (a − b). */
export function monthDiff(a: string, b: string): number {
  assertMonth(a);
  assertMonth(b);
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return ay * 12 + (am - 1) - (by * 12 + (bm - 1));
}

export function firstDayOfMonth(month: string): string {
  assertMonth(month);
  return `${month}-01`;
}

export function lastDayOfMonth(month: string): string {
  assertMonth(month);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/**
 * Interval in months for a scheduled frequency.
 * ON_DEMAND has no interval.
 */
export function frequencyMonths(
  frequency: SubscriptionFrequency,
): number | null {
  switch (frequency) {
    case SubscriptionFrequency.MONTHLY:
      return 1;
    case SubscriptionFrequency.EVERY_2_MONTHS:
      return 2;
    case SubscriptionFrequency.QUARTERLY:
      return 3;
    case SubscriptionFrequency.ON_DEMAND:
      return null;
  }
}
