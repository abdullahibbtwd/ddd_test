import { createId, defineAbilityFor, Role } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import { accessibleAreaWhere } from "../src/auth/accessible-area-where";

describe("accessibleAreaWhere", () => {
  const userId = createId();

  it("ADMIN: unrestricted read scope (empty where)", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.ADMIN });
    expect(ability.can("manage", "Area")).toBe(true);
    expect(accessibleAreaWhere(ability)).toEqual({});
  });

  it("OFFICE: all active areas (empty where)", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.OFFICE });
    expect(ability.can("read", "Area")).toBe(true);
    expect(ability.can("manage", "Area")).toBe(false);
    expect(accessibleAreaWhere(ability)).toEqual({});
  });

  it("FIELD: scoped to assigned area ids", () => {
    const areaIds = [createId(), createId()];
    const ability = defineAbilityFor({ id: userId, role: Role.FIELD, areaIds });
    expect(ability.can("read", "Area")).toBe(true);
    expect(accessibleAreaWhere(ability)).toEqual({ id: { in: areaIds } });
  });

  it("FIELD with no assignments: fail-closed empty set", () => {
    const ability = defineAbilityFor({ id: userId, role: Role.FIELD, areaIds: [] });
    expect(accessibleAreaWhere(ability)).toEqual({ id: { in: [] } });
  });
});