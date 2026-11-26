import { Role } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import { canAccessPath, homePathForRole, navItemsForRole } from "@/config/nav";

describe("nav filtering by role", () => {
  it("ADMIN sees every item including settings and sites", () => {
    const keys = navItemsForRole(Role.ADMIN).map((i) => i.key);
    expect(keys).toContain("settings");
    expect(keys).toContain("clients");
    expect(keys).toContain("sites");
    expect(keys).toContain("month");
    expect(homePathForRole(Role.ADMIN)).toBe("/");
  });

  it("OFFICE sees everything except settings", () => {
    const keys = navItemsForRole(Role.OFFICE).map((i) => i.key);
    expect(keys).not.toContain("settings");
    expect(keys).toContain("clients");
    expect(keys).toContain("sites");
    expect(keys).toContain("month");
    expect(keys).toContain("products");
    expect(keys).toContain("reports");
    expect(canAccessPath(Role.OFFICE, "/settings")).toBe(false);
    expect(canAccessPath(Role.OFFICE, "/clients")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/sites")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/month")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/products")).toBe(true);
  });

  it("FIELD sees dashboard, sites, month, cash; no invoices/payments/products; home is /", () => {
    const keys = navItemsForRole(Role.FIELD).map((i) => i.key);
    expect(keys.sort()).toEqual(["cash", "dashboard", "month", "sites"]);
    expect(homePathForRole(Role.FIELD)).toBe("/");
    expect(canAccessPath(Role.FIELD, "/settings")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/")).toBe(true);
    expect(canAccessPath(Role.FIELD, "/clients")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/sites")).toBe(true);
    expect(canAccessPath(Role.FIELD, "/month")).toBe(true);
    expect(canAccessPath(Role.FIELD, "/cash")).toBe(true);
    expect(canAccessPath(Role.FIELD, "/products")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/certificates")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/agreements")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/food")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/payments")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/invoices")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/invoices/new")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/invoices/abc")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/reports")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/reports/revenue")).toBe(false);
  });

  it("OFFICE can open invoices list and sub-routes", () => {
    expect(canAccessPath(Role.OFFICE, "/invoices")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/invoices/new")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/invoices/abc")).toBe(true);
  });

  it("OFFICE can open reports landing and kind routes", () => {
    expect(canAccessPath(Role.OFFICE, "/reports")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/reports/revenue")).toBe(true);
  });
});
