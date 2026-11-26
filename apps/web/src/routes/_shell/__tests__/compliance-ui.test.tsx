import {
  addCalendarMonths,
  AgreementStatus,
  CertificateStatus,
  certificateStatus,
  FoodResultStatus,
  todayInSofia,
} from "@ddcrm/shared";
import { describe, expect, it } from "vitest";

/** Mirrors StatusBadge variant mapping on /certificates. */
function certBadgeVariant(status: string | null | undefined) {
  if (status === CertificateStatus.CURRENT) return "ok";
  if (status === CertificateStatus.EXPIRING) return "warn";
  if (status === CertificateStatus.EXPIRED) return "bad";
  return "neutral";
}

/** Mirrors renew ConfirmDialog date defaults on /agreements. */
function renewDates(expiresAt: string, now = new Date()) {
  const signedAt = todayInSofia(now);
  return { signedAt, expiresAt: addCalendarMonths(expiresAt, 12) };
}

function eraseReasonValid(reason: string): boolean {
  return reason.trim().length >= 3;
}

function foodRecordWritable(resultStatus: string): boolean {
  return resultStatus === FoodResultStatus.PENDING;
}

describe("compliance UI helpers (Task 19)", () => {
  it("certificate status badges map CURRENT/EXPIRING/EXPIRED", () => {
    expect(certBadgeVariant(CertificateStatus.CURRENT)).toBe("ok");
    expect(certBadgeVariant(CertificateStatus.EXPIRING)).toBe("warn");
    expect(certBadgeVariant(CertificateStatus.EXPIRED)).toBe("bad");
    expect(certBadgeVariant(null)).toBe("neutral");
    expect(
      certificateStatus({ nextRenewalAt: "2026-12-25", asOf: "2026-11-25" }),
    ).toBe(CertificateStatus.EXPIRING);
  });

  it("agreement renewal ConfirmDialog dates = today + previous+1y", () => {
    const { signedAt, expiresAt } = renewDates(
      "2026-11-30",
      new Date("2026-11-25T10:00:00Z"),
    );
    expect(signedAt).toBe("2026-11-25");
    expect(expiresAt).toBe("2027-11-30");
    expect(AgreementStatus.RENEWED).toBe("RENEWED");
  });

  it("food record frozen when result_status != PENDING", () => {
    expect(foodRecordWritable(FoodResultStatus.PENDING)).toBe(true);
    expect(foodRecordWritable(FoodResultStatus.CONFORMING)).toBe(false);
    expect(foodRecordWritable(FoodResultStatus.NON_CONFORMING)).toBe(false);
  });

  it("erasure ConfirmDialog requires reason ≥ 3 chars", () => {
    expect(eraseReasonValid("")).toBe(false);
    expect(eraseReasonValid("ab")).toBe(false);
    expect(eraseReasonValid("  ab  ")).toBe(false);
    expect(eraseReasonValid("GDPR")).toBe(true);
  });
});
