/**
 * Convert a Prisma `@db.Date` value to a calendar 'YYYY-MM-DD' string.
 * Prisma returns Date at UTC midnight for DATE columns.
 */
export function dateToIsoDate(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse 'YYYY-MM-DD' into a UTC-midnight Date for Prisma DATE columns. */
export function isoDateToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
