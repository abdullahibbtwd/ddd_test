import { describe, expect, it } from "vitest";
import {
  InvoiceStatus,
  assertInvoiceStatusTransition,
  canTransitionInvoiceStatus,
} from "./invoice-status";

describe("invoice status transitions", () => {
  it("allows DRAFT → ISSUED", () => {
    expect(
      canTransitionInvoiceStatus(InvoiceStatus.DRAFT, InvoiceStatus.ISSUED),
    ).toBe(true);
    expect(() =>
      assertInvoiceStatusTransition(InvoiceStatus.DRAFT, InvoiceStatus.ISSUED),
    ).not.toThrow();
  });

  it("allows ISSUED → CANCELLED_BY_CREDIT_NOTE only with credit note in same tx", () => {
    expect(
      canTransitionInvoiceStatus(
        InvoiceStatus.ISSUED,
        InvoiceStatus.CANCELLED_BY_CREDIT_NOTE,
      ),
    ).toBe(false);
    expect(
      canTransitionInvoiceStatus(
        InvoiceStatus.ISSUED,
        InvoiceStatus.CANCELLED_BY_CREDIT_NOTE,
        { hasCreditNoteInSameTx: true },
      ),
    ).toBe(true);
  });

  it("rejects all other transitions", () => {
    const cases: Array<[InvoiceStatus, InvoiceStatus]> = [
      [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED_BY_CREDIT_NOTE],
      [InvoiceStatus.ISSUED, InvoiceStatus.DRAFT],
      [InvoiceStatus.CANCELLED_BY_CREDIT_NOTE, InvoiceStatus.ISSUED],
      [InvoiceStatus.CANCELLED_BY_CREDIT_NOTE, InvoiceStatus.DRAFT],
      [InvoiceStatus.ISSUED, InvoiceStatus.ISSUED],
      [InvoiceStatus.DRAFT, InvoiceStatus.DRAFT],
    ];
    for (const [from, to] of cases) {
      expect(canTransitionInvoiceStatus(from, to)).toBe(false);
      expect(() => assertInvoiceStatusTransition(from, to)).toThrow(
        /Invalid invoice status transition/,
      );
    }
  });
});
