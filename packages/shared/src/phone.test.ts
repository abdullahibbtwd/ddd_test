import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, PhoneValidationError } from "./phone";

describe("normalizePhone", () => {
  it("normalizes Bulgarian mobile with spaces", () => {
    expect(normalizePhone("0888 123 456")).toBe("+359888123456");
  });

  it("normalizes Bulgarian landline", () => {
    expect(normalizePhone("02 980 1234")).toBe("+35929801234");
  });

  it("accepts +359 form", () => {
    expect(normalizePhone("+359888123456")).toBe("+359888123456");
  });

  it("accepts 00359 form", () => {
    expect(normalizePhone("00359888123456")).toBe("+359888123456");
  });

  it("rejects garbage", () => {
    expect(() => normalizePhone("not-a-phone")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("123")).toThrow(PhoneValidationError);
    expect(() => normalizePhone("")).toThrow(PhoneValidationError);
  });
});

describe("formatPhone", () => {
  it("formats Bulgarian E.164 for display", () => {
    const formatted = formatPhone("+359888123456");
    expect(formatted.replace(/\s/g, "")).toContain("888");
    expect(formatted).not.toContain("+359");
  });

  it("rejects invalid E.164", () => {
    expect(() => formatPhone("garbage")).toThrow(PhoneValidationError);
  });
});
