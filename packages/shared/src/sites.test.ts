import { describe, expect, it } from "vitest";
import { CreateSiteBodySchema, UpdateSiteBodySchema } from "./sites";

describe("CreateSiteBodySchema", () => {
  const base = {
    areaId: "019a0000-0000-7000-8000-000000000001",
    siteTypeId: "019a0000-0000-7000-8000-000000000002",
    name: "  Обект   едно  ",
    address: "ул. Тест 1",
  };

  it("requires exactly one of clientId or newClient", () => {
    expect(CreateSiteBodySchema.safeParse(base).success).toBe(false);
    expect(
      CreateSiteBodySchema.safeParse({
        ...base,
        clientId: "019a0000-0000-7000-8000-000000000003",
        newClient: { kind: "COMPANY", name: "X", eik: "175074752" },
      }).success,
    ).toBe(false);
  });

  it("accepts clientId and collapses name whitespace", () => {
    const parsed = CreateSiteBodySchema.parse({
      ...base,
      clientId: "019a0000-0000-7000-8000-000000000003",
    });
    expect(parsed.name).toBe("Обект едно");
    expect(parsed.clientId).toBeDefined();
  });

  it("accepts newClient quick-add", () => {
    const parsed = CreateSiteBodySchema.parse({
      ...base,
      newClient: {
        kind: "COMPANY",
        name: "Нов клиент ООД",
        eik: "175074752",
        phone: "+359888123456",
      },
    });
    expect(parsed.newClient?.name).toBe("Нов клиент ООД");
  });

  it("rejects unpaired coordinates", () => {
    expect(
      CreateSiteBodySchema.safeParse({
        ...base,
        clientId: "019a0000-0000-7000-8000-000000000003",
        latitude: 42.7,
      }).success,
    ).toBe(false);
  });
});

describe("UpdateSiteBodySchema", () => {
  it("requires at least one field", () => {
    expect(UpdateSiteBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts status change", () => {
    expect(UpdateSiteBodySchema.parse({ status: "TERMINATED" }).status).toBe("TERMINATED");
  });
});
