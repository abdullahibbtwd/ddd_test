import { describe, expect, it } from "vitest";
import { addMonths, monthOf } from "./dates";
import {
  computeScheduleStatus,
  ScheduleStatus,
} from "./schedule-status";
import { SubscriptionFrequency } from "./subscription-frequency";

function status(
  opts: Parameters<typeof computeScheduleStatus>[0],
) {
  return computeScheduleStatus(opts);
}

describe("computeScheduleStatus", () => {
  it("monthly, start 2026-01-15, no visits: asOf 2026-01-20 UPCOMING", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-15",
      endDate: null,
      doneVisitDates: [],
      asOf: "2026-01-20",
    });
    expect(r.status).toBe(ScheduleStatus.UPCOMING);
    expect(r.nextDueMonth).toBe("2026-01");
    expect(r.monthsOverdue).toBe(0);
  });

  it("monthly, no visits: asOf 2026-02-01 OVERDUE with monthsOverdue 1", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-15",
      endDate: null,
      doneVisitDates: [],
      asOf: "2026-02-01",
    });
    expect(r.status).toBe(ScheduleStatus.OVERDUE);
    expect(r.monthsOverdue).toBe(1);
    expect(r.nextDueMonth).toBe("2026-01");
  });

  it("monthly, visit 2026-01-25: asOf 2026-01-31 SERVICED (next 2026-02)", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-15",
      endDate: null,
      doneVisitDates: ["2026-01-25"],
      asOf: "2026-01-31",
    });
    expect(r.status).toBe(ScheduleStatus.SERVICED);
    expect(r.nextDueMonth).toBe("2026-02");
    expect(r.lastVisitDate).toBe("2026-01-25");
  });

  it("monthly, visit 2026-01-25: asOf 2026-02-10 UPCOMING", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-15",
      endDate: null,
      doneVisitDates: ["2026-01-25"],
      asOf: "2026-02-10",
    });
    expect(r.status).toBe(ScheduleStatus.UPCOMING);
    expect(r.nextDueMonth).toBe("2026-02");
  });

  it("monthly, visit 2026-01-25: asOf 2026-03-01 OVERDUE (1)", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-15",
      endDate: null,
      doneVisitDates: ["2026-01-25"],
      asOf: "2026-03-01",
    });
    expect(r.status).toBe(ScheduleStatus.OVERDUE);
    expect(r.monthsOverdue).toBe(1);
    expect(r.nextDueMonth).toBe("2026-02");
  });

  it("quarterly cases around visit 2026-02-05", () => {
    const base = {
      frequency: SubscriptionFrequency.QUARTERLY,
      startDate: "2026-01-10",
      endDate: null as string | null,
      doneVisitDates: ["2026-02-05"] as string[],
    };

    const feb = status({ ...base, asOf: "2026-02-20" });
    expect(feb.status).toBe(ScheduleStatus.SERVICED);
    expect(feb.nextDueMonth).toBe("2026-05");

    const mar = status({ ...base, asOf: "2026-03-15" });
    expect(mar.status).toBe(ScheduleStatus.NOT_DUE);
    expect(mar.nextDueMonth).toBe("2026-05");

    const may = status({ ...base, asOf: "2026-05-02" });
    expect(may.status).toBe(ScheduleStatus.UPCOMING);

    const jun = status({ ...base, asOf: "2026-06-02" });
    expect(jun.status).toBe(ScheduleStatus.OVERDUE);
    expect(jun.monthsOverdue).toBe(1);
  });

  it("every 2 months, visit 2026-11-30: asOf 2027-01-01 UPCOMING", () => {
    const r = status({
      frequency: SubscriptionFrequency.EVERY_2_MONTHS,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: ["2026-11-30"],
      asOf: "2027-01-01",
    });
    expect(r.status).toBe(ScheduleStatus.UPCOMING);
    expect(r.nextDueMonth).toBe("2027-01");
  });

  it("monthly year rollover: visit 2026-12-28, asOf 2027-01-05 UPCOMING", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: ["2026-12-28"],
      asOf: "2027-01-05",
    });
    expect(r.status).toBe(ScheduleStatus.UPCOMING);
    expect(r.nextDueMonth).toBe("2027-01");
  });

  it("early visit: quarterly visit in April when due in May → SERVICED next July", () => {
    const r = status({
      frequency: SubscriptionFrequency.QUARTERLY,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: ["2026-01-10", "2026-04-02"],
      asOf: "2026-04-10",
    });
    expect(r.status).toBe(ScheduleStatus.SERVICED);
    expect(r.nextDueMonth).toBe("2026-07");
  });

  it("start 2026-03-01: asOf 2026-02-28 NOT_STARTED", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-03-01",
      endDate: null,
      doneVisitDates: [],
      asOf: "2026-02-28",
    });
    expect(r.status).toBe(ScheduleStatus.NOT_STARTED);
  });

  it("end 2026-01-31: asOf 2026-01-31 still scheduled; asOf 2026-02-01 ENDED", () => {
    const still = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      doneVisitDates: [],
      asOf: "2026-01-31",
    });
    expect(still.status).not.toBe(ScheduleStatus.ENDED);
    expect([
      ScheduleStatus.UPCOMING,
      ScheduleStatus.OVERDUE,
      ScheduleStatus.SERVICED,
      ScheduleStatus.NOT_DUE,
    ]).toContain(still.status);

    const ended = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      doneVisitDates: [],
      asOf: "2026-02-01",
    });
    expect(ended.status).toBe(ScheduleStatus.ENDED);
  });

  it("visit after endDate or before startDate is ignored", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      doneVisitDates: ["2026-01-20", "2026-03-05"],
      asOf: "2026-03-10",
    });
    // Ended before March, so ENDED (endDate < first of March)
    expect(r.status).toBe(ScheduleStatus.ENDED);

    const inside = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-02-01",
      endDate: "2026-04-30",
      doneVisitDates: ["2026-01-20", "2026-03-05"],
      asOf: "2026-03-10",
    });
    expect(inside.lastVisitDate).toBe("2026-03-05");
    expect(inside.status).toBe(ScheduleStatus.SERVICED);
  });

  it("visit dated after asOf is ignored", () => {
    const r = status({
      frequency: SubscriptionFrequency.MONTHLY,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: ["2026-02-15"],
      asOf: "2026-02-10",
    });
    expect(r.lastVisitDate).toBeNull();
    expect(r.status).toBe(ScheduleStatus.OVERDUE);
  });

  it("ON_DEMAND with no visits is ON_DEMAND, never OVERDUE", () => {
    const r = status({
      frequency: SubscriptionFrequency.ON_DEMAND,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: [],
      asOf: "2026-06-01",
    });
    expect(r.status).toBe(ScheduleStatus.ON_DEMAND);
    expect(r.monthsOverdue).toBe(0);
    expect(r.nextDueMonth).toBeNull();
  });

  it("ON_DEMAND still returns lastVisitDate", () => {
    const r = status({
      frequency: SubscriptionFrequency.ON_DEMAND,
      startDate: "2026-01-01",
      endDate: null,
      doneVisitDates: ["2026-03-12"],
      asOf: "2026-06-01",
    });
    expect(r.status).toBe(ScheduleStatus.ON_DEMAND);
    expect(r.lastVisitDate).toBe("2026-03-12");
  });
});

describe("computeScheduleStatus randomized invariants", () => {
  /** Seeded LCG — deterministic across runs. */
  function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  function pickDate(rng: () => number, start: string, end: string): string {
    const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
    const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];
    const a = Date.UTC(sy, sm - 1, sd);
    const b = Date.UTC(ey, em - 1, ed);
    const t = a + Math.floor(rng() * ((b - a) / 86_400_000 + 1)) * 86_400_000;
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  const freqs = [
    SubscriptionFrequency.MONTHLY,
    SubscriptionFrequency.EVERY_2_MONTHS,
    SubscriptionFrequency.QUARTERLY,
  ] as const;

  const CASE_COUNT = 2000;
  const rng = makeRng(42);
  let cases = 0;

  it(`holds for ${CASE_COUNT} seeded cases`, () => {
    for (let i = 0; i < CASE_COUNT; i++) {
      const frequency = freqs[Math.floor(rng() * freqs.length)]!;
      const startDate = pickDate(rng, "2024-01-01", "2026-06-01");
      const hasEnd = rng() < 0.3;
      const endDate = hasEnd
        ? pickDate(rng, startDate, addMonths(monthOf(startDate), 18) + "-28")
        : null;
      const asOf = pickDate(rng, "2024-01-01", "2027-06-01");
      const visitCount = Math.floor(rng() * 6);
      const doneVisitDates: string[] = [];
      for (let v = 0; v < visitCount; v++) {
        doneVisitDates.push(pickDate(rng, "2023-12-01", "2027-07-01"));
      }

      const shuffled = [...doneVisitDates].sort(() => rng() - 0.5);
      const r1 = computeScheduleStatus({
        frequency,
        startDate,
        endDate,
        doneVisitDates,
        asOf,
      });
      const r2 = computeScheduleStatus({
        frequency,
        startDate,
        endDate,
        doneVisitDates: shuffled,
        asOf,
      });
      expect(r1).toEqual(r2);

      const M = monthOf(asOf);
      if (
        r1.status !== ScheduleStatus.NOT_STARTED &&
        r1.status !== ScheduleStatus.ENDED
      ) {
        const considered = doneVisitDates.filter((d) => {
          if (d < startDate || d > asOf) return false;
          if (endDate !== null && d > endDate) return false;
          return true;
        });
        const hasVisitInM = considered.some((d) => monthOf(d) === M);
        expect(r1.status === ScheduleStatus.SERVICED).toBe(hasVisitInM);

        if (r1.status === ScheduleStatus.OVERDUE) {
          expect(r1.nextDueMonth).not.toBeNull();
          expect(r1.nextDueMonth! < M).toBe(true);
        }
      }

      // Adding a considered visit in month M never makes status worse.
      const mid = `${M}-15`;
      const midConsidered =
        mid >= startDate &&
        mid <= asOf &&
        (endDate === null || mid <= endDate) &&
        r1.status !== ScheduleStatus.NOT_STARTED &&
        r1.status !== ScheduleStatus.ENDED;
      if (midConsidered) {
        const worseOrder: Record<string, number> = {
          [ScheduleStatus.SERVICED]: 0,
          [ScheduleStatus.UPCOMING]: 1,
          [ScheduleStatus.NOT_DUE]: 2,
          [ScheduleStatus.OVERDUE]: 3,
          [ScheduleStatus.ON_DEMAND]: 0,
          [ScheduleStatus.NOT_STARTED]: 4,
          [ScheduleStatus.ENDED]: 4,
        };
        const withVisit = computeScheduleStatus({
          frequency,
          startDate,
          endDate,
          doneVisitDates: [...doneVisitDates, mid],
          asOf,
        });
        expect(worseOrder[withVisit.status]!).toBeLessThanOrEqual(
          worseOrder[r1.status]!,
        );
      }

      cases += 1;
    }
    expect(cases).toBe(CASE_COUNT);
  });
});
