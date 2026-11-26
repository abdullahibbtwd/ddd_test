import { describe, expect, it } from "vitest";
import { nextSofia0700, NOTIFICATION_SWEEP_CRON, NOTIFICATION_SWEEP_TZ, sofiaWallClock } from "../src/processors/notification-schedule";

describe("notification sweep schedule", () => {
  it("cron is 07:00 and the timezone is Europe/Sofia explicitly", () => {
    expect(NOTIFICATION_SWEEP_CRON).toBe("0 7 * * *");
    expect(NOTIFICATION_SWEEP_TZ).toBe("Europe/Sofia");
  });

  it("resolves 07:00 Sofia regardless of the process timezone", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const morning = nextSofia0700(new Date("2026-06-15T03:00:00.000Z"));
      const after = nextSofia0700(new Date("2026-06-15T10:00:00.000Z"));
      const morningWall = sofiaWallClock(morning);
      const afterWall = sofiaWallClock(after);
      expect(morningWall).toMatchObject({ year: 2026, month: 6, day: 15, hour: 7, minute: 0 });
      expect(afterWall).toMatchObject({ year: 2026, month: 6, day: 16, hour: 7, minute: 0 });
      expect(sofiaWallClock(new Date("2026-03-29T01:30:00.000Z")).day).toBe(29);
      expect(sofiaWallClock(new Date("2026-10-25T00:30:00.000Z")).day).toBe(25);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
