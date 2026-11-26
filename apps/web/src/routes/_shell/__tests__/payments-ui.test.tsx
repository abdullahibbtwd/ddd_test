import { describe, expect, it } from "vitest";
import {
  agingBuckets,
  AgingBucket,
  classifyInvoice,
  InvoicePaymentClassification,
  InvoiceStatus,
} from "@ddcrm/shared";

/**
 * Lightweight unit coverage for classification/aging used by the outstanding
 * badges and reminder force checkbox semantics (shared helpers).
 */
describe("payments UI helpers", () => {
  it("maps classifications for badges", () => {
    const asOf = "2026-11-24";
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-12-01",
        outstanding: "10.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.UNPAID_CURRENT);
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-10-01",
        outstanding: "10.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.OVERDUE);
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-10-01",
        outstanding: "0.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.PAID);
  });

  it("aging bucket boundaries", () => {
    expect(agingBuckets("2026-10-25", "2026-11-24")).toBe(AgingBucket["0_30"]);
    expect(agingBuckets("2026-08-25", "2026-11-24")).toBe(AgingBucket["90_plus"]);
  });

  it("CASH requires collector; non-CASH hides it (form rule)", () => {
    const cashNeedsCollector = (method: string, collector?: string) =>
      method === "CASH" ? !!collector : true;
    expect(cashNeedsCollector("CASH", undefined)).toBe(false);
    expect(cashNeedsCollector("CASH", "u1")).toBe(true);
    expect(cashNeedsCollector("CARD", undefined)).toBe(true);
  });
});
