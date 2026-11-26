import { describe, expect, it } from "vitest";
import { InvoiceStatus } from "./invoice-status";
import { todayInSofia } from "./dates";
import {
  agingBuckets,
  AgingBucket,
  classifyInvoice,
  computeEmployeeCash,
  computeOutstanding,
  InvoicePaymentClassification,
} from "./payments";

describe("computeOutstanding", () => {
  it("returns gross when no payments", () => {
    expect(computeOutstanding("120.00", [])).toBe("120.00");
  });

  it("reduces with multiple partials", () => {
    expect(computeOutstanding("100.00", ["30.00", "20.50"])).toBe("49.50");
  });

  it("closes to 0.00 on exact pay", () => {
    expect(computeOutstanding("99.99", ["50.00", "49.99"])).toBe("0.00");
  });

  it("handles single full payment", () => {
    expect(computeOutstanding("250.00", ["250.00"])).toBe("0.00");
  });
});

describe("classifyInvoice", () => {
  const asOf = "2026-11-24";

  it("DRAFT", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.DRAFT,
        dueDate: null,
        outstanding: "10.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.DRAFT);
  });

  it("CANCELLED", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.CANCELLED_BY_CREDIT_NOTE,
        dueDate: "2026-11-01",
        outstanding: "10.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.CANCELLED);
  });

  it("PAID when outstanding is zero", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-10-01",
        outstanding: "0.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.PAID);
  });

  it("OVERDUE when dueDate < asOf and outstanding > 0", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-11-01",
        outstanding: "5.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.OVERDUE);
  });

  it("UNPAID_CURRENT when not yet due", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-12-01",
        outstanding: "5.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.UNPAID_CURRENT);
  });

  it("UNPAID_CURRENT when dueDate equals asOf (not yet overdue)", () => {
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: asOf,
        outstanding: "1.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.UNPAID_CURRENT);
  });
});

describe("agingBuckets", () => {
  it("0 days → 0_30", () => {
    expect(agingBuckets("2026-11-24", "2026-11-24")).toBe(AgingBucket["0_30"]);
  });

  it("30 days → 0_30", () => {
    expect(agingBuckets("2026-10-25", "2026-11-24")).toBe(AgingBucket["0_30"]);
  });

  it("31 days → 31_60", () => {
    expect(agingBuckets("2026-10-24", "2026-11-24")).toBe(AgingBucket["31_60"]);
  });

  it("60 days → 31_60", () => {
    expect(agingBuckets("2026-09-25", "2026-11-24")).toBe(AgingBucket["31_60"]);
  });

  it("61 days → 61_90", () => {
    expect(agingBuckets("2026-09-24", "2026-11-24")).toBe(AgingBucket["61_90"]);
  });

  it("90 days → 61_90", () => {
    expect(agingBuckets("2026-08-26", "2026-11-24")).toBe(AgingBucket["61_90"]);
  });

  it("91 days → 90_plus", () => {
    expect(agingBuckets("2026-08-25", "2026-11-24")).toBe(AgingBucket["90_plus"]);
  });
});

describe("computeEmployeeCash", () => {
  it("positive outstanding", () => {
    expect(
      computeEmployeeCash({ payments: ["100.00", "50.00"], handovers: ["80.00"] }),
    ).toEqual({
      collected: "150.00",
      handedOver: "80.00",
      outstanding: "70.00",
    });
  });

  it("zero outstanding (exact handover)", () => {
    expect(
      computeEmployeeCash({ payments: ["100.00"], handovers: ["100.00"] }),
    ).toEqual({
      collected: "100.00",
      handedOver: "100.00",
      outstanding: "0.00",
    });
  });

  it("negative outstanding (over-handed)", () => {
    expect(
      computeEmployeeCash({ payments: ["100.00"], handovers: ["120.00"] }),
    ).toEqual({
      collected: "100.00",
      handedOver: "120.00",
      outstanding: "-20.00",
    });
  });
});

describe("DST / Sofia midnight asOf", () => {
  it("asOf from todayInSofia is a DATE string with no timezone math in aging", () => {
    // Europe/Sofia spring-forward 2026-03-29 03:00 → 04:00.
    // Instant just after Sofia midnight on 2026-03-30 should yield that DATE.
    const justAfterMidnightUtc = new Date("2026-03-29T22:00:01.000Z"); // 00:00:01 Sofia (EEST)
    const asOf = todayInSofia(justAfterMidnightUtc);
    expect(asOf).toBe("2026-03-30");
    // agingBuckets uses calendar DATE arithmetic only.
    expect(agingBuckets("2026-03-01", asOf)).toBe(AgingBucket["0_30"]);
    expect(agingBuckets("2026-02-28", asOf)).toBe(AgingBucket["0_30"]);
  });

  it("classifyInvoice uses DATE comparison at Sofia midnight rollover", () => {
    const asOf = "2026-03-30";
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-03-29",
        outstanding: "1.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.OVERDUE);
    expect(
      classifyInvoice({
        status: InvoiceStatus.ISSUED,
        dueDate: "2026-03-30",
        outstanding: "1.00",
        asOf,
      }),
    ).toBe(InvoicePaymentClassification.UNPAID_CURRENT);
  });
});
