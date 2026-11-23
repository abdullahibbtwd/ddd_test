import { describe, expect, it } from "vitest";
import {
  addMonths,
  firstDayOfMonth,
  frequencyMonths,
  lastDayOfMonth,
  monthDiff,
  monthOf,
  todayInSofia,
} from "./dates";
import { SubscriptionFrequency } from "./subscription-frequency";

describe("date helpers", () => {
  it("monthOf extracts YYYY-MM", () => {
    expect(monthOf("2026-01-15")).toBe("2026-01");
    expect(monthOf("2027-12-01")).toBe("2027-12");
  });

  it("addMonths rolls years", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", 0)).toBe("2026-01");
    expect(addMonths("2026-03", -1)).toBe("2026-02");
  });

  it("monthDiff is a − b in months", () => {
    expect(monthDiff("2026-03", "2026-01")).toBe(2);
    expect(monthDiff("2027-01", "2026-12")).toBe(1);
    expect(monthDiff("2026-01", "2026-01")).toBe(0);
  });

  it("first/last day of month", () => {
    expect(firstDayOfMonth("2026-02")).toBe("2026-02-01");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDayOfMonth("2026-01")).toBe("2026-01-31");
  });

  it("frequencyMonths", () => {
    expect(frequencyMonths(SubscriptionFrequency.MONTHLY)).toBe(1);
    expect(frequencyMonths(SubscriptionFrequency.EVERY_2_MONTHS)).toBe(2);
    expect(frequencyMonths(SubscriptionFrequency.QUARTERLY)).toBe(3);
    expect(frequencyMonths(SubscriptionFrequency.ON_DEMAND)).toBeNull();
  });

  describe("todayInSofia", () => {
    it("2026-12-31T22:30:00Z is 2027-01-01 in Sofia (winter UTC+2)", () => {
      expect(todayInSofia(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
    });

    it("2026-06-30T21:30:00Z is 2026-07-01 in Sofia (summer UTC+3)", () => {
      expect(todayInSofia(new Date("2026-06-30T21:30:00Z"))).toBe("2026-07-01");
    });

    it("around spring clock change 2026-03-29", () => {
      // Before change (still UTC+2): 00:30 Sofia on Mar 29
      expect(todayInSofia(new Date("2026-03-28T22:30:00Z"))).toBe("2026-03-29");
      // After change (UTC+3): 01:30 Sofia still Mar 29; 22:00 UTC = Mar 30 01:00 Sofia
      expect(todayInSofia(new Date("2026-03-29T22:00:00Z"))).toBe("2026-03-30");
    });

    it("around autumn clock change 2026-10-25", () => {
      // After fallback (UTC+2): 21:30 UTC = 23:30 Sofia Oct 25
      expect(todayInSofia(new Date("2026-10-25T21:30:00Z"))).toBe("2026-10-25");
      // 22:30 UTC = 00:30 Sofia Oct 26
      expect(todayInSofia(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-26");
      // Just before fallback still on summer time (UTC+3): 00:30 UTC = 03:30 Sofia Oct 25
      expect(todayInSofia(new Date("2026-10-25T00:30:00Z"))).toBe("2026-10-25");
    });
  });
});
