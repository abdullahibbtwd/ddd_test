import { describe, expect, it } from "vitest";
import { Role } from "../src/role";

/**
 * Prisma's Role enum must stay in lockstep with @ddcrm/shared Role.
 * The Prisma client is generated inside apps/api; we assert the shared
 * values here and a complementary API test imports the Prisma enum.
 */
describe("Role enum (shared)", () => {
  it("exposes ADMIN, OFFICE, FIELD", () => {
    expect(Object.values(Role).sort()).toEqual(["ADMIN", "FIELD", "OFFICE"]);
  });
});
