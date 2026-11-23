import { describe, expect, it } from "vitest";
import { validateEik, validateVatNumber } from "./eik";

/**
 * Public ЕИК vectors from:
 * - АППК списък на публичните предприятия (ЕИК 831641791 = „Информационно обслужване“ АД)
 * - svcs.bg ЕИК validator example 831641791
 * - GitHub midt-bg/sigma#252 (131268894 МЕДЕКС ООД; 240000000 second-weight path)
 * Checksums verified against the BULSTAT algorithm documented in docs/CLIENTS.md.
 */
const VALID_NINE = [
  "831641791", // Информационно обслужване АД (публичен списък / svcs.bg)
  "131268894", // МЕДЕКС ООД
  "175074752", // checksum-valid publicly circulated UIC
  "121031861", // АППК публични предприятия
  "240000000", // remainder-10 → second weights path
] as const;

const VALID_THIRTEEN = [
  "1312688940008", // branch of 131268894 (checksum-valid)
  "8316417910002", // branch of 831641791 (checksum-valid)
] as const;

describe("validateEik", () => {
  it.each(VALID_NINE)("accepts valid 9-digit EIK %s", (eik) => {
    expect(validateEik(eik)).toBe(true);
  });

  it.each(VALID_THIRTEEN)("accepts valid 13-digit EIK %s", (eik) => {
    expect(validateEik(eik)).toBe(true);
  });

  it.each([
    ["831641792", "altered last digit"],
    ["131268895", "altered last digit (МЕДЕКС twin)"],
    ["175074753", "altered last digit"],
    ["121031862", "altered last digit"],
    ["240000001", "altered last digit on r==10 path"],
  ] as const)("rejects invalid checksum %s (%s)", (eik, _reason) => {
    expect(validateEik(eik)).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateEik("12345678")).toBe(false);
    expect(validateEik("1234567890")).toBe(false);
    expect(validateEik("123456789012")).toBe(false);
    expect(validateEik("12345678901234")).toBe(false);
    expect(validateEik("")).toBe(false);
  });

  it("rejects non-digits", () => {
    expect(validateEik("83164179a")).toBe(false);
    expect(validateEik("83164179 ")).toBe(false);
    expect(validateEik("BG831641791")).toBe(false);
  });

  it("rejects 13-digit when parent 9 is invalid", () => {
    expect(validateEik("1312688950008")).toBe(false);
  });

  it("rejects 13-digit when branch check digit is wrong", () => {
    expect(validateEik("1312688940009")).toBe(false);
  });
});

describe("validateVatNumber", () => {
  it("accepts BG + 9 or 10 digits", () => {
    expect(validateVatNumber("BG831641791")).toBe(true);
    expect(validateVatNumber("BG8316417910")).toBe(true);
  });

  it("rejects lowercase, wrong prefix, wrong length", () => {
    expect(validateVatNumber("bg831641791")).toBe(false);
    expect(validateVatNumber("831641791")).toBe(false);
    expect(validateVatNumber("BG83164179")).toBe(false);
    expect(validateVatNumber("BG83164179101")).toBe(false);
  });
});
