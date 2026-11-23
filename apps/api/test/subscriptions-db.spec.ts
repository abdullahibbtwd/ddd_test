import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "./helpers/db";

/**
 * Constraint tests that bypass the API and talk to Postgres directly.
 */
describe("subscriptions DB constraints", () => {
  let db: TestDb;
  let siteId: string;

  beforeAll(async () => {
    db = await startTestDb();
  }, 180_000);

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.resetDb();
    const areaId = createId();
    const clientId = createId();
    const typeId = createId();
    siteId = createId();
    await db.prisma.area.create({ data: { id: areaId, name: "A", isActive: true } });
    await db.prisma.client.create({
      data: {
        id: clientId,
        kind: "INDIVIDUAL",
        name: "Client",
        nameNormalized: "client",
        isActive: true,
      },
    });
    await db.prisma.siteType.create({
      data: { id: typeId, name: "Офис", isActive: true },
    });
    await db.prisma.site.create({
      data: {
        id: siteId,
        clientId,
        areaId,
        siteTypeId: typeId,
        name: "Site",
        address: "Addr",
        status: "ACTIVE",
      },
    });
  });

  async function insertRaw(opts: {
    id?: string;
    start: string;
    end: string | null;
    servicesSql?: string;
    rate?: string;
  }) {
    const id = opts.id ?? createId();
    const servicesSql = opts.servicesSql ?? `ARRAY['INSECT_CONTROL']::"ServiceType"[]`;
    const rate = opts.rate ?? "10.00";
    const endSql = opts.end === null ? "NULL" : `'${opts.end}'::date`;
    // eslint-disable-next-line no-restricted-syntax -- intentional: constraint tests bypass Prisma
    return db.prisma.$executeRawUnsafe(`
      INSERT INTO subscriptions (
        id, site_id, services, frequency, rate, rate_includes_vat,
        start_date, end_date, created_at, updated_at
      ) VALUES (
        '${id}'::uuid, '${siteId}'::uuid, ${servicesSql}, 'MONTHLY', ${rate}, false,
        '${opts.start}'::date, ${endSql}, NOW(), NOW()
      )
    `);
  }

  it("rejects overlapping insert via exclusion constraint", async () => {
    await insertRaw({ start: "2026-01-01", end: null });
    await expect(
      insertRaw({ start: "2026-02-01", end: "2026-03-01" }),
    ).rejects.toThrow(/exclusion|23P01|subscriptions_site_daterange_excl/i);
  });

  it("allows adjacent ranges", async () => {
    await insertRaw({ start: "2026-01-01", end: "2026-03-31" });
    await expect(insertRaw({ start: "2026-04-01", end: null })).resolves.toBeTruthy();
  });

  it("open-ended range conflicts with any later start", async () => {
    await insertRaw({ start: "2026-01-01", end: null });
    await expect(insertRaw({ start: "2026-06-01", end: "2026-07-01" })).rejects.toThrow(
      /exclusion|23P01|subscriptions_site_daterange_excl/i,
    );
  });

  it("rejects empty services array", async () => {
    await expect(
      insertRaw({
        start: "2026-01-01",
        end: null,
        servicesSql: `ARRAY[]::"ServiceType"[]`,
      }),
    ).rejects.toThrow(/services_nonempty|check/i);
  });

  it("rejects duplicate services", async () => {
    await expect(
      insertRaw({
        start: "2026-01-01",
        end: null,
        servicesSql: `ARRAY['INSECT_CONTROL','INSECT_CONTROL']::"ServiceType"[]`,
      }),
    ).rejects.toThrow(/services_unique|check|array_elements_are_unique/i);
  });

  it("rejects negative rate", async () => {
    await expect(
      insertRaw({ start: "2026-01-01", end: null, rate: "-1.00" }),
    ).rejects.toThrow(/rate_nonnegative|check/i);
  });

  it("rejects end before start", async () => {
    await expect(
      insertRaw({ start: "2026-03-01", end: "2026-02-01" }),
    ).rejects.toThrow(/end_after_start|check/i);
  });
});
