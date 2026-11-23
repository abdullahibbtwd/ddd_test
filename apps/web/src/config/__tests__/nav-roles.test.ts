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
    expect(keys).toContain("reports");
    expect(canAccessPath(Role.OFFICE, "/settings")).toBe(false);
    expect(canAccessPath(Role.OFFICE, "/clients")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/sites")).toBe(true);
    expect(canAccessPath(Role.OFFICE, "/month")).toBe(true);
  });

  it("FIELD sees sites, month, invoices, payments; home is /sites", () => {
    const keys = navItemsForRole(Role.FIELD).map((i) => i.key);
    expect(keys.sort()).toEqual(["invoices", "month", "payments", "sites"]);
    expect(homePathForRole(Role.FIELD)).toBe("/sites");
    expect(canAccessPath(Role.FIELD, "/settings")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/clients")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/sites")).toBe(true);
    expect(canAccessPath(Role.FIELD, "/month")).toBe(true);
  });
});
