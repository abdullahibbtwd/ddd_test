import { subject } from "@casl/ability";
import { describe, expect, it } from "vitest";
import { defineAbilityFor } from "./ability";
import { Role } from "./role";

describe("defineAbilityFor", () => {
  it("ADMIN can manage User, Area, Client, Site, Subscription, Visit, SiteType, AuditLog, Setting", () => {
    const ability = defineAbilityFor({ id: "1", role: Role.ADMIN });
    expect(ability.can("manage", "User")).toBe(true);
    expect(ability.can("read", "Area")).toBe(true);
    expect(ability.can("manage", "Area")).toBe(true);
    expect(ability.can("manage", "Client")).toBe(true);
    expect(ability.can("manage", "Site")).toBe(true);
    expect(ability.can("manage", "Subscription")).toBe(true);
    expect(ability.can("manage", "Visit")).toBe(true);
    expect(ability.can("manage", "SiteType")).toBe(true);
    expect(ability.can("read", "AuditLog")).toBe(true);
    expect(ability.can("manage", "Setting")).toBe(true);
  });

  it("OFFICE can manage Client, Site, Subscription, Visit; read SiteType/User/Scheduling; not AuditLog/Setting", () => {
    const ability = defineAbilityFor({ id: "2", role: Role.OFFICE });
    expect(ability.can("read", "Area")).toBe(true);
    expect(ability.can("manage", "Area")).toBe(false);
    expect(ability.can("manage", "Client")).toBe(true);
    expect(ability.can("manage", "Site")).toBe(true);
    expect(ability.can("update", "Site")).toBe(true);
    expect(ability.can("manage", "Subscription")).toBe(true);
    expect(ability.can("manage", "Visit")).toBe(true);
    expect(ability.can("read", "SiteType")).toBe(true);
    expect(ability.can("manage", "SiteType")).toBe(false);
    expect(ability.can("read", "Scheduling")).toBe(true);
    expect(ability.can("read", "User")).toBe(true);
    expect(ability.can("manage", "User")).toBe(false);
    expect(ability.can("read", "AuditLog")).toBe(false);
    expect(ability.can("manage", "Setting")).toBe(false);
  });

  it("FIELD can read/create Site in assigned areas and quickCreate Client", () => {
    const ability = defineAbilityFor({
      id: "3",
      role: Role.FIELD,
      areaIds: ["area-a", "area-b"],
    });
    expect(ability.can("read", subject("Area", { id: "area-a" }))).toBe(true);
    expect(ability.can("read", subject("Area", { id: "area-c" }))).toBe(false);

    expect(ability.can("read", subject("Site", { areaId: "area-a" }))).toBe(true);
    expect(ability.can("create", subject("Site", { areaId: "area-b" }))).toBe(true);
    expect(ability.can("read", subject("Site", { areaId: "area-c" }))).toBe(false);
    expect(ability.can("create", subject("Site", { areaId: "area-c" }))).toBe(false);
    expect(ability.can("update", "Site")).toBe(false);
    expect(ability.can("delete", "Site")).toBe(false);

    expect(ability.can("read", "SiteType")).toBe(true);
    expect(ability.can("manage", "SiteType")).toBe(false);

    expect(ability.can("read", subject("Client", { siteAreaId: "area-a" }))).toBe(true);
    expect(ability.can("read", subject("Client", { siteAreaId: "area-c" }))).toBe(false);
    expect(ability.can("manage", "Client")).toBe(false);
    expect(ability.can("create", "Client")).toBe(false);
    expect(ability.can("quickCreate", "Client")).toBe(true);

    expect(ability.can("read", subject("Subscription", { siteAreaId: "area-a" }))).toBe(
      true,
    );
    expect(ability.can("read", subject("Subscription", { siteAreaId: "area-c" }))).toBe(
      false,
    );
    expect(ability.can("manage", "Subscription")).toBe(false);
    expect(ability.can("create", "Subscription")).toBe(false);

    expect(ability.can("read", subject("Visit", { siteAreaId: "area-a" }))).toBe(true);
    expect(ability.can("create", subject("Visit", { siteAreaId: "area-b" }))).toBe(true);
    expect(ability.can("update", subject("Visit", { siteAreaId: "area-a" }))).toBe(true);
    expect(ability.can("read", subject("Visit", { siteAreaId: "area-c" }))).toBe(false);
    expect(ability.can("create", subject("Visit", { siteAreaId: "area-c" }))).toBe(false);
    expect(ability.can("delete", "Visit")).toBe(false);
    expect(ability.can("read", "Scheduling")).toBe(true);

    expect(ability.can("read", "User")).toBe(false);
    expect(ability.can("read", "AuditLog")).toBe(false);
    expect(ability.can("manage", "Setting")).toBe(false);
  });

  it("FIELD with no areas cannot read any Site, Client, Subscription, or Visit instance", () => {
    const ability = defineAbilityFor({ id: "4", role: Role.FIELD, areaIds: [] });
    expect(ability.can("read", subject("Area", { id: "area-a" }))).toBe(false);
    expect(ability.can("read", subject("Site", { areaId: "area-a" }))).toBe(false);
    expect(ability.can("create", subject("Site", { areaId: "area-a" }))).toBe(false);
    expect(ability.can("read", subject("Client", { siteAreaId: "area-a" }))).toBe(false);
    expect(ability.can("read", subject("Subscription", { siteAreaId: "area-a" }))).toBe(
      false,
    );
    expect(ability.can("read", subject("Visit", { siteAreaId: "area-a" }))).toBe(false);
    expect(ability.can("create", subject("Visit", { siteAreaId: "area-a" }))).toBe(false);
    expect(ability.can("quickCreate", "Client")).toBe(true);
  });
});
