import { describe, expect, it } from "vitest";
import {
  ClientKind,
  CreateClientBodySchema,
  normalizeClientName,
  UpdateClientBodySchema,
} from "./clients";
import { ErrorCode } from "./errors";
import { PaymentMethod } from "./payment-method";

describe("normalizeClientName", () => {
  it("equates company name with and without ЕООД", () => {
    expect(normalizeClientName("РАМБО ЕООД")).toBe(normalizeClientName("Рамбо"));
  });

  it("strips Bulgarian quotes and punctuation", () => {
    expect(normalizeClientName('Ресторант „Златната ябълка“')).toBe(
      normalizeClientName("ресторант златната ябълка"),
    );
  });

  it("removes Latin legal-form look-alikes", () => {
    expect(normalizeClientName("Rambo EOOD")).toBe(normalizeClientName("Rambo"));
    expect(normalizeClientName("Acme OOD")).toBe(normalizeClientName("Acme"));
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeClientName("  Фокус   ООД  ")).toBe("фокус");
  });

  it("does not strip legal forms embedded in words", () => {
    expect(normalizeClientName("АДРЕС")).toBe("адрес");
  });
});

describe("CreateClientBodySchema", () => {
  it("requires EIK for COMPANY", () => {
    const result = CreateClientBodySchema.safeParse({
      kind: ClientKind.COMPANY,
      name: "Тест ООД",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid EIK with INVALID_EIK", () => {
    const result = CreateClientBodySchema.safeParse({
      kind: ClientKind.COMPANY,
      name: "Тест ООД",
      eik: "831641792",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === ErrorCode.INVALID_EIK)).toBe(true);
    }
  });

  it("accepts COMPANY with valid EIK and collapses name spaces", () => {
    const result = CreateClientBodySchema.safeParse({
      kind: ClientKind.COMPANY,
      name: "  Рамбо   ЕООД  ",
      eik: "831641791",
      vatNumber: "bg831641791",
      preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Рамбо ЕООД");
      expect(result.data.vatNumber).toBe("BG831641791");
    }
  });

  it("allows INDIVIDUAL without EIK", () => {
    const result = CreateClientBodySchema.safeParse({
      kind: ClientKind.INDIVIDUAL,
      name: "Иван Петров",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateClientBodySchema", () => {
  it("requires at least one field", () => {
    expect(UpdateClientBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts archive toggle alone", () => {
    expect(UpdateClientBodySchema.safeParse({ isActive: false }).success).toBe(true);
  });
});
