import { describe, expect, it } from "vitest";
import { formatIsoDate, formatMoney } from "../format";

describe("formatMoney", () => {
  it("formats EUR with bg-BG grouping", () => {
    const formatted = formatMoney(1250.5);
    expect(formatted).toMatch(/1.?250/);
    expect(formatted).toMatch(/50/);
    expect(formatted).toMatch(/€|EUR/);
  });
});

describe("formatIsoDate", () => {
  it("formats YYYY-MM-DD as dd.mm.yyyy", () => {
    expect(formatIsoDate("2026-01-15")).toBe("15.01.2026");
    expect(formatIsoDate("2027-12-01")).toBe("01.12.2027");
  });
});
