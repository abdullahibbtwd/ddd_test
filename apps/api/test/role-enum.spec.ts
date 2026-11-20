import { Role as SharedRole } from "@ddcrm/shared";
import { describe, expect, it } from "vitest";
import { Role as PrismaRole } from "../src/generated/prisma/client";

describe("Role enum parity", () => {
  it("Prisma Role values equal @ddcrm/shared Role values", () => {
    expect(Object.values(PrismaRole).sort()).toEqual(Object.values(SharedRole).sort());
    expect(PrismaRole.ADMIN).toBe(SharedRole.ADMIN);
    expect(PrismaRole.OFFICE).toBe(SharedRole.OFFICE);
    expect(PrismaRole.FIELD).toBe(SharedRole.FIELD);
  });
});
