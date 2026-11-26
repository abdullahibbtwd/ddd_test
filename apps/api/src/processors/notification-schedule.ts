/**
 * Daily sweep fires at 07:00 Europe/Sofia via BullMQ's explicit `tz` option.
 * The process timezone is not consulted. `nextSofia0700` is the pure check
 * that a cron fire at minute 0 hour 7 in that zone is 07:00 Sofia wall time.
 */

export const NOTIFICATION_SWEEP_JOB = "notification-sweep-daily";
export const NOTIFICATION_EMAIL_JOB = "send-notification-email";
export const NOTIFICATION_SWEEP_CRON = "0 7 * * *";
export const NOTIFICATION_SWEEP_TZ = "Europe/Sofia";

const SOFIA = "Europe/Sofia";

export function sofiaWallClock(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SOFIA,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour: num("hour"),
    minute: num("minute"),
  };
}

/** Convert a Sofia wall-clock time to a UTC instant. Independent of process TZ. */
export function sofiaWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const wall = sofiaWallClock(utcGuess);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  return new Date(utcGuess.getTime() - (wallAsUtc - utcGuess.getTime()));
}

function addCalendarDaysUtc(year: number, month: number, day: number, days: number): {
  year: number;
  month: number;
  day: number;
} {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

/**
 * The next 07:00 Europe/Sofia at or after `now` is not the question —
 * this returns the 07:00 Sofia instant on the Sofia calendar day of `now`
 * when `now` is still before 07:00, otherwise 07:00 on the next Sofia day.
 * Used only to prove the cron zone. BullMQ itself schedules with `tz`.
 */
export function nextSofia0700(now: Date): Date {
  const wall = sofiaWallClock(now);
  // Before 07:00, or exactly 07:00: that Sofia morning. After 07:00: the next day.
  const target =
    wall.hour < 7 || (wall.hour === 7 && wall.minute === 0)
      ? { year: wall.year, month: wall.month, day: wall.day }
      : addCalendarDaysUtc(wall.year, wall.month, wall.day, 1);
  return sofiaWallToUtc(target.year, target.month, target.day, 7, 0);
}
