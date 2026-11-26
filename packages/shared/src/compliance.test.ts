import { describe, expect, it } from "vitest";
import { AgreementStatus } from "./agreement-status";
import { CertificateStatus } from "./certificate-status";
import {
  agreementStatus,
  calendarDaysBetween,
  certificateStatus,
  expiresWithin,
  foodScheduleDue,
  redactPersonForField,
} from "./compliance";
import { addCalendarMonths, todayInSofia } from "./dates";

describe("certificateStatus", () => {
  const asOf = "2026-11-25";

  it("EXPIRED when nextRenewalAt < asOf (negative days)", () => {
    expect(
      certificateStatus({ nextRenewalAt: "2026-11-24", asOf }),
    ).toBe(CertificateStatus.EXPIRED);
    expect(
      certificateStatus({ nextRenewalAt: "2025-01-01", asOf }),
    ).toBe(CertificateStatus.EXPIRED);
  });

  it("EXPIRING at exactly 0 days (same day)", () => {
    expect(
      certificateStatus({ nextRenewalAt: asOf, asOf }),
    ).toBe(CertificateStatus.EXPIRING);
  });

  it("EXPIRING at exactly 30 days", () => {
    expect(
      certificateStatus({ nextRenewalAt: "2026-12-25", asOf }),
    ).toBe(CertificateStatus.EXPIRING);
  });

  it("EXPIRING at 29 days", () => {
    expect(
      certificateStatus({ nextRenewalAt: "2026-12-24", asOf }),
    ).toBe(CertificateStatus.EXPIRING);
  });

  it("CURRENT at 31 days", () => {
    expect(
      certificateStatus({ nextRenewalAt: "2026-12-26", asOf }),
    ).toBe(CertificateStatus.CURRENT);
  });
});

describe("agreementStatus (stored × calendar)", () => {
  const asOf = "2026-11-25";
  const future = "2027-01-01";
  const past = "2026-01-01";

  const stored = [
    AgreementStatus.ACTIVE,
    AgreementStatus.EXPIRED,
    AgreementStatus.TERMINATED,
    AgreementStatus.RENEWED,
  ] as const;

  for (const s of stored) {
    it(`stored ${s} + calendar future`, () => {
      const result = agreementStatus({
        expiresAt: future,
        storedStatus: s,
        asOf,
      });
      if (s === AgreementStatus.TERMINATED) {
        expect(result).toBe(AgreementStatus.TERMINATED);
      } else if (s === AgreementStatus.RENEWED) {
        expect(result).toBe(AgreementStatus.RENEWED);
      } else {
        expect(result).toBe(AgreementStatus.ACTIVE);
      }
    });

    it(`stored ${s} + calendar past`, () => {
      const result = agreementStatus({
        expiresAt: past,
        storedStatus: s,
        asOf,
      });
      if (s === AgreementStatus.TERMINATED) {
        expect(result).toBe(AgreementStatus.TERMINATED);
      } else if (s === AgreementStatus.RENEWED) {
        expect(result).toBe(AgreementStatus.RENEWED);
      } else {
        expect(result).toBe(AgreementStatus.EXPIRED);
      }
    });
  }
});

describe("foodScheduleDue", () => {
  it("not due when nextDueAt > asOf", () => {
    const r = foodScheduleDue({
      nextDueAt: "2026-12-01",
      cadenceMonths: 3,
      asOf: "2026-11-25",
    });
    expect(r.due).toBe(false);
    expect(r.nextDueAt).toBe("2027-03-01");
  });

  it("due when nextDueAt === asOf", () => {
    const r = foodScheduleDue({
      nextDueAt: "2026-11-25",
      cadenceMonths: 1,
      asOf: "2026-11-25",
    });
    expect(r.due).toBe(true);
    expect(r.nextDueAt).toBe("2026-12-25");
  });

  it("crosses month boundary Jan 31 + 1 month → Feb 28", () => {
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    const r = foodScheduleDue({
      nextDueAt: "2026-01-31",
      cadenceMonths: 1,
      asOf: "2026-02-01",
    });
    expect(r.due).toBe(true);
    expect(r.nextDueAt).toBe("2026-02-28");
  });

  it("leap year Feb 29 + 12 months → Feb 28 next year", () => {
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
    const r = foodScheduleDue({
      nextDueAt: "2024-02-29",
      cadenceMonths: 12,
      asOf: "2024-02-29",
    });
    expect(r.due).toBe(true);
    expect(r.nextDueAt).toBe("2025-02-28");
  });
});

describe("expiresWithin", () => {
  it("true on boundary days", () => {
    expect(
      expiresWithin({
        nextRenewalAt: "2026-12-25",
        asOf: "2026-11-25",
        days: 30,
      }),
    ).toBe(true);
  });

  it("false when past or beyond window", () => {
    expect(
      expiresWithin({
        nextRenewalAt: "2026-11-24",
        asOf: "2026-11-25",
        days: 30,
      }),
    ).toBe(false);
    expect(
      expiresWithin({
        expiresAt: "2026-12-26",
        asOf: "2026-11-25",
        days: 30,
      }),
    ).toBe(false);
  });
});

describe("redactPersonForField", () => {
  it("keeps name and redacts job title", () => {
    expect(
      redactPersonForField({ fullName: "Иван Петров", jobTitle: "Готвач" }),
    ).toEqual({ fullName: "Иван Петров", jobTitle: "[скрито]" });
    expect(
      redactPersonForField({ fullName: "Мария", jobTitle: null }),
    ).toEqual({ fullName: "Мария", jobTitle: "[скрито]" });
  });
});

describe("DST safety (asOf is a DATE string; helpers stay pure)", () => {
  it("calendarDaysBetween is calendar arithmetic, not wall-clock", () => {
    // Sofia DST spring forward 2026-03-29; date strings still differ by 1 day.
    expect(calendarDaysBetween("2026-03-28", "2026-03-29")).toBe(1);
    expect(calendarDaysBetween("2026-03-29", "2026-03-30")).toBe(1);
  });

  it("todayInSofia is for call sites — helpers take asOf, not Date", () => {
    const asOf = todayInSofia(new Date("2026-03-29T01:30:00Z"));
    expect(DATE_LIKE(asOf)).toBe(true);
    // Certificate helper does not call todayInSofia internally.
    expect(
      certificateStatus({ nextRenewalAt: asOf, asOf }),
    ).toBe(CertificateStatus.EXPIRING);
  });
});

function DATE_LIKE(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
