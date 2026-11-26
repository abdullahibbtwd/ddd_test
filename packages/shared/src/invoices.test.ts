import { describe, expect, it } from "vitest";
import {
  BatchCreateBodySchema,
  CreditNoteCreateBodySchema,
  CreateInvoiceBodySchema,
  DebitNoteCreateBodySchema,
  InvoiceListQuerySchema,
  IssueInvoiceBodySchema,
  UpdateInvoiceDraftBodySchema,
  assertCreditNoteLinesWithinOriginal,
  assertInvoiceHasLines,
  buildLineAmounts,
} from "./invoices";
import { EmptyInvoiceError, sumLines } from "./money";

describe("Invoice Zod schemas", () => {
  it("accepts create with clientId only (empty draft)", () => {
    const parsed = CreateInvoiceBodySchema.parse({
      clientId: "01900000-0000-7000-8000-000000000001",
    });
    expect(parsed.clientId).toBe("01900000-0000-7000-8000-000000000001");
    expect(parsed.lines).toBeUndefined();
  });

  it("accepts create with lines and visitIds", () => {
    const parsed = CreateInvoiceBodySchema.parse({
      clientId: "01900000-0000-7000-8000-000000000001",
      visitIds: ["01900000-0000-7000-8000-000000000002"],
      lines: [
        {
          description: "Дезинсекция",
          quantity: "1",
          unitPrice: "50.00",
          vatRate: "20",
        },
      ],
    });
    expect(parsed.lines).toHaveLength(1);
  });

  it("rejects update with no fields", () => {
    const result = UpdateInvoiceDraftBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts empty issue body", () => {
    expect(IssueInvoiceBodySchema.parse({})).toEqual({});
  });

  it("list filters coerce status", () => {
    const parsed = InvoiceListQuerySchema.parse({ status: "DRAFT", page: "1" });
    expect(parsed.status).toBe("DRAFT");
  });

  it("sumLines empty rejects at schema/helper level (EMPTY_INVOICE)", () => {
    expect(() => assertInvoiceHasLines([])).toThrow(EmptyInvoiceError);
    expect(() => sumLines([])).toThrow(EmptyInvoiceError);
  });

  it("buildLineAmounts uses HALF_UP helpers", () => {
    const amounts = buildLineAmounts({
      description: "x",
      quantity: "3.333",
      unitPrice: "12.50",
      vatRate: "20",
    });
    expect(amounts.lineTotal).toBe("41.66");
    expect(amounts.vatAmount).toBe("8.33"); // 41.66 * 0.2 = 8.332 → 8.33
  });

  it("creditNoteCreate requires reason length >= 3 and lines", () => {
    const ok = CreditNoteCreateBodySchema.parse({
      referencesInvoiceId: "01900000-0000-7000-8000-000000000001",
      lines: [
        {
          description: "Кредит",
          quantity: "1",
          unitPrice: "10.00",
          vatRate: "20",
        },
      ],
      reason: "грешка",
    });
    expect(ok.reason).toBe("грешка");
    expect(
      CreditNoteCreateBodySchema.safeParse({
        referencesInvoiceId: "01900000-0000-7000-8000-000000000001",
        lines: [
          {
            description: "Кредит",
            quantity: "1",
            unitPrice: "10.00",
            vatRate: "20",
          },
        ],
        reason: "ab",
      }).success,
    ).toBe(false);
  });

  it("debitNoteCreate allows optional reason", () => {
    const parsed = DebitNoteCreateBodySchema.parse({
      referencesInvoiceId: "01900000-0000-7000-8000-000000000001",
      lines: [
        {
          description: "Доплащане",
          quantity: "1",
          unitPrice: "5.00",
          vatRate: "20",
        },
      ],
    });
    expect(parsed.reason).toBeUndefined();
  });

  it("batchCreate validates YYYY-MM month", () => {
    expect(BatchCreateBodySchema.parse({ month: "2026-11" }).month).toBe("2026-11");
    expect(BatchCreateBodySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(BatchCreateBodySchema.safeParse({ month: "11-2026" }).success).toBe(false);
  });

  it("assertCreditNoteLinesWithinOriginal caps net at original", () => {
    expect(() =>
      assertCreditNoteLinesWithinOriginal(
        [{ description: "x", quantity: "1", unitPrice: "50.00", vatRate: "20" }],
        [{ lineTotal: "100.00", vatRate: "20.00" }],
      ),
    ).not.toThrow();
    expect(() =>
      assertCreditNoteLinesWithinOriginal(
        [{ description: "x", quantity: "1", unitPrice: "150.00", vatRate: "20" }],
        [{ lineTotal: "100.00", vatRate: "20.00" }],
      ),
    ).toThrow(/exceeds original/);
  });
});
