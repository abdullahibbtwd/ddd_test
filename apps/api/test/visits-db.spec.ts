import { createId } from "@ddcrm/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password";
import { startTestDb, type TestDb } from "./helpers/db";

describe("visits DB constraints", () => {
  let db: TestDb;
  let siteId: string;
  let userId: string;
  let user2Id: string;
  let subId: string;

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
    userId = createId();
    user2Id = createId();
    subId = createId();
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
    const passwordHash = await hashPassword("test-password-ok");
    await db.prisma.user.create({
      data: {
        id: userId,
        email: "v1@test.local",
        name: "V1",
        role: "OFFICE",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.user.create({
      data: {
        id: user2Id,
        email: "v2@test.local",
        name: "V2",
        role: "FIELD",
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await db.prisma.subscription.create({
      data: {
        id: subId,
        siteId,
        services: ["INSECT_CONTROL"],
        frequency: "MONTHLY",
        rate: 50,
        rateIncludesVat: true,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-06-30T00:00:00.000Z"),
      },
    });
  });

  async function insertVisitRaw(opts: {
    id?: string;
    visitDate: string;
    status?: string;
    cancelledAt?: string | null;
    cancelledBy?: string | null;
    cancelReason?: string | null;
    subscriptionId?: string | null;
    mutationId?: string;
    createdBy?: string;
    createdAt?: string;
  }) {
    const id = opts.id ?? createId();
    const mutationId = opts.mutationId ?? createId();
    const createdBy = opts.createdBy ?? userId;
    const status = opts.status ?? "ACTIVE";
    const cancelledAt =
      opts.cancelledAt === undefined
        ? "NULL"
        : opts.cancelledAt === null
          ? "NULL"
          : `'${opts.cancelledAt}'::timestamptz`;
    const cancelledBy =
      opts.cancelledBy === undefined
        ? "NULL"
        : opts.cancelledBy === null
          ? "NULL"
          : `'${opts.cancelledBy}'::uuid`;
    const cancelReason =
      opts.cancelReason === undefined
        ? "NULL"
        : opts.cancelReason === null
          ? "NULL"
          : `'${opts.cancelReason.replace(/'/g, "''")}'`;
    const sub =
      opts.subscriptionId === undefined
        ? "NULL"
        : opts.subscriptionId === null
          ? "NULL"
          : `'${opts.subscriptionId}'::uuid`;
    const createdAt = opts.createdAt ?? "NOW()";
    // eslint-disable-next-line no-restricted-syntax -- intentional: constraint tests bypass Prisma
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO visits (
        id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
        subscription_id, notes, status, cancelled_at, cancelled_by, cancel_reason,
        created_by, created_at, updated_at, client_mutation_id
      ) VALUES (
        '${id}'::uuid, '${siteId}'::uuid, '${opts.visitDate}'::date, 'INSECT_CONTROL',
        10.00, false, ${sub}, NULL, '${status}'::"VisitStatus",
        ${cancelledAt}, ${cancelledBy}, ${cancelReason},
        '${createdBy}'::uuid, ${createdAt}, NOW(), '${mutationId}'::uuid
      )
    `);
    return id;
  }

  it("rejects future visit_date via CHECK", async () => {
    await expect(
      insertVisitRaw({
        visitDate: "2099-01-01",
        createdAt: "TIMESTAMPTZ '2026-11-23 12:00:00+00'",
      }),
    ).rejects.toThrow(/visit_date_not_future|check/i);
  });

  it("rejects half-cancelled row via cancel-consistency CHECK", async () => {
    const visitId = createId();
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      db.prisma.$transaction(async (tx) => {
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visits (
            id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
            status, cancelled_at, cancelled_by, cancel_reason,
            created_by, created_at, updated_at, client_mutation_id
          ) VALUES (
            '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
            10.00, false, 'CANCELLED', '2026-11-01T12:00:00Z'::timestamptz,
            '${userId}'::uuid, NULL,
            '${userId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
          )
        `);
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
          VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${userId}'::uuid, 'LEAD')
        `);
      }),
    ).rejects.toThrow(/cancel_consistency|check/i);
  });

  it("fires unique (created_by, client_mutation_id)", async () => {
    const mutationId = createId();
    const visitId = createId();
    // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
    await db.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- intentional
      await tx.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
          10.00, false, 'ACTIVE', '${userId}'::uuid, NOW(), NOW(), '${mutationId}'::uuid
        )
      `);
      // eslint-disable-next-line no-restricted-syntax -- intentional
      await tx.$executeRawUnsafe(`
        INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
        VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${userId}'::uuid, 'LEAD')
      `);
    });
    await expect(insertVisitRaw({ visitDate: "2026-11-02", mutationId })).rejects.toThrow(
      /unique|client_mutation|duplicate/i,
    );
  });

  it("subscription-window trigger rejects visit_date outside subscription", async () => {
    await expect(
      insertVisitRaw({
        visitDate: "2026-08-01",
        subscriptionId: subId,
      }),
    ).rejects.toThrow(/visits_subscription_window|check/i);
  });

  it("exactly-one-LEAD trigger rejects zero LEAD", async () => {
    const visitId = createId();
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      db.prisma.$transaction(async (tx) => {
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visits (
            id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
            status, created_by, created_at, updated_at, client_mutation_id
          ) VALUES (
            '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
            10.00, false, 'ACTIVE', '${userId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
          )
        `);
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
          VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${userId}'::uuid, 'ASSIST')
        `);
      }),
    ).rejects.toThrow(/exactly one LEAD|visit_employees_lead|check/i);
  });

  it("exactly-one-LEAD trigger rejects two LEAD", async () => {
    const visitId = createId();
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
      db.prisma.$transaction(async (tx) => {
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visits (
            id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
            status, created_by, created_at, updated_at, client_mutation_id
          ) VALUES (
            '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
            10.00, false, 'ACTIVE', '${userId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
          )
        `);
        // eslint-disable-next-line no-restricted-syntax -- intentional
        await tx.$executeRawUnsafe(`
          INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit) VALUES
            ('${createId()}'::uuid, '${visitId}'::uuid, '${userId}'::uuid, 'LEAD'),
            ('${createId()}'::uuid, '${visitId}'::uuid, '${user2Id}'::uuid, 'LEAD')
        `);
      }),
    ).rejects.toThrow(/exactly one LEAD|visit_employees_lead|check/i);
  });

  it("visit_employees FK restrict prevents deleting a user on a visit", async () => {
    const visitId = createId();
    // eslint-disable-next-line no-restricted-syntax -- intentional: visit+employees same tx / constraint tests
    await db.prisma.$transaction(async (tx) => {
      // eslint-disable-next-line no-restricted-syntax -- intentional
      await tx.$executeRawUnsafe(`
        INSERT INTO visits (
          id, site_id, visit_date, treatment_type, charged_amount, rate_includes_vat,
          status, created_by, created_at, updated_at, client_mutation_id
        ) VALUES (
          '${visitId}'::uuid, '${siteId}'::uuid, '2026-11-01'::date, 'INSECT_CONTROL',
          10.00, false, 'ACTIVE', '${userId}'::uuid, NOW(), NOW(), '${createId()}'::uuid
        )
      `);
      // eslint-disable-next-line no-restricted-syntax -- intentional
      await tx.$executeRawUnsafe(`
        INSERT INTO visit_employees (id, visit_id, user_id, role_on_visit)
        VALUES ('${createId()}'::uuid, '${visitId}'::uuid, '${user2Id}'::uuid, 'LEAD')
      `);
    });
    await expect(db.prisma.user.delete({ where: { id: user2Id } })).rejects.toThrow(
      /foreign key|restrict|visit_employees/i,
    );
  });
});
