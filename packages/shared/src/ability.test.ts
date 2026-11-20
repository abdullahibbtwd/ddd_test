import { subject } from "@casl/ability";
import { describe, expect, it } from "vitest";
import { defineAbilityFor, defineTestSiteAbility } from "./ability";
import { Role } from "./role";

describe("defineAbilityFor", () => {
  it("ADMIN can manage User, Area, AuditLog, Setting", () => {
    const ability = defineAbilityFor({ id: "1", role: Role.ADMIN });
    expect(ability.can("manage", "User")).toBe(true);
    expect(ability.can("read", "Area")).toBe(true);
    expect(ability.can("manage", "Area")).toBe(true);
    expect(ability.can("read", "AuditLog")).toBe(true);
    expect(ability.can("manage", "Setting")).toBe(true);
  });

  it("OFFICE can read Area but not User, AuditLog, Setting", () => {
    const ability = defineAbilityFor({ id: "2", role: Role.OFFICE });
    expect(ability.can("read", "Area")).toBe(true);
    expect(ability.can("manage", "Area")).toBe(false);
    expect(ability.can("read", "User")).toBe(false);
    expect(ability.can("read", "AuditLog")).toBe(false);
    expect(ability.can("manage", "Setting")).toBe(false);
  });

  it("FIELD can read only assigned areas", () => {
    const ability = defineAbilityFor({
      id: "3",
      role: Role.FIELD,
      areaIds: ["area-a", "area-b"],
    });
    expect(ability.can("read", subject("Area", { id: "area-a" }))).toBe(true);
    expect(ability.can("read", subject("Area", { id: "area-b" }))).toBe(true);
    expect(ability.can("read", subject("Area", { id: "area-c" }))).toBe(false);
    expect(ability.can("read", "User")).toBe(false);
    expect(ability.can("read", "AuditLog")).toBe(false);
    expect(ability.can("manage", "Setting")).toBe(false);
  });

  it("FIELD with no areas cannot read any Area instance", () => {
    const ability = defineAbilityFor({ id: "4", role: Role.FIELD, areaIds: [] });
    expect(ability.can("read", subject("Area", { id: "area-a" }))).toBe(false);
  });
});

describe("defineTestSiteAbility (condition proof)", () => {
  it("allows Site in own area and denies another", () => {
    const ability = defineTestSiteAbility(["area-a", "area-b"]);
    expect(ability.can("read", subject("Site", { areaId: "area-a" }))).toBe(true);
    expect(ability.can("read", subject("Site", { areaId: "area-b" }))).toBe(true);
    expect(ability.can("read", subject("Site", { areaId: "area-c" }))).toBe(false);
  });
});
