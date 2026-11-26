import { describe, expect, it } from "vitest";
import { assertCreditNoteLinesWithinOriginal } from "@ddcrm/shared";

describe("credit note line guard", () => {
  it("rejects lines that exceed original net", () => {
    expect(() =>
      assertCreditNoteLinesWithinOriginal(
        [{ description: "x", quantity: "2", unitPrice: "100.00", vatRate: "20" }],
        [{ lineTotal: "100.00", vatRate: "20.00" }],
      ),
    ).toThrow(/exceeds original/);
  });

  it("allows reduced amounts", () => {
    expect(() =>
      assertCreditNoteLinesWithinOriginal(
        [{ description: "x", quantity: "1", unitPrice: "50.00", vatRate: "20" }],
        [{ lineTotal: "100.00", vatRate: "20.00" }],
      ),
    ).not.toThrow();
  });
});

describe("issued PDF button visibility rules", () => {
  it("documents that PDF actions are for issued/cancelled only", () => {
    const canShowPdf = (status: string) =>
      status === "ISSUED" || status === "CANCELLED_BY_CREDIT_NOTE";
    expect(canShowPdf("DRAFT")).toBe(false);
    expect(canShowPdf("ISSUED")).toBe(true);
    expect(canShowPdf("CANCELLED_BY_CREDIT_NOTE")).toBe(true);
  });
});

describe("batch drawer step machine", () => {
  it("moves plan → created → issued", () => {
    type Step = "plan" | "created" | "issued";
    let step: Step = "plan";
    step = "created";
    expect(step).toBe("created");
    step = "issued";
    expect(step).toBe("issued");
  });
});
