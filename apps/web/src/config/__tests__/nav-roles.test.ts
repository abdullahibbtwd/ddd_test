import { Role } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import { canAccessPath, homePathForRole, navItemsForRole } from "@/config/nav";

describe("nav filtering by role", () => {
  it("ADMIN sees every item including settings", () => {
    const keys = navItemsForRole(Role.ADMIN).map((i) => i.key);
    expect(keys).toContain("settings");
    expect(keys).toContain("clients");
    expect(keys).toContain("visits");
    expect(homePathForRole(Role.ADMIN)).toBe("/");
  });

  it("OFFICE sees everything except settings", () => {
    const keys = navItemsForRole(Role.OFFICE).map((i) => i.key);
    expect(keys).not.toContain("settings");
    expect(keys).toContain("clients");
    expect(keys).toContain("reports");
    expect(canAccessPath(Role.OFFICE, "/settings")).toBe(false);
    expect(canAccessPath(Role.OFFICE, "/clients")).toBe(true);
  });

  it("FIELD sees only visits, invoices, payments", () => {
    const keys = navItemsForRole(Role.FIELD).map((i) => i.key);
    expect(keys.sort()).toEqual(["invoices", "payments", "visits"]);
    expect(homePathForRole(Role.FIELD)).toBe("/visits");
    expect(canAccessPath(Role.FIELD, "/settings")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/")).toBe(false);
    expect(canAccessPath(Role.FIELD, "/visits")).toBe(true);
  });
});
