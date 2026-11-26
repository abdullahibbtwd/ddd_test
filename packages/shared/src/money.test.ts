import { describe, expect, it } from "vitest";
import {
  computeLineTotal,
  computeVatAmount,
  EmptyInvoiceError,
  formatInvoiceNumber,
  roundHalfUp,
  sumLines,
  vatBreakdown,
} from "./money";

describe("roundHalfUp", () => {
  it("pads short fractions", () => {
    expect(roundHalfUp("1.2", 2)).toBe("1.20");
  });

  it("rounds 5 up (HALF_UP)", () => {
    expect(roundHalfUp("1.225", 2)).toBe("1.23");
    expect(roundHalfUp("1.215", 2)).toBe("1.22");
  });
});

describe("computeVatAmount", () => {
  it("100.00 @ 20% = 20.00", () => {
    expect(computeVatAmount("100.00", "20")).toBe("20.00");
    expect(computeVatAmount("100.00", "20.00")).toBe("20.00");
  });

  it("99.99 @ 20% = 20.00 (19.998 → HALF_UP)", () => {
    // 99.99 * 20 / 100 = 19.998 → HALF_UP → 20.00
    expect(computeVatAmount("99.99", "20")).toBe("20.00");
  });

  it("0.01 @ 20% = 0.00 (0.002 → HALF_UP)", () => {
    // 0.01 * 20 / 100 = 0.002 → HALF_UP → 0.00 (locks HALF_UP, not banker's)
    expect(computeVatAmount("0.01", "20")).toBe("0.00");
  });
});

describe("computeLineTotal", () => {
  it("3.333 × 12.50", () => {
    // 3.333 * 12.50 = 41.6625 → HALF_UP → 41.66
    expect(computeLineTotal("3.333", "12.50")).toBe("41.66");
  });
});

describe("sumLines", () => {
  it("sums mixed VAT rates (20%, 9%, 0%)", () => {
    const totals = sumLines([
      { amount: "100.00", vatRate: "20" },
      { amount: "50.00", vatRate: "9" },
      { amount: "25.00", vatRate: "0" },
    ]);
    expect(totals.net).toBe("175.00");
    expect(totals.vat).toBe("24.50"); // 20 + 4.50 + 0
    expect(totals.gross).toBe("199.50");
  });

  it("rejects empty lines with EMPTY_INVOICE", () => {
    expect(() => sumLines([])).toThrow(EmptyInvoiceError);
    try {
      sumLines([]);
    } catch (e) {
      expect(e).toBeInstanceOf(EmptyInvoiceError);
      expect((e as EmptyInvoiceError).code).toBe("EMPTY_INVOICE");
    }
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads to 10 digits", () => {
    expect(formatInvoiceNumber(1)).toBe("0000000001");
    expect(formatInvoiceNumber(42)).toBe("0000000042");
    expect(formatInvoiceNumber("123")).toBe("0000000123");
  });
});

describe("vatBreakdown", () => {
  it("groups two rates into two groups with correct sums", () => {
    const groups = vatBreakdown([
      { amount: "100.00", vatRate: "20" },
      { amount: "50.00", vatRate: "9" },
      { amount: "25.00", vatRate: "20.00" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ vatRate: "20.00", net: "125.00", vat: "25.00" });
    expect(groups[1]).toEqual({ vatRate: "9.00", net: "50.00", vat: "4.50" });
  });

  it("sums mixed rates correctly across three buckets", () => {
    const groups = vatBreakdown([
      { amount: "100.00", vatRate: "20" },
      { amount: "50.00", vatRate: "9" },
      { amount: "25.00", vatRate: "0" },
    ]);
    expect(groups).toHaveLength(3);
    const totalVat = groups.reduce((s, g) => s + Number(g.vat), 0);
    expect(totalVat.toFixed(2)).toBe("24.50");
  });
});
